#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_ff-control-center-common.sh"

require_script "$WORKSPACE_STOP_SCRIPT"
require_script "$CONSOLE_STOP_SCRIPT"
require_script "$SLEEP_SOURCE_MAIN_CONTROL_SCRIPT"

info "停止 FF Control Center stack..."

if console_has_runtime_artifacts; then
    bash "$CONSOLE_STOP_SCRIPT"
else
    ok "Console 未运行，跳过停止"
fi

if source_main_controls_running; then
    sleep_source_main_controls
else
    ok "需求子主控未运行，跳过休眠"
fi

if workspace_has_runtime_artifacts; then
    bash "$WORKSPACE_STOP_SCRIPT"
else
    ok "Workspace 未运行，跳过停止"
fi

echo ""
ok "FF Control Center stack 已停止"
printf '  - workspace: %s\n' "$(workspace_state_label)"
printf '  - console:   %s\n' "$(console_state_label)"
