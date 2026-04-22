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
WORKSPACES_FILE="$PROJECT_ROOT/share/workspaces.json"
ORCHESTRATION_STATE_FILE="$PROJECT_ROOT/share/global/orchestration-state.json"
SLEEP_SOURCE_SCRIPT="${FF_SLEEP_SOURCE_MAIN_CONTROL_SCRIPT:-$PROJECT_ROOT/Playbooks/sleep-source-main-control.sh}"

command -v tmux >/dev/null 2>&1 || exit 0

tmux_sessions=$(tmux ls 2>/dev/null | awk -F ':' '$1 ~ /^main-control-./ {print $1}' || true)
tmux_sessions_all=$(tmux ls 2>/dev/null | awk -F ':' '{print $1}' || true)

RECONCILE_OUTPUT=$(PROJECT_ROOT="$PROJECT_ROOT" WORKSPACES_FILE="$WORKSPACES_FILE" ORCHESTRATION_STATE_FILE="$ORCHESTRATION_STATE_FILE" TMUX_SESSIONS="$tmux_sessions" TMUX_SESSIONS_ALL="$tmux_sessions_all" RECONCILE_NOW_ISO="${RECONCILE_NOW_ISO:-}" python3 - <<'PY'
import json
import os
from pathlib import Path
from datetime import datetime

project_root = Path(os.environ["PROJECT_ROOT"])
workspaces_file = Path(os.environ["WORKSPACES_FILE"])
orchestration_state_file = Path(os.environ["ORCHESTRATION_STATE_FILE"])
tmux_sessions = [line.strip() for line in os.environ.get("TMUX_SESSIONS", "").splitlines() if line.strip()]
tmux_sessions_all = [line.strip() for line in os.environ.get("TMUX_SESSIONS_ALL", "").splitlines() if line.strip()]

workspaces = []
if workspaces_file.exists():
    try:
        workspaces = json.loads(workspaces_file.read_text(encoding="utf-8"))
    except Exception:
        workspaces = []

state = {
    "maxRunningSources": 5,
    "runningSources": [],
    "sourceStates": {},
    "updatedAt": None,
}
if orchestration_state_file.exists():
    try:
        state = json.loads(orchestration_state_file.read_text(encoding="utf-8"))
    except Exception:
        pass

source_states = state.get("sourceStates", {}) if isinstance(state.get("sourceStates", {}), dict) else {}
sleep_candidates = []
running_sources = []
now_iso = os.environ.get("RECONCILE_NOW_ISO", "").strip()
if now_iso:
    now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
else:
    now = datetime.now()

def iso_now() -> str:
    return now.isoformat().replace("+00:00", "Z")

for entry in workspaces if isinstance(workspaces, list) else []:
    if not isinstance(entry, dict):
        continue
    source_id = entry.get("sourceId")
    if not isinstance(source_id, str) or not source_id:
        continue
    if entry.get("enabled") is False:
        continue
    session_name = f"main-control-{source_id}"
    session_running = session_name in tmux_sessions

    policy_path = project_root / "share" / "sources" / source_id / "policy.json"
    queue_path = project_root / "share" / "sources" / source_id / "dispatch-queue.json"
    inbox_path = project_root / "share" / "sources" / source_id / "control-inbox.jsonl"

    policy = {"autoSleep": True, "idleSleepMinutes": 30, "pinned": False, "maxConcurrentChains": 3}
    if policy_path.exists():
        try:
            loaded = json.loads(policy_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                policy.update(loaded)
        except Exception:
            pass

    source_state = source_states.get(source_id, {}) if isinstance(source_states.get(source_id, {}), dict) else {}
    last_active_at = source_state.get("lastActiveAt")
    pinned = bool(policy.get("pinned")) or bool(source_state.get("pinned"))
    runtime_state = "pinned" if session_running and pinned else "running" if session_running else "sleeping"
    if session_running:
        running_sources.append(source_id)
        if not isinstance(last_active_at, str) or not last_active_at:
            last_active_at = iso_now()

    source_states[source_id] = {
        "sourceId": source_id,
        "runtimeState": runtime_state,
        "lastActiveAt": last_active_at if isinstance(last_active_at, str) and last_active_at else None,
        "pinned": pinned,
    }

    if not session_running or not policy.get("autoSleep", True) or pinned or not isinstance(last_active_at, str) or not last_active_at:
        continue

    try:
        last_active = datetime.fromisoformat(last_active_at.replace(" ", "T").replace("Z", "+00:00"))
    except Exception:
        continue

    effective_now = now if last_active.tzinfo is None else now.astimezone(last_active.tzinfo)
    idle_minutes = max(1, int(policy.get("idleSleepMinutes", 30)))
    idle_minutes_elapsed = (effective_now - last_active).total_seconds() / 60
    if idle_minutes_elapsed < idle_minutes:
        continue

    running_chain = False
    for chain_session in tmux_sessions_all:
        if chain_session.startswith(f"chain-{source_id}-"):
            running_chain = True
            break

    if running_chain:
        continue

    queue_pending = []
    if queue_path.exists():
        try:
            queue = json.loads(queue_path.read_text(encoding="utf-8"))
            if isinstance(queue, dict) and isinstance(queue.get("pendingStart"), list):
                queue_pending = queue.get("pendingStart")
        except Exception:
            queue_pending = []
    if queue_pending:
        continue

    has_critical_open = False
    if inbox_path.exists():
        try:
            for raw_line in inbox_path.read_text(encoding="utf-8").splitlines():
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                item = json.loads(raw_line)
                if not isinstance(item, dict):
                    continue
                if item.get("severity") == "critical" and item.get("status") in {"open", "claimed", "escalated"}:
                    has_critical_open = True
                    break
        except Exception:
            has_critical_open = False
    if has_critical_open:
        continue

    sleep_candidates.append(source_id)
    running_sources = [item for item in running_sources if item != source_id]
    source_states[source_id] = {
        "sourceId": source_id,
        "runtimeState": "sleeping",
        "lastActiveAt": last_active_at,
        "pinned": pinned,
    }

state["runningSources"] = running_sources
state["sourceStates"] = source_states
state["updatedAt"] = iso_now()
orchestration_state_file.parent.mkdir(parents=True, exist_ok=True)
orchestration_state_file.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(json.dumps(sleep_candidates, ensure_ascii=False))
PY
)

while IFS= read -r source_id; do
  [[ -z "$source_id" ]] && continue
  bash "$SLEEP_SOURCE_SCRIPT" "$source_id" >/dev/null
done < <(RECONCILE_OUTPUT="$RECONCILE_OUTPUT" python3 - <<'PY'
import json
import os

items = json.loads(os.environ.get("RECONCILE_OUTPUT", "[]") or "[]")
for item in items if isinstance(items, list) else []:
    if isinstance(item, str) and item:
        print(item)
PY
)
