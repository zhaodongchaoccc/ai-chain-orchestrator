#!/usr/bin/env bash

set -euo pipefail

CURRENT_TASK=${1:-}
VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SESSION_NAME="system-iteration"
PROMPT_TMP=$(mktemp "/tmp/ff-system-iteration-resume.XXXXXX")
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
STATE_FILE="$PROJECT_ROOT/share/global/system-iteration-state.json"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  bash "$PROJECT_ROOT/Playbooks/start/start-system-iteration-session.sh" "$CURRENT_TASK"
  exit 0
fi

CURRENT_TASK="$CURRENT_TASK" PROJECT_ROOT="$PROJECT_ROOT" PROMPT_TMP="$PROMPT_TMP" STATE_FILE="$STATE_FILE" python3 - <<'PY'
import json, os, sys
from pathlib import Path

project_root = Path(os.environ["PROJECT_ROOT"])
prompt_tmp = Path(os.environ["PROMPT_TMP"])
current_task = os.environ.get("CURRENT_TASK", "")
state_file = Path(os.environ["STATE_FILE"])
if not current_task and state_file.exists():
    try:
        current_task = json.loads(state_file.read_text(encoding="utf-8")).get("currentTask", "")
    except Exception:
        current_task = ""
sys.path.insert(0, str(project_root / "share"))
import runtime_sync
content = runtime_sync.build_system_iteration_prompt(current_task=current_task)
prompt_tmp.write_text(content, encoding="utf-8")
PY

PANE_COMMAND=$(tmux display-message -p -t "$SESSION_NAME" "#{pane_current_command}" 2>/dev/null || true)
if [[ "$PANE_COMMAND" != "node" ]]; then
  tmux send-keys -t "$SESSION_NAME" C-c
  tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter
  sleep 5
fi

tmux send-keys -t "$SESSION_NAME" "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter
echo "[OK] 已向 system-iteration 发送恢复提示"
