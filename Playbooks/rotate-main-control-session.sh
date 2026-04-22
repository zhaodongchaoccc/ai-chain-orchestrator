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

PROJECT_ROOT="$(resolve_project_root)"
VAULT="$(cd "$PROJECT_ROOT/../.." && pwd)"
MAIN_CONTROL_SESSION="${MAIN_CONTROL_SESSION:-main-control}"
HANDOFF_SCRIPT="$PROJECT_ROOT/Playbooks/handoff-main-control.sh"
RUNTIME_SYNC="$PROJECT_ROOT/share/runtime_sync.py"
LATEST_FILE="$PROJECT_ROOT/Sessions/LATEST.md"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
ROTATE_LOCK_DIR="${ROTATE_LOCK_DIR:-/tmp/ff-main-control-rotate.lock}"
ROTATE_LOG_FILE="${ROTATE_LOG_FILE:-$PROJECT_ROOT/Playbooks/rotate-main-control.log}"
SESSION_ID_TIMEOUT_SECONDS="${SESSION_ID_TIMEOUT_SECONDS:-30}"

mkdir -p "$(dirname "$ROTATE_LOG_FILE")"

log() {
  local message="$*"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" | tee -a "$ROTATE_LOG_FILE"
}

if ! mkdir "$ROTATE_LOCK_DIR" 2>/dev/null; then
  echo "[ERROR] 主控上下文轮换已在进行中，请等待当前轮换结束后再试。" >&2
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
  echo "[INFO] main-control session 不存在，自动重建..."
  bash "$PROJECT_ROOT/Playbooks/start/start-main-control-session.sh" --resume
  exit 0
fi

bash "$HANDOFF_SCRIPT"
log "handoff_done"

if [[ ! -f "$LATEST_FILE" ]]; then
  echo "[ERROR] 交接失败：未生成 $LATEST_FILE"
  exit 1
fi

PROMPT=$(python3 - <<PY
from pathlib import Path
import sys
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync
print(runtime_sync.build_main_control_resume_prompt(latest_path='$LATEST_FILE'))
PY
)

SESSION_TITLE="恢复飞枢系统全局主控 session 上下文 $(date '+%Y-%m-%d %H:%M:%S')"
SEED_OUTPUT=$(mktemp /tmp/ff-main-control-rotate.XXXXXX)
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

extract_session_id_fallback() {
python3 - "$SEED_OUTPUT" <<'PY'
import re
import sys

path = sys.argv[1]
text = open(path, "r", encoding="utf-8", errors="ignore").read()
match = re.search(r'"sessionID"\s*:\s*"([^"]+)"', text)
if match:
    print(match.group(1))
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
  if NEW_SESSION_ID=$(extract_session_id_fallback 2>/dev/null); then
    :
  fi
fi

if [[ -z "$NEW_SESSION_ID" ]]; then
  echo "[ERROR] 无法创建新的主控 opencode session（未在限定时间内拿到 sessionID）" >&2
  echo "[ERROR] 无法创建新的主控 opencode session" >&2
  exit 1
fi

log "session_id_received $NEW_SESSION_ID"

if kill -0 "$SEED_PID" 2>/dev/null; then
  kill "$SEED_PID" 2>/dev/null || true
  wait "$SEED_PID" 2>/dev/null || true
fi
SEED_PID=""

# 真正重启 pane 内进程，并显式续到新创建的 session，避免恢复旧上下文
PANE_ID=$(tmux list-panes -t "$MAIN_CONTROL_SESSION" -F '#{pane_id}' | head -n 1)
if [[ -z "$PANE_ID" ]]; then
  echo "[ERROR] 无法定位 main-control pane"
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
  echo "[ERROR] 已创建新 session ${NEW_SESSION_ID}，但 main-control pane 未成功切换到该上下文" >&2
  exit 1
fi

log "pane_respawn_verified $PANE_ID $NEW_SESSION_ID"

echo "已在 tmux session '$MAIN_CONTROL_SESSION' 内轮换新的主控上下文。"
echo "新上下文将首先读取: $LATEST_FILE"
echo "新 opencode session: $NEW_SESSION_ID"
