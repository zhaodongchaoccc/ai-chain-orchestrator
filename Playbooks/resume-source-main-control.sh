#!/usr/bin/env bash

set -euo pipefail

SOURCE_ID=${1:-}
if [[ -z "$SOURCE_ID" ]]; then
  echo "[ERROR] 用法: bash resume-source-main-control.sh <sourceId>" >&2
  exit 1
fi

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SESSION_NAME="main-control-$SOURCE_ID"
PROMPT_TMP=$(mktemp "/tmp/ff-source-main-control-resume-${SOURCE_ID}.XXXXXX")
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  bash "$PROJECT_ROOT/Playbooks/start-source-main-control.sh" "$SOURCE_ID"
  exit 0
fi

SOURCE_ID="$SOURCE_ID" PROJECT_ROOT="$PROJECT_ROOT" PROMPT_TMP="$PROMPT_TMP" python3 - <<'PY'
import json, os, sys
from pathlib import Path

source_id = os.environ["SOURCE_ID"]
project_root = Path(os.environ["PROJECT_ROOT"])
prompt_tmp = Path(os.environ["PROMPT_TMP"])
label = source_id
workspaces = project_root / "share" / "workspaces.json"
if workspaces.exists():
    try:
        for entry in json.loads(workspaces.read_text(encoding="utf-8")):
            if isinstance(entry, dict) and entry.get("sourceId") == source_id:
                label = entry.get("label", source_id)
                break
    except Exception:
        pass
sys.path.insert(0, str(project_root / "share"))
import runtime_sync
content = runtime_sync.build_source_main_control_resume_prompt(source_id, source_label=label, latest_path=str(project_root / "Sessions" / "sources" / source_id / "LATEST.md"), main_packet_path=str(project_root / "Sessions" / "sources" / source_id / "main-control-resume.json"), chain_status_path=str(project_root / "share" / "sources" / source_id / "chain-status.json"), queue_path=str(project_root / "share" / "sources" / source_id / "dispatch-queue.json"), source_doc_path=str(project_root / "demands" / source_id), work_items_dir=str(project_root / "share" / "sources" / source_id / "work-items"))
prompt_tmp.write_text(content, encoding="utf-8")
PY

PANE_COMMAND=$(tmux display-message -p -t "$SESSION_NAME" "#{pane_current_command}" 2>/dev/null || true)
if [[ "$PANE_COMMAND" != "node" ]]; then
  tmux send-keys -t "$SESSION_NAME" C-c
  tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter
  sleep 5
fi

tmux send-keys -t "$SESSION_NAME" "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter
echo "[OK] 已向 $SESSION_NAME 发送恢复提示"
