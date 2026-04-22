#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_ff-control-center-common.sh"

require_script "$WORKSPACE_STATUS_SCRIPT"
require_script "$CONSOLE_STATUS_SCRIPT"

echo -e "${CYAN}飞枢台 Stack:${NC}"
printf '  workspace: %s\n' "$(workspace_state_label)"
printf '  console:   %s\n' "$(console_state_label)"
echo ""

echo -e "${CYAN}== Workspace Layer ==${NC}"
bash "$WORKSPACE_STATUS_SCRIPT"
echo ""
print_source_main_control_status
echo ""
print_system_iteration_status
echo ""
echo -e "${CYAN}== Console Layer ==${NC}"
bash "$CONSOLE_STATUS_SCRIPT"
