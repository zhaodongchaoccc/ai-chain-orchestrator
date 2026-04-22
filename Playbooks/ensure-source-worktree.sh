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

SOURCE_ID=${1:-}
CHAIN_ID=${2:-}
if [[ -z "$SOURCE_ID" ]]; then
    echo "[ERROR] 用法: bash ensure-source-worktree.sh <sourceId> [chainId]" >&2
    exit 1
fi

PROJECT_ROOT="$(resolve_project_root)"
VAULT="$(cd "$PROJECT_ROOT/../.." && pwd)"
ROOT_SHARE="$PROJECT_ROOT/share"
WORKSPACES_FILE="$ROOT_SHARE/workspaces.json"
PROJECT_STATUS_FILE="$ROOT_SHARE/project-status.json"
FF_PRIMARY_REPO="${FF_PRIMARY_REPO:-$HOME/ff}"
FRONTEND_PRIMARY_REPO="${FRONTEND_PRIMARY_REPO:-$HOME/frontend/your-frontend-repo}"
FF_WORKTREES_ROOT="${FF_WORKTREES_ROOT:-$HOME/ff-worktrees}"
FRONTEND_WORKTREES_ROOT="${FRONTEND_WORKTREES_ROOT:-$HOME/frontend-worktrees}"

WORKTREE_CONFIG=$(SOURCE_ID="$SOURCE_ID" CHAIN_ID="$CHAIN_ID" WORKSPACES_FILE="$WORKSPACES_FILE" PROJECT_STATUS_FILE="$PROJECT_STATUS_FILE" FF_PRIMARY_REPO="$FF_PRIMARY_REPO" FRONTEND_PRIMARY_REPO="$FRONTEND_PRIMARY_REPO" FF_WORKTREES_ROOT="$FF_WORKTREES_ROOT" FRONTEND_WORKTREES_ROOT="$FRONTEND_WORKTREES_ROOT" python3 - <<'PY'
import json
import os
from pathlib import Path

source_id = os.environ["SOURCE_ID"]
chain_id = os.environ.get("CHAIN_ID", "").strip()
workspaces_file = Path(os.environ["WORKSPACES_FILE"])
project_status_file = Path(os.environ["PROJECT_STATUS_FILE"])

repo_path = os.environ["FF_PRIMARY_REPO"]
worktrees_base = os.environ["FF_WORKTREES_ROOT"]
worktree_path = str(Path(worktrees_base) / source_id)

if project_status_file.exists():
    try:
        project_status = json.loads(project_status_file.read_text(encoding="utf-8"))
    except Exception:
        project_status = {}
    repos = project_status.get("repos") if isinstance(project_status, dict) else {}
    requirements = project_status.get("requirements") if isinstance(project_status, dict) else []
    if isinstance(requirements, list):
        requirement = next((item for item in requirements if isinstance(item, dict) and item.get("id") == source_id), None)
        if isinstance(requirement, dict):
            configured_worktree = requirement.get("worktreePath")
            if isinstance(configured_worktree, str) and configured_worktree.strip():
                worktree_path = configured_worktree.strip()
            chains = requirement.get("chains")
            if chain_id and isinstance(chains, list):
                chain = next((item for item in chains if isinstance(item, dict) and item.get("id") == chain_id), None)
                if isinstance(chain, dict):
                    repo_key = chain.get("repoKey")
                    repo = repos.get(repo_key) if isinstance(repos, dict) and isinstance(repo_key, str) else None
                    if isinstance(repo, dict):
                        if isinstance(repo.get("path"), str) and repo["path"].strip():
                            repo_path = repo["path"].strip().replace("~", str(Path.home()), 1)
                        if isinstance(repo.get("worktreesBase"), str) and repo["worktreesBase"].strip():
                            worktrees_base = repo["worktreesBase"].strip().replace("~", str(Path.home()), 1)
                        worktree_path = str(Path(worktrees_base) / source_id)

if workspaces_file.exists():
    try:
        entries = json.loads(workspaces_file.read_text(encoding="utf-8"))
    except Exception:
        entries = []
    for entry in entries if isinstance(entries, list) else []:
        if isinstance(entry, dict) and entry.get("sourceId") == source_id:
            workspace_path = entry.get("worktreePath")
            if isinstance(workspace_path, str) and workspace_path.strip() and not chain_id:
                worktree_path = workspace_path.strip()
            break

print(json.dumps({"repoPath": repo_path, "worktreePath": worktree_path}))
PY
)

REPO_PATH=$(WORKTREE_CONFIG="$WORKTREE_CONFIG" python3 - <<'PY'
import json
import os

config = json.loads(os.environ["WORKTREE_CONFIG"])
print(config["repoPath"])
PY
)

WORKTREE_PATH=$(WORKTREE_CONFIG="$WORKTREE_CONFIG" python3 - <<'PY'
import json
import os

config = json.loads(os.environ["WORKTREE_CONFIG"])
print(config["worktreePath"])
PY
)

if git -C "$WORKTREE_PATH" rev-parse --show-toplevel >/dev/null 2>&1; then
    printf '%s\n' "$WORKTREE_PATH"
    exit 0
fi

mkdir -p "$(dirname "$WORKTREE_PATH")"
BRANCH_NAME="source/$SOURCE_ID"
if git -C "$REPO_PATH" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
    git -C "$REPO_PATH" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"
fi

printf '%s\n' "$WORKTREE_PATH"
