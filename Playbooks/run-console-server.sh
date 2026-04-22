#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SERVER_ROOT="$PROJECT_ROOT/Console/server"
SERVER_BIN="$SERVER_ROOT/node_modules/.bin/tsx"
SERVER_TSX_PREFLIGHT="$SERVER_ROOT/node_modules/tsx/dist/preflight.cjs"
SERVER_TSX_LOADER="$SERVER_ROOT/node_modules/tsx/dist/loader.mjs"

cd "$SERVER_ROOT"

if [[ -f "$SERVER_TSX_PREFLIGHT" && -f "$SERVER_TSX_LOADER" ]]; then
  exec node --require "$SERVER_TSX_PREFLIGHT" --import "file://$SERVER_TSX_LOADER" src/index.ts
fi

exec "$SERVER_BIN" src/index.ts
