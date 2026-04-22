#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  printf 'Usage: create-demand-source.sh <需求名>\n' >&2
  exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONSOLE_SERVER_ROOT="$PROJECT_ROOT/Console/server"

npx --yes --prefix "$CONSOLE_SERVER_ROOT" tsx "$CONSOLE_SERVER_ROOT/src/cli/create-demand-source.ts" "$@"
