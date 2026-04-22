#!/usr/bin/env bash
# ============================================================
#  停止 ff 并行工作区 (自动化模式)
# ============================================================
#  用法:  bash stop-ff-parallel-workspace.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

MAIN_CONTROL_SESSION="main-control"
LINGGEN_SESSION="linggen"
WATCHER_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/dispatch-watcher.pid"
SYNC_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/main-control-sync.pid"
SCHEDULER_STATE_JSON="$PROJECT_ROOT/share/scheduler-state.json"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC}  $*"; exit 1; }

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

info "停止 ff 工作区..."

# 1. 停止调度器进程
if [[ -f "$WATCHER_DAEMON_PID_FILE" ]]; then
    PID=$(cat "$WATCHER_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        info "停止调度器进程 (PID: $PID)..."
        if kill "$PID"; then
            rm -f "$WATCHER_DAEMON_PID_FILE"
            ok "已停止调度器"
        else
            error "无法停止调度器进程"
        fi
    else
        warn "调度器进程可能不存在 (PID: $PID)"
        rm -f "$WATCHER_DAEMON_PID_FILE"
    fi
else
    info "调度器未运行"
fi

# 2. 找到并停止所有 chain-* session  (动态匹配)
if [[ -f "$SYNC_DAEMON_PID_FILE" ]]; then
    PID=$(cat "$SYNC_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        info "停止后台同步器进程 (PID: $PID)..."
        if kill "$PID"; then
            rm -f "$SYNC_DAEMON_PID_FILE"
            ok "已停止后台同步器"
        else
            error "无法停止后台同步器进程"
        fi
    else
        warn "后台同步器进程可能不存在 (PID: $PID)"
        rm -f "$SYNC_DAEMON_PID_FILE"
    fi
else
    info "后台同步器未运行"
fi

# 2. 找到并停止所有 chain-* session  (动态匹配)
info "查找并停止所有 chain-* session..."
if command -v tmux >/dev/null 2>&1; then
    TMUX_SESSIONS=$(tmux ls 2>/dev/null | grep "^chain-" | awk -F ':' '{print $1}' | tr '\n' ' ' || true)
    if [[ -n "$TMUX_SESSIONS" ]]; then
        for session in $TMUX_SESSIONS; do
            if tmux has-session -t "$session" 2>/dev/null; then
                tmux kill-session -t "$session"
                ok "已停止会话: $session"
            fi
        done
    else
        ok "未找到 chain-* 会话"
    fi
else
    warn "tmux 未安装或未运行"
fi

# 3. 停止固定的 session
for session in "$MAIN_CONTROL_SESSION" "$LINGGEN_SESSION"; do
    if tmux has-session -t "$session" 2>/dev/null; then
        tmux kill-session -t "$session"
        ok "已停止会话: $session"
    else
        warn "会话不存在: $session"
    fi
done

write_scheduler_state "paused"
ok "停止完成"
