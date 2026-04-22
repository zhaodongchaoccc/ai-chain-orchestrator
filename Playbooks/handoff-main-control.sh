#!/usr/bin/env bash

set -euo pipefail

VAULT="$HOME/PasObsidian"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SYNC_SCRIPT="$PROJECT_ROOT/share/runtime_sync.py"

DEFAULT_SOURCE_ID="newfee"
STATUS_FILE="$PROJECT_ROOT/share/project-status.json"
QUEUE_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/dispatch-queue.json"
NOTIF_DIR="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/notifications"
PROCESSED_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/processed-notifications.json"
HOME_FILE="$PROJECT_ROOT/README.md"
MEMORY_FILE=""
MAPS_DIR="$PROJECT_ROOT/chain-assets/地图/$DEFAULT_SOURCE_ID"
CODE_LISTS_DIR="$PROJECT_ROOT/chain-assets/代码清单/$DEFAULT_SOURCE_ID"
SESSIONS_DIR="$PROJECT_ROOT/Sessions"

TIMESTAMP="${1:-$(date '+%Y-%m-%d-%H%M')}"

python3 "$SYNC_SCRIPT" process-notifications \
  "$STATUS_FILE" \
  "$QUEUE_FILE" \
  "$NOTIF_DIR" \
  "$PROCESSED_FILE" \
  "$HOME_FILE" \
  "$MEMORY_FILE" \
  "$MAPS_DIR" \
  "$CODE_LISTS_DIR" >/dev/null

RESULT=$(python3 "$SYNC_SCRIPT" write-handoff \
  "$STATUS_FILE" \
  "$QUEUE_FILE" \
  "$SESSIONS_DIR" \
  "$TIMESTAMP")

# 同步生成跨 source 全局恢复包
python3 - <<PY
import json, sys
from pathlib import Path
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync

packet = runtime_sync.build_global_resume_packet(
    workspaces_path='$PROJECT_ROOT/share/workspaces.json',
    sessions_dir='$PROJECT_ROOT/Sessions',
    share_dir='$PROJECT_ROOT/share',
)
out = Path('$PROJECT_ROOT/Sessions/global-main-control-resume.json')
out.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

echo "$RESULT"
echo "交接完成。下一任主控先读: $PROJECT_ROOT/Sessions/LATEST.md"
