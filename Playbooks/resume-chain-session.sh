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

CHAIN_INPUT=${1:-}
SOURCE_ID=${2:-}
if [[ -z "$CHAIN_INPUT" ]]; then
    echo "[ERROR] 用法: bash resume-chain-session.sh <链中文名|ChainId> [sourceId]"
    exit 1
fi

FF_ROOT="$(resolve_project_root)"
VAULT="$(cd "$FF_ROOT/../.." && pwd)"
ROOT_SHARE="$FF_ROOT/share"
WORKSPACES_FILE="$ROOT_SHARE/workspaces.json"
RUNTIME_SYNC_PY="$FF_ROOT/share/runtime_sync.py"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"

CANONICAL_SOURCE_ID="${SOURCE_ID:-newfee}"
SHARE_ROOT="$ROOT_SHARE/sources/$CANONICAL_SOURCE_ID"
MAPS_ROOT="$FF_ROOT/03-业务链资产/地图/$CANONICAL_SOURCE_ID"
CODELISTS_ROOT="$FF_ROOT/03-业务链资产/代码清单/$CANONICAL_SOURCE_ID"

CHAIN_STATUS_FILE="$SHARE_ROOT/chain-status.json"
WORK_ITEMS_DIR="$SHARE_ROOT/work-items"
SOURCE_DOC_PATH=$(SOURCE_ID="$CANONICAL_SOURCE_ID" WORKSPACES_FILE="$WORKSPACES_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

source_id = os.environ.get("SOURCE_ID", "").strip()
workspaces_file = Path(os.environ["WORKSPACES_FILE"])

if not source_id:
    print("Projects/飞枢系统/newfee.md")
elif workspaces_file.exists():
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

CHAIN_INFO=$(CHAIN_INPUT="$CHAIN_INPUT" PYTHONPATH="$FF_ROOT/share${PYTHONPATH:+:$PYTHONPATH}" python3 <<'PY'
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
START_ARGS="$CHAIN_INPUT $CANONICAL_SOURCE_ID"

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[ERROR] session '$SESSION_NAME' 不存在，请先启动该链"
    echo "[INFO] 可运行: bash $FF_ROOT/Playbooks/start-chain-session.sh $START_ARGS"
    exit 1
fi

PROMPT_TMP=$(mktemp "/tmp/ff-worker-resume-${CHAIN_ENGLISH}.XXXXXX")
CHAIN_ENGLISH="$CHAIN_ENGLISH" CHAIN_CHINESE="$CHAIN_CHINESE" CHAIN_STATUS_FILE="$CHAIN_STATUS_FILE" WORK_ITEMS_DIR="$WORK_ITEMS_DIR" MAPS_ROOT="$MAPS_ROOT" CODELISTS_ROOT="$CODELISTS_ROOT" SOURCE_DOC_PATH="$SOURCE_DOC_PATH" PYTHONPATH="$FF_ROOT/share${PYTHONPATH:+:$PYTHONPATH}" python3 <<'PY' > "$PROMPT_TMP"
import os
from pathlib import Path
import runtime_sync

chain_english = os.environ["CHAIN_ENGLISH"]
chain_status_file = Path(os.environ["CHAIN_STATUS_FILE"])
work_items_dir = Path(os.environ["WORK_ITEMS_DIR"])
maps_root = Path(os.environ["MAPS_ROOT"])
code_lists_root = Path(os.environ["CODELISTS_ROOT"])
load_json = getattr(runtime_sync, "load_json", None)

print(
    runtime_sync.build_worker_resume_prompt(
        chain_id=chain_english,
        chain_name_zh=os.environ["CHAIN_CHINESE"],
        chain_status=load_json(chain_status_file, {}) if callable(load_json) else {},
        work_items_dir=work_items_dir,
        map_path=str(maps_root / f"{chain_english}.md"),
        chain_status_path=str(chain_status_file),
        work_item_path=str(work_items_dir / f"{chain_english}.json"),
        code_list_path=str(code_lists_root / f"{chain_english}.md"),
        source_doc_path=os.environ["SOURCE_DOC_PATH"],
    )
)
PY

PANE_COMMAND=$(tmux display-message -p -t "$SESSION_NAME" "#{pane_current_command}" 2>/dev/null || true)
if [[ "$PANE_COMMAND" != "node" ]]; then
    tmux send-keys -t "$SESSION_NAME" C-c
    tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter
    sleep 5
fi

tmux send-keys -t "$SESSION_NAME" "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter

echo "[OK] 已向 session '$SESSION_NAME' 发送 LIGHT resume 提示"
echo "[OK] 业务链: $CHAIN_ENGLISH ($CHAIN_CHINESE)"
