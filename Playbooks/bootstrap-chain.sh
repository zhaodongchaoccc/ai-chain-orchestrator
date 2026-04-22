#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

python3 "$PROJECT_ROOT/share/chain_bootstrap.py" --workspace-root "$PROJECT_ROOT" "$@"
