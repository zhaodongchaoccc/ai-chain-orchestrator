#!/usr/bin/env bash
# ============================================================
#  ff 并行工作区: 自动化调度模式
# ============================================================
#
#  Sessions:
#  - main-control:    控制调度 (opencode @ $VAULT)
#  - linggen:         检索支持 (linggen @ $VAULT) 
#  - chain-xxx:       动态业务链 (opencode @ $FF_WORKDIR)
#  - dispatch-watcher:  自动调度器 (background process)
#
#  用法:          bash start-ff-parallel-workspace.sh [--resume-existing-workers]
#  进入 session:   tmux attach -t [name]
#  停止:          bash stop-ff-parallel-workspace.sh
#  状态:          bash status-ff-parallel-workspace.sh
#  重启:          stop + start
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
VAULT="${VAULT:-$(cd "$PROJECT_ROOT/../.." && pwd)}"

RESUME_EXISTING_WORKERS=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --resume-existing-workers)
            RESUME_EXISTING_WORKERS=1
            ;;
        *)
            printf '[ERROR] 未知参数: %s\n' "$1" >&2
            exit 1
            ;;
    esac
    shift
done

# ── 配置 ────────────────────────────────────────────────────
MAIN_CONTROL_SESSION="main-control"
LINGGEN_SESSION="linggen"
WATCHER_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/dispatch-watcher.pid"
SYNC_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/main-control-sync.pid"
SCHEDULER_STATE_JSON="$PROJECT_ROOT/share/scheduler-state.json"
SCHEDULER_POLICY_JSON="$PROJECT_ROOT/share/scheduler-policy.json"

FF_WORKDIR="${FF_WORKDIR:-$HOME/ff}"
LINGGEN_DIR="$HOME/linggen"
LINGGEN_BIN="$LINGGEN_DIR/target/release/ling"
LINGGEN_BIN_DEBUG="$LINGGEN_DIR/target/debug/ling"
OPENCODE_BIN="opencode"

# ── 颜色 ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

write_scheduler_state() {
    local desired_state="$1"
    local updated_by="${UPDATED_BY_OVERRIDE:-$(basename "$0")}"

    mkdir -p "$(dirname "$SCHEDULER_STATE_JSON")"
    SCHEDULER_STATE_JSON="$SCHEDULER_STATE_JSON" DESIRED_STATE="$desired_state" UPDATED_BY="$updated_by" python3 <<'PY'
import json
import os
from datetime import datetime

path = os.environ['SCHEDULER_STATE_JSON']
desired_state = os.environ['DESIRED_STATE']
updated_by = os.environ['UPDATED_BY']

with open(path, 'w', encoding='utf-8') as handle:
    json.dump(
        {
            'desiredState': desired_state,
            'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'updatedBy': updated_by,
        },
        handle,
        ensure_ascii=False,
        indent=2,
    )
PY
}

list_chain_sessions() {
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

cleanup_invalid_chain_sessions() {
    local invalid_sessions
    invalid_sessions=$(tmux ls 2>/dev/null | awk -F ':' '$1 == "chain-" {print $1}' | sort || true)
    if [[ -z "$invalid_sessions" ]]; then
        return 0
    fi

    while IFS= read -r session; do
        [[ -z "$session" ]] && continue
        warn "清理无效业务链 session: $session"
        tmux kill-session -t "$session" 2>/dev/null || true
    done <<< "$invalid_sessions"
}

get_chain_resume_status() {
    local chain_id="$1"
        local chain_status_json="${CHAIN_STATUS_JSON:-$PROJECT_ROOT/share/sources/newfee/chain-status.json}"

    if [[ ! -f "$chain_status_json" ]]; then
        printf 'status_read=unreadable\nblocked=false\nstage=\n'
        return 0
    fi

    python3 - "$chain_status_json" "$chain_id" <<'PY'
import json
import sys

chain_status_json = sys.argv[1]
chain_id = sys.argv[2]

try:
    with open(chain_status_json) as f:
        data = json.load(f)
except Exception:
    print("status_read=unreadable")
    print("blocked=false")
    print("stage=")
    sys.exit(0)

chain_data = data.get(chain_id, {})
if not isinstance(chain_data, dict) or not chain_data:
    print("status_read=missing")
    print("blocked=false")
    print("stage=")
    sys.exit(0)

stage = chain_data.get('stage', '')
blocked = chain_data.get('blocked', False)

if not isinstance(stage, str):
    stage = ''

print("status_read=ok")
print(f"blocked={str(bool(blocked)).lower()}")
print(f"stage={stage}")
PY
}

get_chinese_name() {
    local chain_id="$1"
    python3 - "$PROJECT_ROOT/share/sources/newfee/chinese-chain-names.json" "$chain_id" <<'PY'
import json
import sys

names_path = sys.argv[1]
chain_id = sys.argv[2]

try:
    with open(names_path, encoding='utf-8') as handle:
        names = json.load(handle)
except Exception:
    names = {}

print(names.get(chain_id, chain_id))
PY
}

# ── 前置检查 ────────────────────────────────────────────────
info "检查环境..."

# tmux
command -v tmux >/dev/null 2>&1 || err "tmux 未安装。运行: brew install tmux"
ok "tmux $(tmux -V)"

# Linggen 二进制
if [[ -x "$LINGGEN_BIN" ]]; then
    LING="$LINGGEN_BIN"
elif [[ -x "$LINGGEN_BIN_DEBUG" ]]; then
    LING="$LINGGEN_BIN_DEBUG"
    warn "使用 debug 版本，建议运行 cargo build --release"
else
    info "Linggen 未编译，开始编译..."
    (cd "$LINGGEN_DIR" && cargo build --release 2>&1) || err "Linggen 编译失败"
    LING="$LINGGEN_BIN"
fi
ok "Linggen: $LING"

# OpenCode
command -v "$OPENCODE_BIN" >/dev/null 2>&1 || err "opencode 未安装"
ok "OpenCode: $(which $OPENCODE_BIN)"

# Obsidian vault
if [[ ! -d "$VAULT" ]]; then
    info "创建 Obsidian vault 目录: $VAULT"
    mkdir -p "$VAULT"
fi
ok "Vault: $VAULT"

# FF 工作目录
if [[ ! -d "$FF_WORKDIR" ]]; then
    err "FF 工作目录不存在: $FF_WORKDIR"
fi
ok "FF Workdir: $FF_WORKDIR"

# 调度队列
DISPATCH_QUEUE_JSON="$PROJECT_ROOT/share/sources/newfee/dispatch-queue.json"
CHAIN_STATUS_JSON="$PROJECT_ROOT/share/sources/newfee/chain-status.json"
ok "Dispatch Queue: $DISPATCH_QUEUE_JSON"

# 调度队列配置初始化
if [[ ! -f "$DISPATCH_QUEUE_JSON" ]]; then
    info "初始化调度队列配置..."
    mkdir -p "$(dirname "$DISPATCH_QUEUE_JSON")"
    VAULT="$VAULT" DISPATCH_QUEUE_JSON="$DISPATCH_QUEUE_JSON" python3 <<'PY'
import json
import os
import sys

vault = os.environ['VAULT']
queue_path = os.environ['DISPATCH_QUEUE_JSON']
project_root = os.path.join(vault, 'Projects', '飞枢系统')
if not os.path.isdir(project_root):
    project_root = os.path.join(vault, 'Projects', 'ff')
sys.path.insert(0, os.path.join(project_root, 'share'))
import runtime_sync

policy = runtime_sync.resolve_scheduler_policy()
with open(queue_path, 'w', encoding='utf-8') as handle:
    json.dump(
        {
            'maxConcurrent': policy.get('maxConcurrent', 2),
            'pendingStart': [],
            'updatedAt': '',
        },
        handle,
        ensure_ascii=False,
        indent=2,
    )
PY
fi

cleanup_invalid_chain_sessions
PREEXISTING_CHAIN_SESSIONS="$(list_chain_sessions)"

# ── 启动 Obsidian (后台) ───────────────────────────────────
if ! pgrep -x "Obsidian" >/dev/null 2>&1; then
    info "启动 Obsidian..."
    open -a "Obsidian" "$VAULT" 2>/dev/null || warn "无法启动 Obsidian，请手动打开"
else
    ok "Obsidian 已在运行"
fi

# ── 确保调度器已停止 ───────────────────────────────────────
if [[ -f "$WATCHER_DAEMON_PID_FILE" ]]; then
    PID=$(cat "$WATCHER_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        info "停止现有调度器 (PID: $PID)..."
        kill "$PID"
    fi
    rm -f "$WATCHER_DAEMON_PID_FILE"
fi

# ── 确保后台同步器已停止 ─────────────────────────────────────
if [[ -f "$SYNC_DAEMON_PID_FILE" ]]; then
    PID=$(cat "$SYNC_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        info "停止现有后台同步器 (PID: $PID)..."
        kill "$PID"
    fi
    rm -f "$SYNC_DAEMON_PID_FILE"
fi

# ── 如果 session 已存在，提示用户 ───────────────────────────
EXISTS=0
if tmux has-session -t "$MAIN_CONTROL_SESSION" 2>/dev/null; then
    warn "session '$MAIN_CONTROL_SESSION' 已存在"
    EXISTS=1
else
    info "创建 session: $MAIN_CONTROL_SESSION"
    tmux new-session -d -s "$MAIN_CONTROL_SESSION" -c "$VAULT"
    tmux setw -t "$MAIN_CONTROL_SESSION" pane-base-index 0 2>/dev/null || true
    tmux send-keys -t "$MAIN_CONTROL_SESSION" \
        "echo '── main-control ──' && echo 'Workspace: $VAULT' && echo '' && $OPENCODE_BIN" \
        Enter
    ok "已创建: $MAIN_CONTROL_SESSION"
fi

if tmux has-session -t "$LINGGEN_SESSION" 2>/dev/null; then
    warn "session '$LINGGEN_SESSION' 已存在"
    EXISTS=1
else
    info "创建 session: $LINGGEN_SESSION"
    tmux new-session -d -s "$LINGGEN_SESSION" -c "$VAULT"
    tmux setw -t "$LINGGEN_SESSION" pane-base-index 0 2>/dev/null || true
    tmux send-keys -t "$LINGGEN_SESSION" \
        "echo '── linggen ──' && echo 'Workspace: $VAULT' && echo '' && $LING --root $VAULT --web" \
        Enter
    ok "已创建: $LINGGEN_SESSION"
fi

if [[ $EXISTS -eq 1 ]]; then
    echo ""
    warn "部分 session 已存在，如需清空请先运行 stop 脚本"
fi

# ── 启动调度器后台进程 ─────────────────────────────────────
info "启动调度器后台进程..."
nohup "$PROJECT_ROOT/Playbooks/dispatch-watcher.sh" > "$PROJECT_ROOT/Playbooks/dispatch-watcher.log" 2>&1 &
DISPATCH_PID=$!
echo $DISPATCH_PID > "$WATCHER_DAEMON_PID_FILE"
write_scheduler_state "running"
ok "已启动调度器 (PID: $DISPATCH_PID)"

# ── 启动主控后台同步器 ─────────────────────────────────────
info "启动主控后台同步器..."
nohup "$PROJECT_ROOT/Playbooks/main-control-sync.sh" > /dev/null 2>&1 &
SYNC_PID=$!
echo $SYNC_PID > "$SYNC_DAEMON_PID_FILE"
ok "已启动后台同步器 (PID: $SYNC_PID)"

# 尝试从 chain-status.json 初始化待启动队列
info "初始化队列..."
VAULT="$VAULT" DISPATCH_QUEUE_JSON="$DISPATCH_QUEUE_JSON" python3 <<'PY'
import json
import os
import subprocess
import sys
from datetime import datetime

vault = os.environ['VAULT']
dispatch_queue_file = os.environ['DISPATCH_QUEUE_JSON']

sys.path.insert(0, os.path.join(vault, 'Projects/飞枢系统/share'))
import runtime_sync

try:
    chain_status_file = os.path.join(project_root, 'share', 'sources', 'newfee', 'chain-status.json')
    if os.path.isfile(chain_status_file):
        with open(chain_status_file) as f:
            chain_status = json.load(f)

        try:
            output = subprocess.check_output(['tmux', 'ls'], stderr=subprocess.DEVNULL, text=True)
            sessions = [line.split(':', 1)[0] for line in output.splitlines() if line.startswith('chain-')]
            running_chain_ids = runtime_sync.iter_chain_ids_from_sessions(sessions, source_id='newfee')
        except Exception:
            running_chain_ids = []

        pending_chains = runtime_sync.rebuild_pending_start_queue(
            chain_status,
            running_chain_ids=running_chain_ids,
        )
        policy = runtime_sync.resolve_scheduler_policy()

        with open(dispatch_queue_file) as f:
            dispatch_queue = json.load(f)

        dispatch_queue['maxConcurrent'] = policy.get('maxConcurrent', dispatch_queue.get('maxConcurrent', 2))
        dispatch_queue['pendingStart'] = pending_chains
        dispatch_queue['updatedAt'] = datetime.now().strftime('%Y-%m-%d %H:%M')

        with open(dispatch_queue_file, 'w') as f:
            json.dump(dispatch_queue, f, ensure_ascii=False, indent=2)

        print(f'找到 {len(pending_chains)} 个待启动链: {pending_chains}')
except Exception as e:
    print(f'初始化列表失败: {str(e)}')
    # 如果初始化失败，不做任何更改
PY

info "确保临时 pinned 业务链 session..."
PINNED_TO_START=$(VAULT="$VAULT" python3 <<'PY'
import os
import subprocess
import sys
from pathlib import Path

vault = os.environ['VAULT']
project_root = os.path.join(vault, 'Projects', '飞枢系统')
if not os.path.isdir(project_root):
    project_root = os.path.join(vault, 'Projects', 'ff')
sys.path.insert(0, os.path.join(project_root, 'share'))
import runtime_sync

status_path = os.path.join(project_root, 'share', 'sources', 'newfee', 'chain-status.json')
policy = runtime_sync.resolve_scheduler_policy()
status = runtime_sync.load_json(Path(status_path), {})

try:
    output = subprocess.check_output(['tmux', 'ls'], stderr=subprocess.DEVNULL, text=True)
    sessions = {
        line.split(':', 1)[0]
        for line in output.splitlines()
        if line.startswith('chain-') and line.split(':', 1)[0]
    }
    running_chain_ids = set(runtime_sync.iter_chain_ids_from_sessions(sessions, source_id='newfee'))
except Exception:
    sessions = set()
    running_chain_ids = set()

for chain_id in policy.get('temporaryPinnedChains', []):
    if not isinstance(chain_id, str) or not chain_id:
        continue
    if chain_id in running_chain_ids:
        continue
    if runtime_sync.is_chain_blocked(chain_id, status):
        continue
    if runtime_sync.is_chain_rollback(chain_id, status):
        continue
    if runtime_sync.is_chain_pending(chain_id, status):
        continue
    print(chain_id)
PY
)

if [[ -n "$PINNED_TO_START" ]]; then
    while IFS= read -r chain_id; do
        [[ -z "$chain_id" ]] && continue
        chain_name="$(get_chinese_name "$chain_id")"
        info "启动临时 pinned 业务链: $chain_id ($chain_name)"
        bash "$PROJECT_ROOT/Playbooks/start-chain-session.sh" "$chain_name"
    done <<< "$PINNED_TO_START"
else
    info "当前无需补启临时 pinned 业务链"
fi

# ── 等待调度器完成第一批启动 ──────────────────────────────
echo ""
info "等待调度器启动第一批业务链（约15秒）..."
sleep 15

if [[ -n "$PREEXISTING_CHAIN_SESSIONS" ]]; then
    echo ""
    if [[ $RESUME_EXISTING_WORKERS -eq 1 ]]; then
        info "恢复启动前已存在的业务链 session..."
        while IFS= read -r session; do
            [[ -z "$session" ]] && continue
            if tmux has-session -t "$session" 2>/dev/null; then
                chain_id=$(extract_newfee_chain_id "$session" || true)
                [[ -z "$chain_id" ]] && continue
                chain_status_read="unreadable"
                chain_blocked="false"
                chain_stage=""
                while IFS= read -r chain_status_field; do
                    case "$chain_status_field" in
                        status_read=*) chain_status_read="${chain_status_field#status_read=}" ;;
                        blocked=*) chain_blocked="${chain_status_field#blocked=}" ;;
                        stage=*) chain_stage="${chain_status_field#stage=}" ;;
                    esac
                done <<< "$(get_chain_resume_status "$chain_id")"
                if [[ "$chain_status_read" == "unreadable" ]]; then
                    warn "跳过旧 session: ${session} (无法读取 chain-status.json，保守跳过)"
                    continue
                fi
                if [[ "$chain_status_read" == "missing" ]]; then
                    warn "跳过旧 session: ${session} (chain-status.json 中缺少该链路条目，保守跳过)"
                    continue
                fi
                if [[ "$chain_stage" == "PENDING" ]]; then
                    warn "跳过挂起链路 session: ${session} (chain stage=PENDING/挂起)"
                    continue
                fi
                if [[ "$chain_stage" == "BLOCKED" || "$chain_blocked" == "true" ]]; then
                    warn "跳过阻塞链路 session: ${session} (chain stage=BLOCKED/阻塞)"
                    continue
                fi
                if [[ "$chain_stage" == "S5" ]]; then
                    warn "跳过已完成链路 session: ${session} (chain stage=S5/完成)"
                    continue
                fi
                if [[ "$chain_stage" == "ROLLBACK" ]]; then
                    warn "跳过回滚链路 session: ${session} (chain stage=ROLLBACK/回滚)"
                    continue
                fi
                info "LIGHT resume: $session"
                bash "$PROJECT_ROOT/Playbooks/resume-chain-session.sh" "$chain_id" newfee
            else
                warn "跳过已消失的旧 session: $session"
            fi
        done <<< "$PREEXISTING_CHAIN_SESSIONS"
    else
        warn "检测到启动前已存在的业务链 session，可重新运行: bash start-ff-parallel-workspace.sh --resume-existing-workers"
    fi
fi

# ── 输出连接指令 ───────────────────────────────────────────
ok "全部就绪！"
echo ""
echo -e "${CYAN}基础设施 session:${NC}"
echo "  $ tmux attach -t $MAIN_CONTROL_SESSION"
echo "  $ tmux attach -t $LINGGEN_SESSION"
echo ""

# 读取当前已启动的 chain-* session 并展示
ACTIVE_CHAINS=$(list_chain_sessions)
if [[ -n "$ACTIVE_CHAINS" ]]; then
    echo -e "${GREEN}当前已启动的业务链 session:${NC}"
    while IFS= read -r session; do
        ENGLISH=$(extract_newfee_chain_id "$session" || true)
        [[ -z "$ENGLISH" ]] && continue
        CHINESE=$(python3 -c "
import json, os.path
try:
    with open('$PROJECT_ROOT/share/chinese-chain-names.json') as f:
        names = json.load(f)
    print(names.get('$ENGLISH', '$ENGLISH'))
except:
    print('$ENGLISH')
" 2>/dev/null)
        echo -e "  ${GREEN}✓${NC} ${CYAN}${session}${NC}（${CHINESE}）"
        echo "      进入现场: tmux attach -t ${session}"
        echo "      恢复上下文: bash $PROJECT_ROOT/Playbooks/resume-chain-session.sh ${CHINESE} newfee"
    done <<< "$ACTIVE_CHAINS"
    echo ""
else
    warn "调度器尚未启动任何业务链，请稍后执行 tmux ls 查看"
    echo ""
fi

# 剩余队列概览
REMAINING=$(python3 -c "
import json, os.path
try:
    with open('$DISPATCH_QUEUE_JSON') as f:
        d = json.load(f)
    pending = d.get('pendingStart', [])
    names_file = '$PROJECT_ROOT/share/chinese-chain-names.json'
    with open(names_file) as f:
        names = json.load(f)
    items = [names.get(p, p) for p in pending]
    print(f'{len(pending)} 条：' + '、'.join(items) if items else '无')
except:
    print('读取失败')
" 2>/dev/null)
echo -e "${YELLOW}队列剩余:${NC} ${REMAINING}"
echo -e "${YELLOW}调度器:${NC}   PID ${DISPATCH_PID}，每10秒检查一次，前序完成后自动补位"
echo -e "${YELLOW}同步器:${NC}   PID ${SYNC_PID}，静默消费通知并更新文档"
echo ""
echo -e "${YELLOW}管理脚本:${NC}"
echo "  状态:  bash status-ff-parallel-workspace.sh"
echo "  停止:  bash stop-ff-parallel-workspace.sh"
echo "  重启:  stop + start"
echo ""
