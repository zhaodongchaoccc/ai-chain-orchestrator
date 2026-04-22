#!/usr/bin/env bash

set -euo pipefail

CHAIN_INPUT=${1:-}
SOURCE_ID=${2:-}
if [[ -z "$CHAIN_INPUT" ]]; then
  echo "[ERROR] 用法: bash rotate-chain-session.sh <链中文名|ChainId> [sourceId]" >&2
  exit 1
fi

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
ROOT_SHARE="$PROJECT_ROOT/share"
WORKSPACES_FILE="$ROOT_SHARE/workspaces.json"
PROJECT_STATUS_FILE="$ROOT_SHARE/project-status.json"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
CANONICAL_SOURCE_ID="${SOURCE_ID:-newfee}"

CHAIN_INFO=$(CHAIN_INPUT="$CHAIN_INPUT" PYTHONPATH="$PROJECT_ROOT/share${PYTHONPATH:+:$PYTHONPATH}" python3 <<'PY'
import os
import runtime_sync
chain_input = os.environ["CHAIN_INPUT"]
reverse = {value: key for key, value in runtime_sync.CHAIN_ZH.items()}
chain_id = reverse.get(chain_input, chain_input)
chain_name_zh = runtime_sync.CHAIN_ZH.get(chain_id, chain_input)
print(chain_id)
print(chain_name_zh)
PY
)
CHAIN_ENGLISH=$(printf '%s\n' "$CHAIN_INFO" | python3 -c 'import sys; print(sys.stdin.read().splitlines()[0])')
CHAIN_CHINESE=$(printf '%s\n' "$CHAIN_INFO" | python3 -c 'import sys; lines=sys.stdin.read().splitlines(); print(lines[1] if len(lines) > 1 else "")')
SESSION_NAME="chain-${CANONICAL_SOURCE_ID}-${CHAIN_ENGLISH}"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "[ERROR] session '$SESSION_NAME' 不存在，请先启动该链" >&2
  exit 1
fi

PROMPT=$(CHAIN_ENGLISH="$CHAIN_ENGLISH" CHAIN_CHINESE="$CHAIN_CHINESE" CANONICAL_SOURCE_ID="$CANONICAL_SOURCE_ID" PROJECT_ROOT="$PROJECT_ROOT" WORKSPACES_FILE="$WORKSPACES_FILE" PROJECT_STATUS_FILE="$PROJECT_STATUS_FILE" python3 - <<'PY'
import json, os, sys
from pathlib import Path

project_root = Path(os.environ["PROJECT_ROOT"])
source_id = os.environ["CANONICAL_SOURCE_ID"]
chain_english = os.environ["CHAIN_ENGLISH"]
chain_chinese = os.environ["CHAIN_CHINESE"]
sys.path.insert(0, str(project_root / "share"))
import runtime_sync

source_doc_path = f"Projects/飞枢系统/{source_id}.md"
project_status = project_root / "share" / "project-status.json"
workspaces = project_root / "share" / "workspaces.json"
if project_status.exists():
    try:
        data = json.loads(project_status.read_text(encoding="utf-8"))
        for requirement in data.get("requirements", []):
            if isinstance(requirement, dict) and requirement.get("id") == source_id and isinstance(requirement.get("docPath"), str):
                source_doc_path = requirement["docPath"]
                break
    except Exception:
        pass
elif workspaces.exists():
    try:
        data = json.loads(workspaces.read_text(encoding="utf-8"))
        for entry in data:
            if isinstance(entry, dict) and entry.get("sourceId") == source_id and isinstance(entry.get("sourceDocPath"), str):
                source_doc_path = entry["sourceDocPath"]
                break
    except Exception:
        pass

chain_status_file = project_root / "share" / "sources" / source_id / "chain-status.json"
work_items_dir = project_root / "share" / "sources" / source_id / "work-items"
maps_root = project_root / "03-业务链资产" / "地图" / source_id
code_lists_root = project_root / "03-业务链资产" / "代码清单" / source_id
load_json = getattr(runtime_sync, "load_json", None)
print(runtime_sync.build_worker_resume_prompt(chain_id=chain_english, chain_name_zh=chain_chinese, chain_status=load_json(chain_status_file, {}) if callable(load_json) else {}, work_items_dir=work_items_dir, map_path=str(maps_root / f"{chain_english}.md"), chain_status_path=str(chain_status_file), work_item_path=str(work_items_dir / f"{chain_english}.json"), code_list_path=str(code_lists_root / f"{chain_english}.md"), source_doc_path=source_doc_path))
PY
)

SEED_OUTPUT=$(mktemp /tmp/ff-chain-rotate.XXXXXX)
"$OPENCODE_BIN" run --format json --dir "$VAULT" --title "恢复业务链 $CHAIN_ENGLISH 上下文 $(date '+%Y-%m-%d %H:%M:%S')" "$PROMPT" > "$SEED_OUTPUT" &
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
  echo "[ERROR] 无法创建新的业务链 opencode session" >&2
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
echo "[OK] 已在 '$SESSION_NAME' 内轮换新的业务链上下文: $NEW_SESSION_ID"
