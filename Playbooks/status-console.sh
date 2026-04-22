#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
FF_CONSOLE_PORT="${FF_CONSOLE_PORT:-8787}"
FF_CONSOLE_WEB_PORT="${FF_CONSOLE_WEB_PORT:-4173}"

SERVER_PID_FILE="$PROJECT_ROOT/Playbooks/console-server.pid"
SERVER_RUNTIME_PID_FILE="$PROJECT_ROOT/Playbooks/console-server-runtime.pid"
WEB_PID_FILE="$PROJECT_ROOT/Playbooks/console-web.pid"
WEB_RUNTIME_PID_FILE="$PROJECT_ROOT/Playbooks/console-web-runtime.pid"

listener_pid() {
    local port="$1"
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

read_pid_file() {
    local pid_file="$1"
    [[ -f "$pid_file" ]] || return 0
    tr -d '[:space:]' < "$pid_file"
}

process_started_at() {
    local pid="$1"
    [[ -n "$pid" ]] || return 0
    ps -p "$pid" -o lstart= 2>/dev/null | sed 's/^ *//' || true
}

print_service_status() {
    local name="$1"
    local port="$2"
    local supervisor_file="$3"
    local runtime_file="$4"

    local listener
    local runtime
    local supervisor
    local started_at
    local started_pid

    listener=$(listener_pid "$port")
    supervisor=$(read_pid_file "$supervisor_file")
    runtime=$(read_pid_file "$runtime_file")
    started_pid="$runtime"
    if [[ -z "$started_pid" ]]; then
        started_pid="$listener"
    fi
    if [[ -z "$started_pid" ]]; then
        started_pid="$supervisor"
    fi
    started_at=$(process_started_at "$started_pid")

    if [[ -n "$listener" ]]; then
        printf '%s: 运行中\n' "$name"
        printf '  listener PID: %s\n' "$listener"
        if [[ -n "$supervisor" ]]; then
            printf '  supervisor PID: %s\n' "$supervisor"
        fi
        if [[ -n "$runtime" ]]; then
            printf '  runtime PID: %s\n' "$runtime"
        fi
        printf '  port: %s\n' "$port"
        if [[ -n "$started_at" ]]; then
            printf '  startedAt: %s\n' "$started_at"
        fi
        return 0
    fi

    printf '%s: 未运行\n' "$name"
    if [[ -n "$supervisor" ]]; then
        printf '  last supervisor PID: %s\n' "$supervisor"
    fi
    if [[ -n "$runtime" ]]; then
        printf '  last runtime PID: %s\n' "$runtime"
    fi
    printf '  port: %s\n' "$port"
}

print_service_status "Console server" "$FF_CONSOLE_PORT" "$SERVER_PID_FILE" "$SERVER_RUNTIME_PID_FILE"
print_service_status "Console web" "$FF_CONSOLE_WEB_PORT" "$WEB_PID_FILE" "$WEB_RUNTIME_PID_FILE"
