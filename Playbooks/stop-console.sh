#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SERVER_ROOT="$PROJECT_ROOT/Console/server"
WEB_ROOT="$PROJECT_ROOT/Console/web"
FF_CONSOLE_PORT="${FF_CONSOLE_PORT:-8787}"
FF_CONSOLE_WEB_PORT="${FF_CONSOLE_WEB_PORT:-4173}"
SERVER_PID_FILE="$PROJECT_ROOT/Playbooks/console-server.pid"
WEB_PID_FILE="$PROJECT_ROOT/Playbooks/console-web.pid"
SERVER_RUNTIME_PID_FILE="$PROJECT_ROOT/Playbooks/console-server-runtime.pid"
WEB_RUNTIME_PID_FILE="$PROJECT_ROOT/Playbooks/console-web-runtime.pid"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC}  $*"; exit 1; }

listener_pid() {
    local port="$1"
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

terminate_pid() {
    local pid="$1"
    local name="$2"
    [[ -n "$pid" ]] || return 0
    kill -0 "$pid" 2>/dev/null || return 0
    info "停止 $name (PID: $pid)..."
    kill "$pid" 2>/dev/null || true
}

wait_for_port_release() {
    local port="$1"
    local attempts=0
    while [[ "$attempts" -lt 50 ]]; do
        if [[ -z "$(listener_pid "$port")" ]]; then
            return 0
        fi
        sleep 0.2
        attempts=$((attempts + 1))
    done
    return 1
}

cleanup_by_pattern() {
    local pattern="$1"
    pkill -f "$pattern" 2>/dev/null || true
}

stop_service() {
    local pid_file="$1"
    local port="$2"
    local name="$3"
    shift 3

    if [[ ! -f "$pid_file" ]]; then
        warn "$name PID 文件不存在，继续按端口与特征清理"
    else
        local pid
        pid=$(cat "$pid_file" 2>/dev/null || true)
        terminate_pid "$pid" "$name"
    fi

    local runtime_pid=""
    local runtime_pid_file=""
    if [[ "$name" == "Console server" ]]; then
        runtime_pid_file="$SERVER_RUNTIME_PID_FILE"
    elif [[ "$name" == "Console web" ]]; then
        runtime_pid_file="$WEB_RUNTIME_PID_FILE"
    fi

    if [[ -n "$runtime_pid_file" && -f "$runtime_pid_file" ]]; then
        runtime_pid=$(cat "$runtime_pid_file" 2>/dev/null || true)
        terminate_pid "$runtime_pid" "$name runtime"
    fi

    local listener
    listener=$(listener_pid "$port")
    if [[ -n "$listener" ]]; then
        terminate_pid "$listener" "$name listener"
    fi

    if ! wait_for_port_release "$port"; then
        while [[ "$#" -gt 0 ]]; do
            cleanup_by_pattern "$1"
            shift
        done
        wait_for_port_release "$port" || error "$name 端口 $port 仍被占用，请手动检查后重试"
    fi

    rm -f "$pid_file"
    [[ -n "$runtime_pid_file" ]] && rm -f "$runtime_pid_file"
    ok "$name 已停止"
}

info "停止 FF Console..."
stop_service "$SERVER_PID_FILE" "$FF_CONSOLE_PORT" "Console server" \
    "$SERVER_ROOT/node_modules/.bin/tsx" \
    "$SERVER_ROOT/node_modules/tsx/dist" \
    "$SERVER_ROOT.*src/index.ts"
stop_service "$WEB_PID_FILE" "$FF_CONSOLE_WEB_PORT" "Console web" \
    "$WEB_ROOT/node_modules/.bin/vite" \
    "$WEB_ROOT/node_modules/vite/bin" \
    "$WEB_ROOT.*vite"
ok "FF Console 已停止"
