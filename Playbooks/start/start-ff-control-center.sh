#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_ff-control-center-common.sh"

require_script "$WORKSPACE_START_SCRIPT"
require_script "$CONSOLE_START_SCRIPT"
require_script "$START_SOURCE_MAIN_CONTROL_SCRIPT"
require_script "$START_SYSTEM_ITERATION_SCRIPT"

info "启动飞枢台 stack..."
info "Workspace 层状态: $(workspace_state_label)"
info "Console 层状态: $(console_state_label)"

bash "$WORKSPACE_START_SCRIPT" "$@"

if has_system_iteration_session; then
    ok "system-iteration 已在运行，跳过启动"
else
    info "启动 system-iteration 常驻基础设施 session..."
    bash "$START_SYSTEM_ITERATION_SCRIPT"
fi

wake_tracked_source_main_controls

if console_is_fully_running; then
    ok "Console 已在运行，跳过启动"
elif console_is_partially_running; then
    error "Console 处于部分运行状态，请先执行 stop-ff-control-center.sh 清理后再启动"
else
    bash "$CONSOLE_START_SCRIPT"
fi

echo ""
ok "飞枢台 stack 已就绪"
printf '  - workspace: %s\n' "$(workspace_state_label)"
printf '  - console:   %s\n' "$(console_state_label)"
printf '  - web:       http://127.0.0.1:%s\n' "$FF_CONSOLE_WEB_PORT"
