#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$HOME/PasObsidian/Projects/飞枢系统}"
API_BASE="${API_BASE:-http://127.0.0.1:8787}"
PROJECT_STATUS_PATH="$PROJECT_ROOT/share/project-status.json"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

require_file() {
  [[ -f "$1" ]] || err "缺少文件: $1"
}

http_get() {
  local path="$1"
  curl -sS -f "$API_BASE$path"
}

http_post() {
  local path="$1"
  curl -sS -f -X POST "$API_BASE$path"
}

require_file "$PROJECT_STATUS_PATH"

read -r SOURCE_ID CHAIN_ID <<EOF
$(PROJECT_STATUS_PATH="$PROJECT_STATUS_PATH" python3 - <<'PY'
import json, os
from pathlib import Path

project_status = json.loads(Path(os.environ["PROJECT_STATUS_PATH"]).read_text(encoding="utf-8"))
requirements = project_status.get("requirements", []) if isinstance(project_status, dict) else []
for requirement in requirements:
    if not isinstance(requirement, dict):
        continue
    source_id = requirement.get("id")
    chains = requirement.get("chains") or []
    chain = next((item for item in chains if isinstance(item, dict) and item.get("id") not in {None, "Defect"}), None)
    if source_id and chain and chain.get("id"):
        print(source_id, chain["id"])
        raise SystemExit(0)
if requirements and isinstance(requirements[0], dict) and requirements[0].get("id"):
    print(requirements[0]["id"], "")
    raise SystemExit(0)
print("", "")
PY)
EOF

[[ -n "$SOURCE_ID" ]] || err "无法从 project-status.json 解析需求"

info "检查基础接口..."
http_get "/api/health" >/dev/null
http_get "/api/requirements" >/dev/null
http_get "/api/requirements/$SOURCE_ID" >/dev/null
ok "基础接口正常"

info "检查 lifecycle 接口..."
http_post "/api/lifecycle/main-control/resume" >/dev/null
http_post "/api/lifecycle/system-iteration/resume" >/dev/null
http_post "/api/requirements/$SOURCE_ID/main-control/resume" >/dev/null
if [[ -n "$CHAIN_ID" ]]; then
  http_post "/api/requirements/$SOURCE_ID/chains/$CHAIN_ID/resume" >/dev/null
fi
ok "lifecycle 接口正常"

info "smoke 完成"
printf '  - source: %s\n' "$SOURCE_ID"
printf '  - chain:  %s\n' "${CHAIN_ID:-(none)}"
