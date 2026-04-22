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
if [[ -z "$SOURCE_ID" ]]; then
    echo "[ERROR] 用法: bash start-source-main-control.sh <sourceId>" >&2
    exit 1
fi

PROJECT_ROOT="$(resolve_project_root)"
VAULT="$(cd "$PROJECT_ROOT/../.." && pwd)"
ROOT_SHARE="$PROJECT_ROOT/share"
WORKSPACES_FILE="$ROOT_SHARE/workspaces.json"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
SESSION_NAME="main-control-$SOURCE_ID"
PROMPT_TMP="/tmp/ff-source-main-control-$SOURCE_ID.md"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[WARN] session '$SESSION_NAME' 已存在，未重新启动"
    exit 0
fi

WORKTREE_PATH=$(bash "$SCRIPT_DIR/ensure-source-worktree.sh" "$SOURCE_ID")
SOURCE_DOC_PATH=$(SOURCE_ID="$SOURCE_ID" WORKSPACES_FILE="$WORKSPACES_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

source_id = os.environ["SOURCE_ID"]
workspaces_file = Path(os.environ["WORKSPACES_FILE"])

if workspaces_file.exists():
    try:
        entries = json.loads(workspaces_file.read_text(encoding="utf-8"))
    except Exception:
        entries = []
    for entry in entries if isinstance(entries, list) else []:
        if isinstance(entry, dict) and entry.get("sourceId") == source_id and isinstance(entry.get("sourceDocPath"), str):
            print(entry["sourceDocPath"])
            break
    else:
        print(f"Projects/飞枢系统/{source_id}.md")
else:
    print(f"Projects/飞枢系统/{source_id}.md")
PY
)

SOURCE_ID="$SOURCE_ID" PROJECT_ROOT="$PROJECT_ROOT" SOURCE_DOC_PATH="$SOURCE_DOC_PATH" WORKTREE_PATH="$WORKTREE_PATH" PROMPT_TMP="$PROMPT_TMP" WORKSPACES_FILE="$WORKSPACES_FILE" python3 - <<'PY'
import os, json
from pathlib import Path
import sys

source_id = os.environ["SOURCE_ID"]
project_root = os.environ["PROJECT_ROOT"]
prompt_path = Path(os.environ["PROMPT_TMP"])

# 查找 label
label = source_id
ws_path = Path(os.environ["WORKSPACES_FILE"])
if ws_path.exists():
    try:
        for ws in json.loads(ws_path.read_text(encoding="utf-8")):
            if isinstance(ws, dict) and ws.get("sourceId") == source_id:
                label = ws.get("label", source_id)
                break
    except Exception:
        pass

sys.path.insert(0, str(Path(project_root) / "share"))
import runtime_sync

content = runtime_sync.build_source_main_control_resume_prompt(
    source_id,
    source_label=label,
    source_doc_path=os.environ.get("SOURCE_DOC_PATH", f"{project_root}/05-需求/{source_id}/"),
)
prompt_path.write_text(content, encoding="utf-8")
PY

tmux new-session -d -s "$SESSION_NAME" -c "$WORKTREE_PATH"
tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter
sleep 5
tmux send-keys -t "$SESSION_NAME" "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter

echo "[OK] 已启动需求子主控 session: $SESSION_NAME"
echo "[OK] 代码工作区: $WORKTREE_PATH"
echo "[OK] 提示词文件已生成: $PROMPT_TMP"
