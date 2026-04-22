#!/usr/bin/env bash

set -euo pipefail

VAULT="$HOME/PasObsidian"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SYNC_PID_FILE="$PROJECT_ROOT/Playbooks/main-control-sync.pid"
SYNC_LOG_FILE="$PROJECT_ROOT/Playbooks/main-control-sync.log"

DEFAULT_SOURCE_ID="newfee"
STATUS_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/chain-status.json"
QUEUE_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/dispatch-queue.json"
WORK_ITEMS_DIR="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/work-items"
SESSIONS_DIR="$PROJECT_ROOT/Sessions"
WORKSPACES_FILE="$PROJECT_ROOT/share/workspaces.json"
NOTIF_DIR="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/notifications"
PROCESSED_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/processed-notifications.json"
HOME_FILE="$PROJECT_ROOT/README.md"
MEMORY_FILE=""
MAPS_DIR="$PROJECT_ROOT/chain-assets/地图/$DEFAULT_SOURCE_ID"
CODE_LISTS_DIR="$PROJECT_ROOT/chain-assets/代码清单/$DEFAULT_SOURCE_ID"
SYNC_SCRIPT="$PROJECT_ROOT/share/runtime_sync.py"

echo $$ > "$SYNC_PID_FILE"
mkdir -p "$(dirname "$PROCESSED_FILE")"
touch "$PROCESSED_FILE"

while true; do
  python3 "$SYNC_SCRIPT" process-notifications \
    "$STATUS_FILE" \
    "$QUEUE_FILE" \
    "$NOTIF_DIR" \
    "$PROCESSED_FILE" \
    "$HOME_FILE" \
    "$MEMORY_FILE" \
    "$MAPS_DIR" \
    "$CODE_LISTS_DIR" >> "$SYNC_LOG_FILE" 2>&1 || true
  python3 "$SYNC_SCRIPT" refresh-resume-packets \
    "$STATUS_FILE" \
    "$QUEUE_FILE" \
    "$SESSIONS_DIR" \
    "$WORK_ITEMS_DIR" >> "$SYNC_LOG_FILE" 2>&1 || true
  if [[ -f "$WORKSPACES_FILE" ]]; then
    while IFS= read -r SOURCE_ID; do
      [[ -n "$SOURCE_ID" ]] || continue
      SOURCE_STATUS_FILE="$PROJECT_ROOT/share/sources/$SOURCE_ID/chain-status.json"
      SOURCE_QUEUE_FILE="$PROJECT_ROOT/share/sources/$SOURCE_ID/dispatch-queue.json"
      SOURCE_WORK_ITEMS_DIR="$PROJECT_ROOT/share/sources/$SOURCE_ID/work-items"
      SOURCE_SESSIONS_DIR="$PROJECT_ROOT/Sessions/sources/$SOURCE_ID"
      [[ -f "$SOURCE_STATUS_FILE" && -f "$SOURCE_QUEUE_FILE" ]] || continue
      python3 "$SYNC_SCRIPT" refresh-resume-packets \
        "$SOURCE_STATUS_FILE" \
        "$SOURCE_QUEUE_FILE" \
        "$SOURCE_SESSIONS_DIR" \
        "$SOURCE_WORK_ITEMS_DIR" \
        "$SOURCE_ID" >> "$SYNC_LOG_FILE" 2>&1 || true
    done < <(
      WORKSPACES_FILE="$WORKSPACES_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

workspace_file = Path(os.environ["WORKSPACES_FILE"])
if not workspace_file.exists():
    raise SystemExit(0)

try:
    rows = json.loads(workspace_file.read_text(encoding="utf-8"))
except Exception:
    raise SystemExit(0)

for row in rows if isinstance(rows, list) else []:
    if isinstance(row, dict) and row.get("enabled") and isinstance(row.get("sourceId"), str) and row["sourceId"].strip():
        print(row["sourceId"].strip())
PY
    )
  fi
  sleep 5
done
