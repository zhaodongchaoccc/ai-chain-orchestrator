#!/usr/bin/env bash

set -euo pipefail

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SESSION_NAME="main-control"
LATEST_FILE="$PROJECT_ROOT/Sessions/LATEST.md"
PROMPT_TMP=$(mktemp "/tmp/ff-main-control-resume.XXXXXX")
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  bash "$PROJECT_ROOT/Playbooks/start/start-main-control-session.sh" --resume
  exit 0
fi

python3 - <<PY
import sys
from pathlib import Path
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync

content = runtime_sync.build_main_control_resume_prompt(latest_path='$LATEST_FILE')
Path('$PROMPT_TMP').write_text(content, encoding='utf-8')
PY

PANE_COMMAND=$(tmux display-message -p -t "$SESSION_NAME" "#{pane_current_command}" 2>/dev/null || true)
if [[ "$PANE_COMMAND" != "node" ]]; then
  tmux send-keys -t "$SESSION_NAME" C-c
  tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter
  sleep 5
fi

tmux send-keys -t "$SESSION_NAME" "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter
echo "[OK] 已向 main-control 发送恢复提示"
