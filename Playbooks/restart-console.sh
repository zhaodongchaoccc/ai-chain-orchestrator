#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

bash "$PROJECT_ROOT/Playbooks/stop-console.sh"
bash "$PROJECT_ROOT/Playbooks/start-console.sh"
