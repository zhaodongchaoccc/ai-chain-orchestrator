#!/usr/bin/env bash

set -euo pipefail

SOURCE_ID=${1:-}
if [[ -z "$SOURCE_ID" ]]; then
  echo "[ERROR] 用法: bash Playbooks/purge-test-source.sh <sourceId>" >&2
  exit 1
fi

if [[ "$SOURCE_ID" != "testall" && "$SOURCE_ID" != "b" ]]; then
  echo "[ERROR] 当前仅允许清理测试 source：testall / b" >&2
  exit 1
fi

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
MAPS_DIR="$PROJECT_ROOT/chain-assets/地图/$SOURCE_ID"
CODELISTS_DIR="$PROJECT_ROOT/chain-assets/代码清单/$SOURCE_ID"
REVIEWS_DIR="$PROJECT_ROOT/chain-assets/波次总结/$SOURCE_ID"
SESSIONS_DIR="$PROJECT_ROOT/Sessions/sources/$SOURCE_ID"
SHARE_DIR="$PROJECT_ROOT/share/sources/$SOURCE_ID"
WORKSPACES_JSON="$PROJECT_ROOT/share/workspaces.json"

cleanup_path() {
  local target="$1"
  if [[ -e "$target" ]]; then
    rm -rf "$target"
    echo "[removed] $target"
  fi
}

cleanup_path "$MAPS_DIR"
cleanup_path "$CODELISTS_DIR"
cleanup_path "$REVIEWS_DIR"
cleanup_path "$SESSIONS_DIR"
cleanup_path "$SHARE_DIR"

python3 - "$WORKSPACES_JSON" "$SOURCE_ID" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
source_id = sys.argv[2]
data = json.loads(path.read_text(encoding="utf-8"))
filtered = [item for item in data if item.get("sourceId") != source_id]
path.write_text(json.dumps(filtered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"[updated] {path}")
PY

echo "[done] 已清理测试 source: $SOURCE_ID"
