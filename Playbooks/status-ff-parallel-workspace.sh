#!/usr/bin/env bash
# ============================================================
#  查看 ff 并行工作区状态 (自动化调度模式)
# ============================================================
#  用法:  bash status-ff-parallel-workspace.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

MAIN_CONTROL_SESSION="main-control"
LINGGEN_SESSION="linggen"
WATCHER_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/dispatch-watcher.pid"
SYNC_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/main-control-sync.pid"
SCHEDULER_STATE_JSON="$PROJECT_ROOT/share/scheduler-state.json"
SCHEDULER_POLICY_JSON="$PROJECT_ROOT/share/scheduler-policy.json"
STATUS_FILE="$PROJECT_ROOT/share/sources/newfee/chain-status.json"
LATEST_HANDOFF_FILE="$PROJECT_ROOT/Sessions/LATEST.md"
HANDOFF_SCRIPT="$PROJECT_ROOT/Playbooks/handoff-main-control.sh"
ROTATE_SCRIPT="$PROJECT_ROOT/Playbooks/rotate-main-control-session.sh"

VAULT="${VAULT:-$(cd "$PROJECT_ROOT/../.." && pwd)}"
CHAIN_NAMES_FILE="$PROJECT_ROOT/share/sources/newfee/chinese-chain-names.json"
WATCHER_COMMAND_HINT="dispatch-watcher.sh"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

# 基础 session 状态
SESSIONS=("$MAIN_CONTROL_SESSION" "$LINGGEN_SESSION")

RUNNING_COUNT=0
TOTAL_COUNT=${#SESSIONS[@]}
RUNNING_SESSIONS=()
STOPPED_SESSIONS=()
COMPLETED_KEPT_COUNT=0
COMPLETED_IDLE_COUNT=0
BLOCKED_COUNT=0
ROLLBACK_COUNT=0
PENDING_COUNT=0
PINNED_COUNT=0
PENDING_NO_SESSION=()

list_valid_chain_sessions() {
    tmux ls 2>/dev/null | awk -F ':' '$1 ~ /^chain-./ {print $1}' | sort || true
}

extract_newfee_chain_id() {
    local session_name="$1"
    local remainder="${session_name#chain-}"
    if [[ "$session_name" != chain-* ]]; then
        return 1
    fi
    if [[ "$remainder" == newfee-* ]]; then
        printf '%s\n' "${remainder#newfee-}"
        return 0
    fi
    if [[ "$remainder" == *-* ]]; then
        return 1
    fi
    printf '%s\n' "$remainder"
}

INVALID_CHAIN_SESSIONS=$(tmux ls 2>/dev/null | awk -F ':' '$1 == "chain-" {print $1}' | sort || true)

read_scheduler_state() {
    SCHEDULER_STATE_JSON="$SCHEDULER_STATE_JSON" python3 <<'PY'
import json
import os

path = os.environ['SCHEDULER_STATE_JSON']
if not os.path.exists(path):
    print('state_file=missing')
    print('desired_state=')
    print('updated_at=')
    print('updated_by=')
else:
    try:
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
    except Exception:
        print('state_file=unreadable')
        print('desired_state=')
        print('updated_at=')
        print('updated_by=')
    else:
        desired_state = data.get('desiredState', '')
        updated_at = data.get('updatedAt', '')
        updated_by = data.get('updatedBy', '')
        if not isinstance(desired_state, str):
            desired_state = ''
        if not isinstance(updated_at, str):
            updated_at = ''
        if not isinstance(updated_by, str):
            updated_by = ''
        print('state_file=present')
        print(f'desired_state={desired_state}')
        print(f'updated_at={updated_at}')
        print(f'updated_by={updated_by}')
PY
}

is_watcher_pid() {
    local pid="$1"
    [[ -n "$pid" ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    local command
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    [[ "$command" == *"$WATCHER_COMMAND_HINT"* ]]
}

get_chain_runtime_snapshot() {
    local chain_id="$1"
    python3 - <<PY
import sys
from pathlib import Path

sys.path.insert(0, "$VAULT/Projects/飞枢系统/share")
import runtime_sync

chain_id = "$chain_id"
status = runtime_sync.load_json(Path("$STATUS_FILE"), {})
policy = runtime_sync.resolve_scheduler_policy(Path("$SCHEDULER_POLICY_JSON"))

print(f"stage={runtime_sync.get_chain_stage(chain_id, status)}")
print(f"blocked={'1' if runtime_sync.is_chain_blocked(chain_id, status) else '0'}")
print(f"rollback={'1' if runtime_sync.is_chain_rollback(chain_id, status) else '0'}")
print(f"pinned={'1' if runtime_sync.is_temporarily_pinned_chain(chain_id, policy) else '0'}")
PY
}

get_scheduler_runtime_snapshot() {
    python3 - <<PY
import sys
from pathlib import Path

sys.path.insert(0, "$VAULT/Projects/飞枢系统/share")
import runtime_sync

queue = runtime_sync.load_json(Path("$VAULT/Projects/飞枢系统/share/sources/newfee/dispatch-queue.json"), {"maxConcurrent": 2, "pendingStart": [], "updatedAt": ""})
status = runtime_sync.load_json(Path("$STATUS_FILE"), {})
policy = runtime_sync.resolve_scheduler_policy(Path("$SCHEDULER_POLICY_JSON"))
sessions = [item for item in """$CHAIN_SESSIONS""".split() if item]
effective_active = runtime_sync.get_effective_active_sessions(sessions, status, policy)
pinned_running = runtime_sync.get_running_pinned_chain_ids(sessions, status, policy)

print(f"policy_max={policy.get('maxConcurrent', 2)}")
print("policy_pinned=" + ",".join(policy.get('temporaryPinnedChains', [])))
print(f"policy_consume_slots={str(bool(policy.get('pinnedChainsConsumeSlots', False))).lower()}")
print(f"effective_active={len(effective_active)}")
print("pinned_running=" + ",".join(pinned_running))
print(f"queue_pending_count={len(queue.get('pendingStart', []))}")
print("queue_pending_list=" + ",".join(queue.get('pendingStart', [])[:5]))
print(f"queue_updated_at={queue.get('updatedAt', '')}")
PY
}

echo -e "${CYAN}ff 并行会话状态:${NC}"

# 基础 session 状态
echo ""
echo -e "${CYAN}┌─ 基础设施会话:${NC}"
for session in "${SESSIONS[@]}"; do
    if tmux has-session -t "$session" 2>/dev/null; then
        RUNNING_COUNT=$((RUNNING_COUNT + 1))
        RUNNING_SESSIONS+=("$session")
        DIR=$(tmux display-message -p -t "$session" "#{session_path}" 2>/dev/null || echo "-/-")
        echo -e "  ${GREEN}[RUNNING]${NC}  $session -> $DIR"
    else
        STOPPED_SESSIONS+=("$session")
        echo -e "  ${RED}[STOPPED]${NC}   $session"
    fi
done

# 动态 chain session
echo ""
echo -e "${CYAN}├─ 动态业务链会话:${NC}"
CHAIN_SESSIONS=""
if command -v tmux >/dev/null 2>&1; then
    CHAIN_SESSIONS=$(list_valid_chain_sessions)
    if [[ -n "$CHAIN_SESSIONS" ]]; then
        COUNT=0
        for session in $CHAIN_SESSIONS; do
            COUNT=$((COUNT + 1))
            if tmux has-session -t "$session" 2>/dev/null; then
                CHAIN_ID=$(extract_newfee_chain_id "$session" || true)
                [[ -z "$CHAIN_ID" ]] && continue
                STAGE="S1"
                BLOCKED="0"
                ROLLBACK="0"
                PINNED="0"
                while IFS= read -r runtime_field; do
                    case "$runtime_field" in
                        stage=*) STAGE="${runtime_field#stage=}" ;;
                        blocked=*) BLOCKED="${runtime_field#blocked=}" ;;
                        rollback=*) ROLLBACK="${runtime_field#rollback=}" ;;
                        pinned=*) PINNED="${runtime_field#pinned=}" ;;
                    esac
                done <<< "$(get_chain_runtime_snapshot "$CHAIN_ID")"
                ATTACHED=$(tmux list-clients -t "$session" 2>/dev/null | wc -l | tr -d ' ')
                DIR=$(tmux display-message -p -t "$session" "#{session_path}" 2>/dev/null || echo "-/-")
                if [[ "$ROLLBACK" == "1" ]]; then
                    ROLLBACK_COUNT=$((ROLLBACK_COUNT + 1))
                    echo -e "  ${YELLOW}[ROLLBACK]${NC}  $session -> $DIR"
                elif [[ "$BLOCKED" == "1" ]]; then
                    BLOCKED_COUNT=$((BLOCKED_COUNT + 1))
                    echo -e "  ${YELLOW}[BLOCKED]${NC}  $session -> $DIR"
                elif [[ "$STAGE" == "PENDING" ]]; then
                    PENDING_COUNT=$((PENDING_COUNT + 1))
                    echo -e "  ${YELLOW}[PENDING]${NC}  $session -> $DIR"
                elif [[ "$PINNED" == "1" ]]; then
                    PINNED_COUNT=$((PINNED_COUNT + 1))
                    echo -e "  ${CYAN}[PINNED-${STAGE}]${NC}  $session -> $DIR"
                elif [[ "$STAGE" == "S5" ]]; then
                    if [[ "$ATTACHED" -gt 0 ]]; then
                        COMPLETED_KEPT_COUNT=$((COMPLETED_KEPT_COUNT + 1))
                        echo -e "  ${YELLOW}[COMPLETED-KEPT]${NC}  $session -> $DIR"
                    else
                        COMPLETED_IDLE_COUNT=$((COMPLETED_IDLE_COUNT + 1))
                        echo -e "  ${YELLOW}[COMPLETED-IDLE]${NC}  $session -> $DIR"
                    fi
                else
                    RUNNING_COUNT=$((RUNNING_COUNT + 1))
                    RUNNING_SESSIONS+=("$session")
                    echo -e "  ${GREEN}[RUNNING]${NC}  $session -> $DIR"
                fi
            else
                STOPPED_SESSIONS+=("$session")
                echo -e "  ${RED}[STOPPED]${NC}   $session"
            fi
        done
        echo -e "  ${CYAN}├── 共 $COUNT 个动态会话${NC}"
    else
        echo -e "  ${YELLOW}[空闲]${NC}   暂无动态业务链活动"
        echo -e "  ${CYAN}├── 会根据 dispatch queue 自动启动${NC}"
    fi
else
    echo -e "  ${RED}[ERROR]${NC}   未安装 tmux 或无法获取会话列表"
fi

if [[ -n "$INVALID_CHAIN_SESSIONS" ]]; then
    echo -e "  ${YELLOW}[WARN]${NC}  检测到无效业务链 session：$INVALID_CHAIN_SESSIONS"
fi

PENDING_NO_SESSION_OUTPUT=$(python3 - <<PY
import json
from pathlib import Path

status_path = Path("$STATUS_FILE")
pending = []
sessions = set("""$CHAIN_SESSIONS""".split())
chain_session_ids = set()
for session_name in sessions:
    remainder = session_name.removeprefix('chain-')
    if session_name.startswith('chain-newfee-'):
        chain_session_ids.add(remainder.removeprefix('newfee-'))
    elif session_name.startswith('chain-') and '-' not in remainder:
        chain_session_ids.add(remainder)
if status_path.exists():
    try:
        data = json.loads(status_path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    for chain_id, meta in data.items():
        if meta.get("stage") == "PENDING" and chain_id not in chain_session_ids:
            pending.append(chain_id)
print("\n".join(pending))
PY
)

if [[ -n "$PENDING_NO_SESSION_OUTPUT" ]]; then
    echo -e "  ${CYAN}├─ 挂起但无会话:${NC}"
    while IFS= read -r chain_id; do
        [[ -z "$chain_id" ]] && continue
        PENDING_COUNT=$((PENDING_COUNT + 1))
        PENDING_NO_SESSION+=("$chain_id")
        echo -e "  ${YELLOW}[PENDING-NO-SESSION]${NC}  chain-$chain_id"
    done <<< "$PENDING_NO_SESSION_OUTPUT"
fi

POLICY_MAX="2"
POLICY_PINNED=""
POLICY_CONSUME_SLOTS="false"
EFFECTIVE_ACTIVE="0"
PINNED_RUNNING=""
QUEUE_PENDING_COUNT="0"
QUEUE_PENDING_LIST=""
QUEUE_UPDATED_AT=""
while IFS= read -r scheduler_runtime_field; do
    case "$scheduler_runtime_field" in
        policy_max=*) POLICY_MAX="${scheduler_runtime_field#policy_max=}" ;;
        policy_pinned=*) POLICY_PINNED="${scheduler_runtime_field#policy_pinned=}" ;;
        policy_consume_slots=*) POLICY_CONSUME_SLOTS="${scheduler_runtime_field#policy_consume_slots=}" ;;
        effective_active=*) EFFECTIVE_ACTIVE="${scheduler_runtime_field#effective_active=}" ;;
        pinned_running=*) PINNED_RUNNING="${scheduler_runtime_field#pinned_running=}" ;;
        queue_pending_count=*) QUEUE_PENDING_COUNT="${scheduler_runtime_field#queue_pending_count=}" ;;
        queue_pending_list=*) QUEUE_PENDING_LIST="${scheduler_runtime_field#queue_pending_list=}" ;;
        queue_updated_at=*) QUEUE_UPDATED_AT="${scheduler_runtime_field#queue_updated_at=}" ;;
    esac
done <<< "$(get_scheduler_runtime_snapshot)"

# 调度器状态
echo ""
echo -e "${CYAN}├─ 自动调度器:${NC}"
SCHEDULER_STATE_FILE_STATUS="missing"
SCHEDULER_DESIRED_STATE=""
SCHEDULER_UPDATED_AT=""
SCHEDULER_UPDATED_BY=""
while IFS= read -r scheduler_state_field; do
    case "$scheduler_state_field" in
        state_file=*) SCHEDULER_STATE_FILE_STATUS="${scheduler_state_field#state_file=}" ;;
        desired_state=*) SCHEDULER_DESIRED_STATE="${scheduler_state_field#desired_state=}" ;;
        updated_at=*) SCHEDULER_UPDATED_AT="${scheduler_state_field#updated_at=}" ;;
        updated_by=*) SCHEDULER_UPDATED_BY="${scheduler_state_field#updated_by=}" ;;
    esac
done <<< "$(read_scheduler_state)"

WATCHER_PID=""
WATCHER_PID_PRESENT=0
WATCHER_ALIVE=0
if [[ -f "$WATCHER_DAEMON_PID_FILE" ]]; then
    WATCHER_PID_PRESENT=1
    WATCHER_PID=$(cat "$WATCHER_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if is_watcher_pid "$WATCHER_PID"; then
        WATCHER_ALIVE=1
    fi
fi

SCHEDULER_HEALTH="STOPPED"
SCHEDULER_HEALTH_COLOR="$YELLOW"
if [[ "$SCHEDULER_STATE_FILE_STATUS" == "present" ]]; then
    if [[ "$SCHEDULER_DESIRED_STATE" == "running" && "$WATCHER_ALIVE" -eq 1 ]]; then
        SCHEDULER_HEALTH="RUNNING"
        SCHEDULER_HEALTH_COLOR="$GREEN"
    elif [[ "$SCHEDULER_DESIRED_STATE" == "paused" && "$WATCHER_ALIVE" -eq 0 ]]; then
        SCHEDULER_HEALTH="PAUSED"
        SCHEDULER_HEALTH_COLOR="$YELLOW"
    else
        SCHEDULER_HEALTH="ABNORMAL"
        SCHEDULER_HEALTH_COLOR="$RED"
    fi
elif [[ "$SCHEDULER_STATE_FILE_STATUS" == "missing" ]]; then
    if [[ "$WATCHER_ALIVE" -eq 1 ]]; then
        SCHEDULER_HEALTH="RUNNING"
        SCHEDULER_HEALTH_COLOR="$GREEN"
    elif [[ "$WATCHER_PID_PRESENT" -eq 1 ]]; then
        SCHEDULER_HEALTH="ABNORMAL"
        SCHEDULER_HEALTH_COLOR="$RED"
    else
        SCHEDULER_HEALTH="STOPPED"
        SCHEDULER_HEALTH_COLOR="$YELLOW"
    fi
else
    SCHEDULER_HEALTH="ABNORMAL"
    SCHEDULER_HEALTH_COLOR="$RED"
fi

if [[ "$WATCHER_ALIVE" -eq 1 ]]; then
    echo -e "  ${SCHEDULER_HEALTH_COLOR}[${SCHEDULER_HEALTH}]${NC}  调度器进程 (PID: $WATCHER_PID)"
    echo -e "  ${CYAN}│${NC}  策略: maxConcurrent=$POLICY_MAX"
    if [[ -n "$POLICY_PINNED" ]]; then
        echo -e "  ${CYAN}│${NC}  临时 pinned: $POLICY_PINNED (consumeSlots=$POLICY_CONSUME_SLOTS)"
    else
        echo -e "  ${CYAN}│${NC}  临时 pinned: 无"
    fi
    echo -e "  ${CYAN}│${NC}  有效并发: $EFFECTIVE_ACTIVE/$POLICY_MAX"
    if [[ -n "$PINNED_RUNNING" ]]; then
        echo -e "  ${CYAN}│${NC}  pinned 运行中: $PINNED_RUNNING"
    fi
    echo -e "  ${CYAN}│${NC}  队列: $QUEUE_PENDING_COUNT 个待启动"
    if [[ -n "$QUEUE_PENDING_LIST" ]]; then
        echo -e "  ${CYAN}│${NC}  队列样本: $QUEUE_PENDING_LIST"
    fi
    if [[ -n "$QUEUE_UPDATED_AT" ]]; then
        echo -e "  ${CYAN}│${NC}  更新于: $QUEUE_UPDATED_AT"
    fi
    elif [[ "$WATCHER_PID_PRESENT" -eq 1 ]]; then
        if [[ -n "$WATCHER_PID" ]]; then
            echo -e "  ${SCHEDULER_HEALTH_COLOR}[${SCHEDULER_HEALTH}]${NC}  调度器进程 (PID: $WATCHER_PID 不存在)"
        else
            echo -e "  ${SCHEDULER_HEALTH_COLOR}[${SCHEDULER_HEALTH}]${NC}  调度器进程 (PID 文件为空)"
        fi
    else
        echo -e "  ${SCHEDULER_HEALTH_COLOR}[${SCHEDULER_HEALTH}]${NC}  调度器未运行"
    fi

if [[ "$SCHEDULER_STATE_FILE_STATUS" == "present" ]]; then
    echo -e "  ${CYAN}│${NC}  期望: $SCHEDULER_DESIRED_STATE"
    if [[ -n "$SCHEDULER_UPDATED_AT" ]]; then
        echo -e "  ${CYAN}│${NC}  状态更新时间: $SCHEDULER_UPDATED_AT"
    fi
    if [[ -n "$SCHEDULER_UPDATED_BY" ]]; then
        echo -e "  ${CYAN}│${NC}  状态更新者: $SCHEDULER_UPDATED_BY"
    fi
elif [[ "$SCHEDULER_STATE_FILE_STATUS" == "unreadable" ]]; then
    echo -e "  ${CYAN}│${NC}  期望状态文件不可读"
fi

# 后台同步器状态
echo ""
echo -e "${CYAN}├─ 主控后台同步器:${NC}"
if [[ -f "$SYNC_DAEMON_PID_FILE" ]]; then
    PID=$(cat "$SYNC_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        echo -e "  ${GREEN}[RUNNING]${NC}  后台同步器进程 (PID: $PID)"
    else
        echo -e "  ${RED}[STOPPED]${NC}   后台同步器进程 (PID: $PID 不存在)"
    fi
else
    echo -e "  ${YELLOW}[STOPPED]${NC}   后台同步器未运行"
fi

# 状态概览
echo ""
echo -e "${YELLOW}└─ 总概览:${NC}"
echo "  总计 $(( ${#RUNNING_SESSIONS[@]} + ${#STOPPED_SESSIONS[@]} + COMPLETED_KEPT_COUNT + COMPLETED_IDLE_COUNT + BLOCKED_COUNT + ROLLBACK_COUNT + PENDING_COUNT + PINNED_COUNT )) 个 session, $(( ${#RUNNING_SESSIONS[@]} )) 个常规运行中"
echo "  临时 pinned: $PINNED_COUNT, 已完成保留: $COMPLETED_KEPT_COUNT, 已完成空闲: $COMPLETED_IDLE_COUNT, 阻塞中: $BLOCKED_COUNT, 已撤回: $ROLLBACK_COUNT, 挂起中: $PENDING_COUNT"

if [[ ${#RUNNING_SESSIONS[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${YELLOW}正在运行的 session:${NC}"
    for session in "${RUNNING_SESSIONS[@]}"; do
        echo "    进入现场: tmux attach -t $session"
        if [[ "$session" == chain-* ]]; then
            chain_id=$(extract_newfee_chain_id "$session" || true)
            [[ -z "$chain_id" ]] && continue
            chain_name=$(python3 - <<PY
import json
from pathlib import Path
path = Path("$CHAIN_NAMES_FILE")
chain_id = "$chain_id"
if path.exists():
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
else:
    data = {}
print(data.get(chain_id, chain_id))
PY
)
            echo "    恢复上下文: bash \"$SCRIPT_DIR/resume-chain-session.sh\" $chain_name newfee"
        fi
    done
fi

echo ""
echo -e "  ${YELLOW}管理操作:${NC}"
echo "    状态:    bash \"$SCRIPT_DIR/status-ff-parallel-workspace.sh\""
echo "    暂停调度: bash \"$SCRIPT_DIR/pause-scheduler.sh\""
echo "    恢复调度: bash \"$SCRIPT_DIR/resume-scheduler.sh\""
echo "    停止:    bash \"$SCRIPT_DIR/stop-ff-parallel-workspace.sh\""
echo "    启动:    bash \"$SCRIPT_DIR/start-ff-parallel-workspace.sh\""
echo "    重启:    停止后启动"
echo ""
echo -e "  ${YELLOW}交接操作:${NC}"
echo "    立即交接: bash \"$HANDOFF_SCRIPT\""
echo "    轮换主控: bash \"$ROTATE_SCRIPT\""
if [[ -f "$LATEST_HANDOFF_FILE" ]]; then
LATEST_PATH=$(python3 - <<PY
from pathlib import Path
import sys
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync
path = Path('$LATEST_HANDOFF_FILE')
print(runtime_sync.extract_latest_handoff_path(path.read_text(encoding='utf-8')) or '无')
PY
)
    echo "    最新交接: $LATEST_PATH"
else
    echo "    最新交接: 无"
fi
