#!/usr/bin/env bash

set -euo pipefail

SOURCE_ID=${1:-}
if [[ -z "$SOURCE_ID" ]]; then
    echo "[ERROR] 用法: bash rotate-source-main-control.sh <sourceId>" >&2
    exit 1
fi

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
MAIN_CONTROL_SESSION="main-control-$SOURCE_ID"
HANDOFF_SCRIPT="$PROJECT_ROOT/Playbooks/handoff-source-main-control.sh"
RUNTIME_SYNC="$PROJECT_ROOT/share/runtime_sync.py"
LATEST_FILE="$PROJECT_ROOT/Sessions/sources/$SOURCE_ID/LATEST.md"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
ROTATE_LOCK_DIR="${ROTATE_LOCK_DIR:-/tmp/ff-main-control-rotate-$SOURCE_ID.lock}"
ROTATE_LOG_FILE="${ROTATE_LOG_FILE:-$PROJECT_ROOT/Playbooks/rotate-source-main-control-$SOURCE_ID.log}"
SESSION_ID_TIMEOUT_SECONDS="${SESSION_ID_TIMEOUT_SECONDS:-30}"

mkdir -p "$(dirname "$ROTATE_LOG_FILE")"

log() {
  local message="$*"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" | tee -a "$ROTATE_LOG_FILE"
}

if ! mkdir "$ROTATE_LOCK_DIR" 2>/dev/null; then
  echo "[ERROR] 需求子主控上下文轮换已在进行中，请稍后再试。" >&2
  exit 1
fi

SEED_PID=""
SEED_OUTPUT=""
cleanup() {
  if [[ -n "$SEED_PID" ]] && kill -0 "$SEED_PID" 2>/dev/null; then
    kill "$SEED_PID" 2>/dev/null || true
    wait "$SEED_PID" 2>/dev/null || true
  fi
  [[ -n "$SEED_OUTPUT" ]] && rm -f "$SEED_OUTPUT" 2>/dev/null || true
  rmdir "$ROTATE_LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

if ! tmux has-session -t "$MAIN_CONTROL_SESSION" 2>/dev/null; then
  echo "[ERROR] source main-control session 不存在: $MAIN_CONTROL_SESSION" >&2
  exit 1
fi

bash "$HANDOFF_SCRIPT" "$SOURCE_ID"
log "handoff_done"

PROMPT=$(python3 - <<PY
import sys
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync

# 查找 source 的 label（中文名）
import json
from pathlib import Path
label = '$SOURCE_ID'
ws_path = Path('$PROJECT_ROOT/share/workspaces.json')
if ws_path.exists():
    try:
        for ws in json.loads(ws_path.read_text(encoding='utf-8')):
            if isinstance(ws, dict) and ws.get('sourceId') == '$SOURCE_ID':
                label = ws.get('label', '$SOURCE_ID')
                break
    except Exception:
        pass

print(runtime_sync.build_source_main_control_resume_prompt(
    '$SOURCE_ID',
    source_label=label,
    latest_path='$LATEST_FILE',
    main_packet_path='${PROJECT_ROOT}/Sessions/sources/${SOURCE_ID}/main-control-resume.json',
    chain_status_path='${PROJECT_ROOT}/share/sources/${SOURCE_ID}/chain-status.json',
    queue_path='${PROJECT_ROOT}/share/sources/${SOURCE_ID}/dispatch-queue.json',
    source_doc_path='${PROJECT_ROOT}/demands/${SOURCE_ID}/',
    work_items_dir='${PROJECT_ROOT}/share/sources/${SOURCE_ID}/work-items',
))
PY
)

SESSION_TITLE="恢复飞枢系统需求源 $SOURCE_ID 子主控 session 上下文 $(date '+%Y-%m-%d %H:%M:%S')"
SEED_OUTPUT=$(mktemp /tmp/ff-source-main-control-rotate.XXXXXX)
SEED_DIR="$VAULT"
log "session_seed_started"

"$OPENCODE_BIN" run --format json --dir "$SEED_DIR" --title "$SESSION_TITLE" "$PROMPT" > "$SEED_OUTPUT" 2>>"$ROTATE_LOG_FILE" &
SEED_PID=$!

extract_session_id() {
python3 - "$SEED_OUTPUT" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    for raw_line in handle:
        raw_line = raw_line.strip()
        if not raw_line:
            continue
        event = json.loads(raw_line)
        session_id = event.get("sessionID")
        if session_id:
            print(session_id)
            raise SystemExit(0)
raise SystemExit(1)
PY
}

NEW_SESSION_ID=""
deadline=$((SECONDS + SESSION_ID_TIMEOUT_SECONDS))
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
  echo "[ERROR] 无法创建新的需求子主控 opencode session。" >&2
  exit 1
fi

log "session_id_received $NEW_SESSION_ID"

if kill -0 "$SEED_PID" 2>/dev/null; then
  kill "$SEED_PID" 2>/dev/null || true
  wait "$SEED_PID" 2>/dev/null || true
fi
SEED_PID=""

PANE_ID=$(tmux list-panes -t "$MAIN_CONTROL_SESSION" -F '#{pane_id}' | head -n 1)
if [[ -z "$PANE_ID" ]]; then
  echo "[ERROR] 无法定位 $MAIN_CONTROL_SESSION pane" >&2
  exit 1
fi

WORKDIR=$(tmux display-message -p -t "$MAIN_CONTROL_SESSION" "#{session_path}" 2>/dev/null || echo "$VAULT")
log "pane_respawn_started $PANE_ID"
tmux respawn-pane -k -t "$PANE_ID" -c "$WORKDIR" "$OPENCODE_BIN --session $NEW_SESSION_ID '$WORKDIR'"
sleep 2
tmux clear-history -t "$PANE_ID" 2>/dev/null || true
tmux send-keys -t "$PANE_ID" C-l

PANE_DEAD=$(tmux display-message -p -t "$PANE_ID" "#{pane_dead}" 2>/dev/null || printf '1')
PANE_COMMAND=$(tmux display-message -p -t "$PANE_ID" "#{pane_current_command}" 2>/dev/null || true)

if [[ "$PANE_DEAD" != "0" || -z "$PANE_COMMAND" ]]; then
  echo "[ERROR] 已创建新 session ${NEW_SESSION_ID}，但 ${MAIN_CONTROL_SESSION} pane 未成功切换到该上下文" >&2
  exit 1
fi

log "pane_respawn_verified $PANE_ID $NEW_SESSION_ID"

echo "已在 tmux session '$MAIN_CONTROL_SESSION' 内轮换新的需求子主控上下文。"
echo "新上下文将首先读取: $LATEST_FILE"
echo "新 opencode session: $NEW_SESSION_ID"
