#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
WATCHER_SCRIPT="$PROJECT_ROOT/Playbooks/dispatch-watcher.sh"
WATCHER_LOG_FILE="$PROJECT_ROOT/Playbooks/dispatch-watcher.log"
WATCHER_DAEMON_PID_FILE="$PROJECT_ROOT/Playbooks/dispatch-watcher.pid"
SCHEDULER_STATE_JSON="$PROJECT_ROOT/share/scheduler-state.json"
WATCHER_COMMAND_HINT="dispatch-watcher.sh"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC}  $*"; exit 1; }

is_watcher_pid() {
    local pid="$1"
    [[ -n "$pid" ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    local command
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    [[ "$command" == *"$WATCHER_COMMAND_HINT"* ]]
}

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

info "恢复自动调度器..."

if [[ -f "$WATCHER_DAEMON_PID_FILE" ]]; then
    PID=$(cat "$WATCHER_DAEMON_PID_FILE" 2>/dev/null || echo "")
    if is_watcher_pid "$PID"; then
        info "调度器已在运行 (PID: $PID)"
        write_scheduler_state "running"
        ok "调度状态已设置为 running"
        exit 0
    elif [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
        warn "PID 文件指向的不是 dispatch-watcher，清理后重新拉起 (PID: $PID)"
    fi
    warn "清理失效的调度器 PID 文件${PID:+ (PID: $PID)}"
    rm -f "$WATCHER_DAEMON_PID_FILE"
fi

[[ -x "$WATCHER_SCRIPT" ]] || error "调度器脚本不存在或不可执行: $WATCHER_SCRIPT"

nohup "$WATCHER_SCRIPT" > "$WATCHER_LOG_FILE" 2>&1 &
WATCHER_PID=$!
echo "$WATCHER_PID" > "$WATCHER_DAEMON_PID_FILE"
write_scheduler_state "running"
ok "已启动调度器 (PID: $WATCHER_PID)"
