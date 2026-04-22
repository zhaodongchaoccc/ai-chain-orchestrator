#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_project_root() {
    local vault_root="${VAULT:-$HOME/PasObsidian}"
    local candidates=()
    candidates+=("$vault_root/Projects/飞枢系统" "$vault_root/Projects/ff" "$(cd "$SCRIPT_DIR/.." && pwd)")

    local candidate
    for candidate in "${candidates[@]}"; do
        if [[ -d "$candidate/share" ]]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    printf '%s\n' "$vault_root/Projects/飞枢系统"
}

SOURCE_ID=${1:-}
TIMESTAMP=${2:-$(date '+%Y-%m-%d-%H%M')}

if [[ -z "$SOURCE_ID" ]]; then
    echo "[ERROR] 用法: bash handoff-source-main-control.sh <sourceId> [timestamp]" >&2
    exit 1
fi

PROJECT_ROOT="$(resolve_project_root)"
VAULT="$(cd "$PROJECT_ROOT/../.." && pwd)"
STATUS_FILE="$PROJECT_ROOT/share/sources/$SOURCE_ID/chain-status.json"
QUEUE_FILE="$PROJECT_ROOT/share/sources/$SOURCE_ID/dispatch-queue.json"
WORK_ITEMS_DIR="$PROJECT_ROOT/share/sources/$SOURCE_ID/work-items"
SESSIONS_DIR="$PROJECT_ROOT/Sessions/sources/$SOURCE_ID"

SOURCE_ID="$SOURCE_ID" STATUS_FILE="$STATUS_FILE" QUEUE_FILE="$QUEUE_FILE" WORK_ITEMS_DIR="$WORK_ITEMS_DIR" SESSIONS_DIR="$SESSIONS_DIR" TIMESTAMP="$TIMESTAMP" python3 - <<'PY'
import json
import os
import sys
from pathlib import Path

project_root = Path(os.environ["SESSIONS_DIR"]).parents[2]
sys.path.insert(0, str(project_root / "share"))
import runtime_sync

source_id = os.environ["SOURCE_ID"]
status = runtime_sync.load_json(Path(os.environ["STATUS_FILE"]), {})
queue = runtime_sync.load_json(Path(os.environ["QUEUE_FILE"]), {"maxConcurrent": 0, "pendingStart": [], "updatedAt": ""})
sessions = []
for session_name in runtime_sync.get_tmux_session_names():
    parsed = runtime_sync.parse_chain_session_name(session_name)
    if parsed is None:
        continue
    session_source_id, _chain_id = parsed
    if session_source_id == source_id:
        sessions.append(session_name)

handoff_path, latest_path = runtime_sync.write_handoff_files(
    sessions_dir=Path(os.environ["SESSIONS_DIR"]),
    chain_status=status,
    queue=queue,
    tmux_sessions=sessions,
    timestamp=os.environ["TIMESTAMP"],
    work_items_dir=Path(os.environ["WORK_ITEMS_DIR"]),
    source_id=source_id,
)
print(json.dumps({"handoff": str(handoff_path), "latest": str(latest_path)}, ensure_ascii=False))
PY
