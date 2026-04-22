#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_ROOT="$PROJECT_ROOT/Console/server"
TSX_BIN="$SERVER_ROOT/node_modules/.bin/tsx"

if [[ ! -x "$TSX_BIN" ]]; then
  echo "[ERROR] tsx 不可用: $TSX_BIN" >&2
  exit 1
fi

cd "$SERVER_ROOT"
"$TSX_BIN" src/tools/cleanup-legacy-work-item-modes.ts "$PROJECT_ROOT"
