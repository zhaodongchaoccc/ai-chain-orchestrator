#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/_ff-control-center-common.sh"

require_script "$SCRIPT_DIR/stop-ff-control-center.sh"
require_script "$SCRIPT_DIR/start-ff-control-center.sh"

info "重启 FF Control Center stack..."
bash "$SCRIPT_DIR/stop-ff-control-center.sh"
echo ""
bash "$SCRIPT_DIR/start-ff-control-center.sh" "$@"
