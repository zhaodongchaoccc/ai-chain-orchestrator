#!/usr/bin/env bash

set -euo pipefail

SOURCE_ID=${1:-}
if [[ -z "$SOURCE_ID" ]]; then
    echo "[ERROR] 用法: bash wake-source-main-control.sh <sourceId>" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/start-source-main-control.sh" "$SOURCE_ID"
