#!/usr/bin/env bash

PROJECT_ROOT="${PROJECT_ROOT:-$HOME/PasObsidian/Projects/飞枢系统}"
PLAYBOOKS_ROOT="$PROJECT_ROOT/Playbooks"

WORKSPACE_START_SCRIPT="$PLAYBOOKS_ROOT/start-ff-parallel-workspace.sh"
WORKSPACE_STOP_SCRIPT="$PLAYBOOKS_ROOT/stop-ff-parallel-workspace.sh"
WORKSPACE_STATUS_SCRIPT="$PLAYBOOKS_ROOT/status-ff-parallel-workspace.sh"
CONSOLE_START_SCRIPT="$PLAYBOOKS_ROOT/start-console.sh"
CONSOLE_STOP_SCRIPT="$PLAYBOOKS_ROOT/stop-console.sh"
CONSOLE_STATUS_SCRIPT="$PLAYBOOKS_ROOT/status-console.sh"
START_SOURCE_MAIN_CONTROL_SCRIPT="$PLAYBOOKS_ROOT/start-source-main-control.sh"
SLEEP_SOURCE_MAIN_CONTROL_SCRIPT="$PLAYBOOKS_ROOT/sleep-source-main-control.sh"
START_MAIN_CONTROL_SCRIPT="$PLAYBOOKS_ROOT/start/start-main-control-session.sh"
START_SYSTEM_ITERATION_SCRIPT="$PLAYBOOKS_ROOT/start/start-system-iteration-session.sh"
WORKSPACES_FILE="$PROJECT_ROOT/share/workspaces.json"
ORCHESTRATION_STATE_FILE="$PROJECT_ROOT/share/global/orchestration-state.json"
SYSTEM_ITERATION_STATE_FILE="$PROJECT_ROOT/share/global/system-iteration-state.json"

MAIN_CONTROL_SESSION="main-control"
LINGGEN_SESSION="linggen"
SYSTEM_ITERATION_SESSION="system-iteration"
WATCHER_DAEMON_PID_FILE="$PLAYBOOKS_ROOT/dispatch-watcher.pid"
SYNC_DAEMON_PID_FILE="$PLAYBOOKS_ROOT/main-control-sync.pid"
CONSOLE_SERVER_PID_FILE="$PLAYBOOKS_ROOT/console-server.pid"
CONSOLE_SERVER_RUNTIME_PID_FILE="$PLAYBOOKS_ROOT/console-server-runtime.pid"
CONSOLE_WEB_PID_FILE="$PLAYBOOKS_ROOT/console-web.pid"
CONSOLE_WEB_RUNTIME_PID_FILE="$PLAYBOOKS_ROOT/console-web-runtime.pid"

FF_CONSOLE_PORT="${FF_CONSOLE_PORT:-8787}"
FF_CONSOLE_WEB_PORT="${FF_CONSOLE_WEB_PORT:-4173}"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

require_script() {
    local script_path="$1"
    [[ -f "$script_path" ]] || error "缺少脚本: $script_path"
}

listener_pid() {
    local port="$1"
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

read_pid_file() {
    local pid_file="$1"
    [[ -f "$pid_file" ]] || return 0
    tr -d '[:space:]' < "$pid_file"
}

pid_alive() {
    local pid="$1"
    [[ -n "$pid" ]] || return 1
    kill -0 "$pid" 2>/dev/null
}

has_tmux_session() {
    local session_name="$1"
    command -v tmux >/dev/null 2>&1 || return 1
    tmux has-session -t "$session_name" 2>/dev/null
}

has_chain_sessions() {
    command -v tmux >/dev/null 2>&1 || return 1
    local sessions
    if ! sessions="$(tmux ls 2>/dev/null)"; then
        return 1
    fi
    if awk -F ':' '$1 ~ /^chain-./ { found=1 } END { exit(found ? 0 : 1) }' <<< "$sessions"; then
        return 0
    fi
    return 1
}

list_source_main_control_sessions() {
    command -v tmux >/dev/null 2>&1 || return 0
    tmux ls 2>/dev/null | awk -F ':' '$1 ~ /^main-control-./ {print $1}' | sort || true
}

source_main_controls_running() {
    [[ -n "$(list_source_main_control_sessions)" ]]
}

has_system_iteration_session() {
    has_tmux_session "$SYSTEM_ITERATION_SESSION"
}

system_iteration_running() {
    has_system_iteration_session
}

workspace_has_runtime_artifacts() {
    has_tmux_session "$MAIN_CONTROL_SESSION" && return 0
    has_tmux_session "$LINGGEN_SESSION" && return 0
    has_system_iteration_session && return 0
    has_chain_sessions && return 0
    source_main_controls_running && return 0
    pid_alive "$(read_pid_file "$WATCHER_DAEMON_PID_FILE")" && return 0
    pid_alive "$(read_pid_file "$SYNC_DAEMON_PID_FILE")" && return 0
    return 1
}

workspace_is_fully_running() {
    has_tmux_session "$MAIN_CONTROL_SESSION" \
        && has_tmux_session "$LINGGEN_SESSION" \
        && has_system_iteration_session \
        && pid_alive "$(read_pid_file "$WATCHER_DAEMON_PID_FILE")" \
        && pid_alive "$(read_pid_file "$SYNC_DAEMON_PID_FILE")"
}

workspace_state_label() {
    if workspace_is_fully_running; then
        printf 'RUNNING\n'
    elif workspace_has_runtime_artifacts; then
        printf 'PARTIAL\n'
    else
        printf 'STOPPED\n'
    fi
}

console_server_running() {
    [[ -n "$(listener_pid "$FF_CONSOLE_PORT")" ]]
}

console_web_running() {
    [[ -n "$(listener_pid "$FF_CONSOLE_WEB_PORT")" ]]
}

console_has_runtime_artifacts() {
    console_server_running && return 0
    console_web_running && return 0
    pid_alive "$(read_pid_file "$CONSOLE_SERVER_RUNTIME_PID_FILE")" && return 0
    pid_alive "$(read_pid_file "$CONSOLE_WEB_RUNTIME_PID_FILE")" && return 0
    return 1
}

console_is_fully_running() {
    console_server_running && console_web_running
}

console_is_partially_running() {
    console_has_runtime_artifacts && ! console_is_fully_running
}

console_state_label() {
    if console_is_fully_running; then
        printf 'RUNNING\n'
    elif console_has_runtime_artifacts; then
        printf 'PARTIAL\n'
    else
        printf 'STOPPED\n'
    fi
}

list_tracked_source_main_controls() {
    WORKSPACES_FILE="$WORKSPACES_FILE" ORCHESTRATION_STATE_FILE="$ORCHESTRATION_STATE_FILE" python3 <<'PY'
import json
import os
from pathlib import Path

workspaces_file = Path(os.environ["WORKSPACES_FILE"])
orchestration_state_file = Path(os.environ["ORCHESTRATION_STATE_FILE"])

workspaces = []
if workspaces_file.exists():
    try:
        workspaces = json.loads(workspaces_file.read_text(encoding="utf-8"))
    except Exception:
        workspaces = []

state = {"runningSources": [], "sourceStates": {}}
if orchestration_state_file.exists():
    try:
        state = json.loads(orchestration_state_file.read_text(encoding="utf-8"))
    except Exception:
        state = {"runningSources": [], "sourceStates": {}}

running_sources = set(item for item in state.get("runningSources", []) if isinstance(item, str) and item)
source_states = state.get("sourceStates", {}) if isinstance(state.get("sourceStates", {}), dict) else {}

for entry in workspaces if isinstance(workspaces, list) else []:
    if not isinstance(entry, dict):
        continue
    if entry.get("enabled") is False:
        continue
    source_id = entry.get("sourceId")
    if not isinstance(source_id, str) or not source_id:
        continue
    state_entry = source_states.get(source_id, {}) if isinstance(source_states.get(source_id, {}), dict) else {}
    runtime_state = state_entry.get("runtimeState") if isinstance(state_entry.get("runtimeState"), str) else "sleeping"
    last_active_at = state_entry.get("lastActiveAt") if isinstance(state_entry.get("lastActiveAt"), str) else ""
    pinned = bool(state_entry.get("pinned"))
    wants_session = runtime_state in {"running", "pinned"} or source_id in running_sources
    print("\t".join([
        source_id,
        runtime_state,
        "1" if pinned else "0",
        last_active_at if isinstance(last_active_at, str) and last_active_at else "n/a",
        "1" if wants_session else "0",
    ]))
PY
}

print_source_main_control_status() {
    local sessions
    sessions="$(list_source_main_control_sessions)"
    echo -e "${CYAN}== Source Main-Control Layer ==${NC}"

    local rows
    rows="$(list_tracked_source_main_controls)"
    if [[ -z "$rows" ]]; then
        echo -e "  ${YELLOW}[空闲]${NC}   暂无已注册需求源"
        return 0
    fi

    while IFS=$'\t' read -r source_id runtime_state pinned last_active_at wants_session; do
        [[ -z "$source_id" ]] && continue
        local session_name="main-control-$source_id"
        local attached_count="0"
        if has_tmux_session "$session_name"; then
            attached_count=$(tmux list-clients -t "$session_name" 2>/dev/null | wc -l | tr -d ' ')
            if [[ "$pinned" == "1" ]]; then
                echo -e "  ${CYAN}[PINNED]${NC}  $session_name  runtime=$runtime_state attached=$attached_count lastActive=${last_active_at:-n/a}"
            else
                echo -e "  ${GREEN}[RUNNING]${NC}  $session_name  runtime=$runtime_state attached=$attached_count lastActive=${last_active_at:-n/a}"
            fi
        else
            if [[ "$wants_session" == "1" ]]; then
                echo -e "  ${YELLOW}[EXPECTED]${NC} $session_name  runtime=$runtime_state lastActive=${last_active_at:-n/a}"
            else
                echo -e "  ${RED}[SLEEPING]${NC} $session_name  runtime=$runtime_state lastActive=${last_active_at:-n/a}"
            fi
        fi
    done <<< "$rows"

    echo ""
    echo -e "  ${YELLOW}管理命令:${NC}"
    echo "    启动: bash \"$START_SOURCE_MAIN_CONTROL_SCRIPT\" <sourceId>"
    echo "    休眠: bash \"$SLEEP_SOURCE_MAIN_CONTROL_SCRIPT\" <sourceId>"
    echo "    轮换: bash \"$PLAYBOOKS_ROOT/rotate-source-main-control.sh\" <sourceId>"
}

print_system_iteration_status() {
    echo -e "${CYAN}== System Iteration Layer ==${NC}"

    local state_summary
    state_summary="$(SYSTEM_ITERATION_STATE_FILE="$SYSTEM_ITERATION_STATE_FILE" python3 <<'PY'
import json, os
from pathlib import Path

path = Path(os.environ["SYSTEM_ITERATION_STATE_FILE"])
if not path.exists():
    print("state=missing")
    raise SystemExit(0)

try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print("state=unreadable")
    raise SystemExit(0)

task = data.get("currentTask", "") if isinstance(data.get("currentTask", ""), str) else ""
updated_at = data.get("updatedAt", "") if isinstance(data.get("updatedAt", ""), str) else ""
updated_by = data.get("updatedBy", "") if isinstance(data.get("updatedBy", ""), str) else ""
print("state=present")
print(f"task={task}")
print(f"updated_at={updated_at}")
print(f"updated_by={updated_by}")
PY
)"

    local state="missing"
    local task=""
    local updated_at=""
    local updated_by=""
    while IFS= read -r line; do
        case "$line" in
            state=*) state="${line#state=}" ;;
            task=*) task="${line#task=}" ;;
            updated_at=*) updated_at="${line#updated_at=}" ;;
            updated_by=*) updated_by="${line#updated_by=}" ;;
        esac
    done <<< "$state_summary"

    if has_system_iteration_session; then
        echo -e "  ${GREEN}[RUNNING]${NC}  $SYSTEM_ITERATION_SESSION"
        [[ -n "$task" ]] && echo "    task: $task"
        [[ -n "$updated_at" ]] && echo "    updatedAt: $updated_at"
        [[ -n "$updated_by" ]] && echo "    updatedBy: $updated_by"
    else
        echo -e "  ${RED}[STOPPED]${NC}  $SYSTEM_ITERATION_SESSION"
        if [[ "$state" == "present" ]]; then
            [[ -n "$task" ]] && echo "    lastTask: $task"
            [[ -n "$updated_at" ]] && echo "    updatedAt: $updated_at"
        fi
    fi

    echo ""
    echo -e "  ${YELLOW}管理命令:${NC}"
    echo "    启动: bash \"$START_SYSTEM_ITERATION_SCRIPT\" [\"迭代任务描述\"]"
    echo "    进入: tmux attach -t $SYSTEM_ITERATION_SESSION"
}

sleep_source_main_controls() {
    require_script "$SLEEP_SOURCE_MAIN_CONTROL_SCRIPT"
    while IFS= read -r session_name; do
        [[ -z "$session_name" ]] && continue
        local source_id="${session_name#main-control-}"
        info "休眠需求子主控: $session_name"
        bash "$SLEEP_SOURCE_MAIN_CONTROL_SCRIPT" "$source_id"
    done < <(list_source_main_control_sessions)
}

wake_tracked_source_main_controls() {
    require_script "$START_SOURCE_MAIN_CONTROL_SCRIPT"
    local rows
    rows="$(list_tracked_source_main_controls)"
    while IFS=$'\t' read -r source_id runtime_state pinned last_active_at wants_session; do
        [[ -z "$source_id" ]] && continue
        [[ "$wants_session" == "1" ]] || continue
        local session_name="main-control-$source_id"
        if has_tmux_session "$session_name"; then
            ok "需求子主控已在运行，跳过: $session_name"
            continue
        fi
        info "恢复需求子主控: $session_name"
        bash "$START_SOURCE_MAIN_CONTROL_SCRIPT" "$source_id"
    done <<< "$rows"
}
