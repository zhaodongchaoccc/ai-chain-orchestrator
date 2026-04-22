#!/usr/bin/env bash

set -euo pipefail

SOURCE_ID=${1:-}
if [[ -z "$SOURCE_ID" ]]; then
    echo "[ERROR] 用法: bash sleep-source-main-control.sh <sourceId>" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION_NAME="main-control-$SOURCE_ID"

bash "$SCRIPT_DIR/handoff-source-main-control.sh" "$SOURCE_ID" >/dev/null
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

echo "[OK] 已休眠需求子主控 session: $SESSION_NAME"
