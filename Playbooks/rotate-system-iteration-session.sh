#!/usr/bin/env bash

set -euo pipefail

CURRENT_TASK=${1:-}
VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SESSION_NAME="system-iteration"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
STATE_FILE="$PROJECT_ROOT/share/global/system-iteration-state.json"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[ERROR] session '$SESSION_NAME' 不存在，请先启动" >&2
  exit 1
fi

PROMPT=$(CURRENT_TASK="$CURRENT_TASK" PROJECT_ROOT="$PROJECT_ROOT" STATE_FILE="$STATE_FILE" python3 - <<'PY'
import json, os, sys
from pathlib import Path

project_root = Path(os.environ["PROJECT_ROOT"])
current_task = os.environ.get("CURRENT_TASK", "")
state_file = Path(os.environ["STATE_FILE"])
if not current_task and state_file.exists():
    try:
        current_task = json.loads(state_file.read_text(encoding='utf-8')).get('currentTask', '')
    except Exception:
        current_task = ''
sys.path.insert(0, str(project_root / 'share'))
import runtime_sync
print(runtime_sync.build_system_iteration_prompt(current_task=current_task))
PY
)

SEED_OUTPUT=$(mktemp /tmp/ff-system-iteration-rotate.XXXXXX)
"$OPENCODE_BIN" run --format json --dir "$VAULT" --title "恢复 system-iteration 上下文 $(date '+%Y-%m-%d %H:%M:%S')" "$PROMPT" > "$SEED_OUTPUT" &
SEED_PID=$!

cleanup() {
  if [[ -n "${SEED_PID:-}" ]] && kill -0 "$SEED_PID" 2>/dev/null; then
    kill "$SEED_PID" 2>/dev/null || true
    wait "$SEED_PID" 2>/dev/null || true
  fi
  rm -f "$SEED_OUTPUT" 2>/dev/null || true
}
trap cleanup EXIT

extract_session_id() {
python3 - "$SEED_OUTPUT" <<'PY'
import json, sys
with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    for raw_line in handle:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        event = json.loads(raw_line)
        session_id = event.get('sessionID')
        if session_id:
            print(session_id)
            raise SystemExit(0)
raise SystemExit(1)
PY
}

NEW_SESSION_ID=""
deadline=$((SECONDS + 30))
while (( SECONDS < deadline )); do
  if NEW_SESSION_ID=$(extract_session_id 2>/dev/null); then
    break
  fi
  if ! kill -0 "$SEED_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ -z "$NEW_SESSION_ID" ]]; then
  echo "[ERROR] 无法创建新的 system-iteration opencode session" >&2
  exit 1
fi

if kill -0 "$SEED_PID" 2>/dev/null; then
  kill "$SEED_PID" 2>/dev/null || true
  wait "$SEED_PID" 2>/dev/null || true
fi
SEED_PID=""

PANE_ID=$(tmux list-panes -t "$SESSION_NAME" -F '#{pane_id}' | head -n 1)
WORKDIR=$(tmux display-message -p -t "$SESSION_NAME" "#{session_path}" 2>/dev/null || echo "$VAULT")
tmux respawn-pane -k -t "$PANE_ID" -c "$WORKDIR" "$OPENCODE_BIN --session $NEW_SESSION_ID '$WORKDIR'"
sleep 2
tmux clear-history -t "$PANE_ID" 2>/dev/null || true
tmux send-keys -t "$PANE_ID" C-l
echo "[OK] 已在 system-iteration 内轮换新的上下文: $NEW_SESSION_ID"
