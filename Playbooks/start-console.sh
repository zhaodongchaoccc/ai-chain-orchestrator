#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
CONSOLE_ROOT="$PROJECT_ROOT/Console"
SERVER_ROOT="$CONSOLE_ROOT/server"
WEB_ROOT="$CONSOLE_ROOT/web"
SERVER_BIN="$SERVER_ROOT/node_modules/.bin/tsx"
WEB_BIN="$WEB_ROOT/node_modules/.bin/vite"
SERVICE_RUNNER="$PROJECT_ROOT/Playbooks/run-console-service.sh"
SERVER_RUNNER="$PROJECT_ROOT/Playbooks/run-console-server.sh"
WEB_RUNNER="$PROJECT_ROOT/Playbooks/run-console-web.sh"

FF_CONSOLE_HOST="${FF_CONSOLE_HOST:-127.0.0.1}"
FF_CONSOLE_PORT="${FF_CONSOLE_PORT:-8787}"
FF_CONSOLE_WEB_PORT="${FF_CONSOLE_WEB_PORT:-4173}"

SERVER_PID_FILE="$PROJECT_ROOT/Playbooks/console-server.pid"
WEB_PID_FILE="$PROJECT_ROOT/Playbooks/console-web.pid"
SERVER_LOG_FILE="$PROJECT_ROOT/Playbooks/console-server.log"
WEB_LOG_FILE="$PROJECT_ROOT/Playbooks/console-web.log"
SERVER_RUNTIME_PID_FILE="$PROJECT_ROOT/Playbooks/console-server-runtime.pid"
WEB_RUNTIME_PID_FILE="$PROJECT_ROOT/Playbooks/console-web-runtime.pid"

SERVER_COMMAND_HINT="$SERVER_RUNNER"
WEB_COMMAND_HINT="$WEB_RUNNER"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC}  $*"; exit 1; }

command_matches() {
    local pid="$1"
    local hint="$2"
    [[ -n "$pid" ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    local command
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    [[ "$command" == *"$hint"* ]]
}

listener_pid() {
    local port="$1"
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -n 1 || true
}

ensure_no_valid_pid_file() {
    local pid_file="$1"
    local hint="$2"
    local name="$3"

    if [[ ! -f "$pid_file" ]]; then
        return 0
    fi

    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if command_matches "$pid" "$hint"; then
        error "$name 已在运行 (PID: $pid)。如需替换旧实例，请运行: bash $PROJECT_ROOT/Playbooks/restart-console.sh"
    fi

    warn "清理失效的 PID 文件: $pid_file${pid:+ (PID: $pid)}"
    rm -f "$pid_file"
}

wait_for_listener_pid() {
    local port="$1"
    local launcher_pid="$2"
    local attempts=0
    local pid=""

    while [[ "$attempts" -lt 100 ]]; do
        pid=$(listener_pid "$port")
        if [[ -n "$pid" ]]; then
            printf '%s\n' "$pid"
            return 0
        fi

        if [[ -n "$launcher_pid" ]] && ! kill -0 "$launcher_pid" 2>/dev/null; then
            break
        fi

        sleep 0.2
        attempts=$((attempts + 1))
    done

    return 1
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

require_binary() {
    local binary_path="$1"
    local label="$2"
    [[ -x "$binary_path" ]] || error "$label 启动文件不存在或不可执行: $binary_path"
}

start_service() {
    local name="$1"
    local pid_file="$2"
    local runtime_pid_file="$3"
    local log_file="$4"
    local port="$5"
    local cwd="$6"
    shift 6

    local env_args=()
    while [[ "$#" -gt 0 && "$1" == *=* ]]; do
        env_args+=("$1")
        shift
    done

    [[ "$#" -gt 0 ]] || error "$name 启动命令缺失"

    info "启动 $name..."
    local launcher_pid
    local launcher_pid_file
    launcher_pid_file=$(mktemp)
    (
        cd "$cwd"
        nohup env FF_CONSOLE_SUPERVISED="1" FF_CONSOLE_SERVICE_NAME="$name" FF_CONSOLE_RUNTIME_PID_FILE="$runtime_pid_file" "${env_args[@]}" "$SERVICE_RUNNER" "$@" > "$log_file" 2>&1 &
        printf '%s\n' "$!" > "$launcher_pid_file"
    )
    launcher_pid=$(cat "$launcher_pid_file")
    rm -f "$launcher_pid_file"
    local listener
    if ! listener=$(wait_for_listener_pid "$port" "$launcher_pid"); then
        warn "$name 未能在预期时间内监听端口，最近日志如下："
        if [[ -f "$log_file" ]]; then
            tail -n 40 "$log_file" 2>/dev/null || true
        fi
        error "$name 启动失败，未监听端口 $port"
    fi

    printf '%s\n' "$launcher_pid" > "$pid_file"
    ok "$name 已启动 (supervisor PID: $launcher_pid, listener PID: $listener, port: $port)"
}

ensure_port_free() {
    local port="$1"
    local name="$2"
    local pid
    pid=$(listener_pid "$port")
    if [[ -n "$pid" ]]; then
        local command
        command=$(ps -p "$pid" -o command= 2>/dev/null || true)
        error "$name 端口 $port 已被占用 (PID: $pid)。当前监听命令: ${command:-unknown}。如需替换旧实例，请运行: bash $PROJECT_ROOT/Playbooks/restart-console.sh"
    fi
}

mkdir -p "$(dirname "$SERVER_PID_FILE")"

info "启动 FF Console..."

require_binary "$SERVER_BIN" "Console server"
require_binary "$WEB_BIN" "Console web"
require_binary "$SERVICE_RUNNER" "Console service runtime"
require_binary "$SERVER_RUNNER" "Console server runtime"
require_binary "$WEB_RUNNER" "Console web runtime"
ensure_no_valid_pid_file "$SERVER_PID_FILE" "$SERVER_COMMAND_HINT" "Console server"
ensure_no_valid_pid_file "$WEB_PID_FILE" "$WEB_COMMAND_HINT" "Console web"
ensure_no_valid_pid_file "$SERVER_RUNTIME_PID_FILE" "$SERVER_COMMAND_HINT" "Console server runtime"
ensure_no_valid_pid_file "$WEB_RUNTIME_PID_FILE" "$WEB_COMMAND_HINT" "Console web runtime"
ensure_port_free "$FF_CONSOLE_PORT" "Console server"
ensure_port_free "$FF_CONSOLE_WEB_PORT" "Console web"

rm -f "$SERVER_RUNTIME_PID_FILE"
rm -f "$WEB_RUNTIME_PID_FILE"
start_service "Console server" "$SERVER_PID_FILE" "$SERVER_RUNTIME_PID_FILE" "$SERVER_LOG_FILE" "$FF_CONSOLE_PORT" "$PROJECT_ROOT" \
    PROJECT_ROOT="$PROJECT_ROOT" FF_CONSOLE_HOST="$FF_CONSOLE_HOST" FF_CONSOLE_PORT="$FF_CONSOLE_PORT" \
    "$SERVER_RUNNER"

start_service "Console web" "$WEB_PID_FILE" "$WEB_RUNTIME_PID_FILE" "$WEB_LOG_FILE" "$FF_CONSOLE_WEB_PORT" "$PROJECT_ROOT" \
    PROJECT_ROOT="$PROJECT_ROOT" FF_CONSOLE_HOST="$FF_CONSOLE_HOST" FF_CONSOLE_PORT="$FF_CONSOLE_PORT" FF_CONSOLE_WEB_PORT="$FF_CONSOLE_WEB_PORT" \
    "$WEB_RUNNER"

info "浏览器地址: http://$FF_CONSOLE_HOST:$FF_CONSOLE_WEB_PORT"
