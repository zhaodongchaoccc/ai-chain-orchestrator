#!/usr/bin/env bash
# 用法: bash start-chain-session.sh <链中文名|ChainId> [sourceId]
# 例如: bash start-chain-session.sh 合同自动编号

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

CHAIN_CHINESE=${1:-}
SOURCE_ID=${2:-}
PROJECT_ROOT="$(resolve_project_root)"
VAULT="$(cd "$PROJECT_ROOT/../.." && pwd)"
ROOT_SHARE="$PROJECT_ROOT/share"
WORKSPACES_FILE="$ROOT_SHARE/workspaces.json"
PROJECT_STATUS_FILE="$ROOT_SHARE/project-status.json"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"

if [[ -z "$CHAIN_CHINESE" ]]; then
    echo "[ERROR] 用法: bash start-chain-session.sh <链中文名|ChainId> [sourceId]" >&2
    exit 1
fi

CANONICAL_SOURCE_ID="${SOURCE_ID:-newfee}"
SHARE_ROOT="$ROOT_SHARE/sources/$CANONICAL_SOURCE_ID"
MAPS_ROOT="$PROJECT_ROOT/chain-assets/地图/$CANONICAL_SOURCE_ID"
CODELISTS_ROOT="$PROJECT_ROOT/chain-assets/代码清单/$CANONICAL_SOURCE_ID"

NAMES_FILE="$SHARE_ROOT/chinese-chain-names.json"
CHAIN_STATUS_FILE="$SHARE_ROOT/chain-status.json"
WORK_ITEMS_DIR="$SHARE_ROOT/work-items"
MANUAL_SESSION_HOLDS_PATH="$SHARE_ROOT/manual-session-holds.json"
SOURCE_DOC_PATH=$(SOURCE_ID="$CANONICAL_SOURCE_ID" WORKSPACES_FILE="$WORKSPACES_FILE" PROJECT_STATUS_FILE="$PROJECT_STATUS_FILE" python3 - <<'PY'
import json
import os
from pathlib import Path

source_id = os.environ.get("SOURCE_ID", "").strip()
workspaces_file = Path(os.environ["WORKSPACES_FILE"])
project_status_file = Path(os.environ["PROJECT_STATUS_FILE"])

if not source_id:
    print("Projects/飞枢系统/newfee.md")
elif project_status_file.exists():
    try:
        project_status = json.loads(project_status_file.read_text(encoding="utf-8"))
    except Exception:
        project_status = {}
    requirements = project_status.get("requirements") if isinstance(project_status, dict) else []
    for requirement in requirements if isinstance(requirements, list) else []:
        if isinstance(requirement, dict) and requirement.get("id") == source_id and isinstance(requirement.get("docPath"), str):
            print(requirement["docPath"])
            break
    else:
        print(f"Projects/飞枢系统/{source_id}.md")
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

# ── 中文名映射英文名 ──────────────────────────────────────
CHAIN_ENGLISH=$(CHAIN_CHINESE="$CHAIN_CHINESE" NAMES_FILE="$NAMES_FILE" PROJECT_STATUS_FILE="$PROJECT_STATUS_FILE" SOURCE_ID="$CANONICAL_SOURCE_ID" python3 - <<'PY'
import json
import os
from pathlib import Path

chain_chinese = os.environ["CHAIN_CHINESE"]
names_file = os.environ["NAMES_FILE"]
project_status_file = Path(os.environ["PROJECT_STATUS_FILE"])
source_id = os.environ["SOURCE_ID"]

try:
    with open(names_file, encoding="utf-8") as handle:
        names = json.load(handle)
    reverse_names = {value: key for key, value in names.items()}
    chain_id = reverse_names.get(chain_chinese)
    if chain_id:
        print(chain_id)
        raise SystemExit(0)
except Exception:
    pass

try:
    if project_status_file.exists():
        project_status = json.loads(project_status_file.read_text(encoding="utf-8"))
        requirements = project_status.get("requirements") if isinstance(project_status, dict) else []
        for requirement in requirements if isinstance(requirements, list) else []:
            if not isinstance(requirement, dict) or requirement.get("id") != source_id:
                continue
            chains = requirement.get("chains")
            for chain in chains if isinstance(chains, list) else []:
                if isinstance(chain, dict) and chain.get("titleZh") == chain_chinese and isinstance(chain.get("id"), str):
                    print(chain["id"])
                    raise SystemExit(0)
except Exception:
    pass

print(chain_chinese)
PY
)

SESSION_NAME="chain-${CANONICAL_SOURCE_ID}-${CHAIN_ENGLISH}"
PROMPT_TMP="/tmp/ff-worker-prompt-${CHAIN_ENGLISH}.md"
RESUME_ARGS="$CHAIN_CHINESE $CANONICAL_SOURCE_ID"
WORKTREE_PATH=$(bash "$SCRIPT_DIR/ensure-source-worktree.sh" "$CANONICAL_SOURCE_ID" "$CHAIN_ENGLISH")

if [[ -z "$CHAIN_ENGLISH" ]]; then
    echo "[ERROR] 无法解析业务链英文名: $CHAIN_CHINESE" >&2
    exit 1
fi

# ── 生成临时提示词文件（统一走 runtime_sync builder）──────
PROMPT_TMP="$PROMPT_TMP" CHAIN_CHINESE="$CHAIN_CHINESE" CHAIN_ENGLISH="$CHAIN_ENGLISH" PROJECT_ROOT="$PROJECT_ROOT" CHAIN_STATUS_FILE="$CHAIN_STATUS_FILE" WORK_ITEMS_DIR="$WORK_ITEMS_DIR" MAPS_ROOT="$MAPS_ROOT" CODELISTS_ROOT="$CODELISTS_ROOT" SOURCE_DOC_PATH="$SOURCE_DOC_PATH" python3 - <<'PY'
import os
import sys
from pathlib import Path

output_file = os.environ["PROMPT_TMP"]
chain_chinese = os.environ["CHAIN_CHINESE"]
chain_english = os.environ["CHAIN_ENGLISH"]
project_root = Path(os.environ["PROJECT_ROOT"])
chain_status_file = Path(os.environ["CHAIN_STATUS_FILE"])
work_items_dir = Path(os.environ["WORK_ITEMS_DIR"])
maps_root = Path(os.environ["MAPS_ROOT"])
code_lists_root = Path(os.environ["CODELISTS_ROOT"])
source_doc_path = os.environ["SOURCE_DOC_PATH"]

sys.path.insert(0, str(project_root / "share"))
import runtime_sync

map_path = str(maps_root / f"{chain_english}.md")
code_list_path = str(code_lists_root / f"{chain_english}.md")
work_item_path = str(work_items_dir / f"{chain_english}.json")
load_json = getattr(runtime_sync, "load_json", None)
chain_status = load_json(chain_status_file, {}) if callable(load_json) else {}

if hasattr(runtime_sync, "build_worker_start_prompt"):
    content = runtime_sync.build_worker_start_prompt(
        chain_id=chain_english,
        chain_name_zh=chain_chinese,
        chain_status=chain_status,
        work_items_dir=work_items_dir,
        map_path=map_path,
        chain_status_path=str(chain_status_file),
        work_item_path=work_item_path,
        code_list_path=code_list_path,
        source_doc_path=source_doc_path,
    )
else:
    template_path = project_root / "share" / "worker-prompt-template.md"
    content = template_path.read_text(encoding="utf-8")
    content = content.replace("{{CHAIN_CHINESE}}", chain_chinese).replace("{{CHAIN_ENGLISH}}", chain_english)

with open(output_file, "w", encoding="utf-8") as handle:
    handle.write(content)

print(f"[OK] 提示词文件已生成: {output_file}")
PY

# ── 检查生成是否成功 ─────────────────────────────────────
if [[ ! -f "$PROMPT_TMP" ]]; then
    echo "[ERROR] 提示词文件生成失败，启动终止: $PROMPT_TMP"
    exit 1
fi

# ── 启动 tmux session ────────────────────────────────────
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[WARN] session '$SESSION_NAME' 已存在，未重新启动"
    echo "[INFO] 如需恢复上下文，请运行: bash $PROJECT_ROOT/Playbooks/resume-chain-session.sh $RESUME_ARGS"
    exit 0
fi

CHAIN_ENGLISH="$CHAIN_ENGLISH" PROJECT_ROOT="$PROJECT_ROOT" MANUAL_SESSION_HOLDS_PATH="$MANUAL_SESSION_HOLDS_PATH" python3 - <<'PY'
import os
import sys
from pathlib import Path

project_root = Path(os.environ["PROJECT_ROOT"])
sys.path.insert(0, str(project_root / "share"))
import runtime_sync

runtime_sync.write_manual_session_hold(os.environ["CHAIN_ENGLISH"], path=Path(os.environ["MANUAL_SESSION_HOLDS_PATH"]))
PY

tmux new-session -d -s "$SESSION_NAME" -c "$WORKTREE_PATH"
tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter

# 等待 opencode 启动就绪
sleep 5
tmux send-keys -t "$SESSION_NAME" \
    "请读取并严格按照以下文件中的指引开始工作：$PROMPT_TMP" \
    Enter

echo "[OK] 已启动 session: $SESSION_NAME"
echo "[OK] opencode 工作目录: $WORKTREE_PATH"
echo "[OK] 提示词文件: $PROMPT_TMP"
