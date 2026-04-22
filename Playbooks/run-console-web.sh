#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
WEB_ROOT="$PROJECT_ROOT/Console/web"
WEB_BIN="$WEB_ROOT/node_modules/.bin/vite"

cd "$WEB_ROOT"
exec "$WEB_BIN" --host "${FF_CONSOLE_HOST:-127.0.0.1}" --port "${FF_CONSOLE_WEB_PORT:-4173}"
