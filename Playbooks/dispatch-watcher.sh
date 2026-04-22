#!/usr/bin/env bash
# 后台常驻，每10秒检查一次 dispatch-queue.json
# 负责：
# 1. 只按未完成链计算有效并发
# 2. 自动跳过/移除队列中的已完成链与挂起链
# 3. 软回收已完成且无人 attach 的 chain session

set -euo pipefail

VAULT="$HOME/PasObsidian"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
DEFAULT_SOURCE_ID="newfee"
QUEUE_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/dispatch-queue.json"
STATUS_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/chain-status.json"
NAMES_FILE="$PROJECT_ROOT/share/sources/$DEFAULT_SOURCE_ID/chinese-chain-names.json"
PID_FILE="$PROJECT_ROOT/Playbooks/dispatch-watcher.pid"
START_CHAIN="$PROJECT_ROOT/Playbooks/start-chain-session.sh"
RECONCILE_SOURCES_SCRIPT="$PROJECT_ROOT/Playbooks/reconcile-source-main-controls.sh"
SYNC_MODULE_DIR="$PROJECT_ROOT/share"

echo $$ > "$PID_FILE"

get_chain_stage() {
  local chain_id="$1"
  python3 - <<PY
import json
from pathlib import Path

path = Path("$STATUS_FILE")
chain_id = "$chain_id"
if not path.exists():
    print("S1")
else:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    print(data.get(chain_id, {}).get("stage", "S1"))
PY
}

sanitize_queue() {
  python3 - <<PY
import json
import sys
from pathlib import Path
sys.path.insert(0, "$SYNC_MODULE_DIR")
import runtime_sync

queue_path = Path("$QUEUE_FILE")
status_path = Path("$STATUS_FILE")

queue = runtime_sync.load_json(queue_path, {"maxConcurrent": 2, "pendingStart": [], "updatedAt": ""})
status = runtime_sync.load_json(status_path, {})
policy = runtime_sync.resolve_scheduler_policy()
sessions = """$(list_chain_sessions)""".splitlines()
running_chain_ids = runtime_sync.iter_chain_ids_from_sessions([s for s in sessions if s], source_id="newfee")
pending, skipped = runtime_sync.sanitize_pending_queue(queue.get("pendingStart", []), status, running_chain_ids=running_chain_ids)
target_max = policy.get("maxConcurrent", queue.get("maxConcurrent", 2))
queue_changed = False
if queue.get("maxConcurrent") != target_max:
    queue["maxConcurrent"] = target_max
    queue_changed = True
if skipped:
    queue["pendingStart"] = pending
    queue_changed = True
if queue_changed:
    from datetime import datetime
    queue["updatedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")
    runtime_sync.write_json(queue_path, queue)
print(json.dumps({"pending": pending, "skipped": skipped, "max": queue.get("maxConcurrent", 2)}, ensure_ascii=False))
PY
}

get_chinese_name() {
  local english_name="$1"
  python3 - <<PY
import json
from pathlib import Path

path = Path("$NAMES_FILE")
english_name = "$english_name"
if not path.exists():
    print(english_name)
else:
    try:
        names = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        names = {}
    print(names.get(english_name, english_name))
PY
}

list_chain_sessions() {
  if command -v tmux >/dev/null 2>&1; then
    tmux ls 2>/dev/null | awk -F ':' '$1 ~ /^chain-./ {print $1}' | sort || true
  fi
}

extract_newfee_chain_id() {
  local session_name="$1"
  local remainder="${session_name#chain-}"
  if [[ "$session_name" != chain-* ]]; then
    return 1
  fi
  if [[ "$remainder" == newfee-* ]]; then
    printf '%s\n' "${remainder#newfee-}"
    return 0
  fi
  if [[ "$remainder" == *-* ]]; then
    return 1
  fi
  printf '%s\n' "$remainder"
}

is_temporarily_pinned_chain() {
  local chain_id="$1"
  python3 - <<PY
import sys
sys.path.insert(0, "$SYNC_MODULE_DIR")
import runtime_sync

print('1' if runtime_sync.is_temporarily_pinned_chain("$chain_id") else '0')
PY
}

has_manual_session_hold() {
  local chain_id="$1"
  python3 - <<PY
import sys
sys.path.insert(0, "$SYNC_MODULE_DIR")
import runtime_sync

print('1' if runtime_sync.has_manual_session_hold("$chain_id") else '0')
PY
}

reconcile_completed_sessions() {
  local session chain_id stage attached_count pinned manual_hold
  while IFS= read -r session; do
    [[ -z "$session" ]] && continue
    chain_id=$(extract_newfee_chain_id "$session" || true)
    [[ -z "$chain_id" ]] && continue
    stage="$(get_chain_stage "$chain_id")"
    if [[ "$stage" == "S5" || "$stage" == "ROLLBACK" ]]; then
      pinned="$(is_temporarily_pinned_chain "$chain_id")"
      manual_hold="$(has_manual_session_hold "$chain_id")"
      if [[ "$stage" == "S5" && "$pinned" == "1" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M')] 保留临时 pinned 链 session: $chain_id"
        continue
      fi
      if [[ "$manual_hold" == "1" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M')] 保留人工接管中的已完成链 session: $chain_id"
        continue
      fi
      attached_count=$(tmux list-clients -t "$session" 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$attached_count" -gt 0 ]]; then
        if [[ "$stage" == "ROLLBACK" ]]; then
          echo "[$(date '+%Y-%m-%d %H:%M')] 保留已撤回链 session: $chain_id (attached=$attached_count)"
        else
          echo "[$(date '+%Y-%m-%d %H:%M')] 保留已完成链 session: $chain_id (attached=$attached_count)"
        fi
      else
        tmux kill-session -t "$session" 2>/dev/null || true
        if [[ "$stage" == "ROLLBACK" ]]; then
          echo "[$(date '+%Y-%m-%d %H:%M')] 清理已撤回空闲 session: $chain_id"
        else
          echo "[$(date '+%Y-%m-%d %H:%M')] 清理已完成空闲 session: $chain_id"
        fi
      fi
    fi
  done <<< "$(list_chain_sessions)"
}

get_scheduler_snapshot() {
  python3 - <<PY
import json
import sys
sys.path.insert(0, "$SYNC_MODULE_DIR")
import runtime_sync
from pathlib import Path

status = runtime_sync.load_json(Path("$STATUS_FILE"), {})
sessions = """$(list_chain_sessions)""".splitlines()
policy = runtime_sync.resolve_scheduler_policy()
effective_sessions = runtime_sync.get_effective_active_sessions([s for s in sessions if s], status, policy, source_id="newfee")
pinned_running = runtime_sync.get_running_pinned_chain_ids([s for s in sessions if s], status, policy, source_id="newfee")
print(json.dumps({
    "activeCount": len(effective_sessions),
    "availableSlots": runtime_sync.get_available_start_slots([s for s in sessions if s], status, policy, source_id="newfee"),
    "pinnedRunning": pinned_running,
    "maxConcurrent": policy.get("maxConcurrent", 2),
}, ensure_ascii=False))
PY
}

while true; do
  sleep 10

  SANITIZED=$(sanitize_queue)
  PENDING_LIST=$(python3 - <<PY
import json
payload = json.loads('''$SANITIZED''')
print("\n".join(payload.get("pending", [])))
PY
)
  SKIPPED_LIST=$(python3 - <<PY
import json
payload = json.loads('''$SANITIZED''')
print("\n".join(payload.get("skipped", [])))
PY
)
  MAX=$(python3 - <<PY
import json
payload = json.loads('''$SANITIZED''')
print(payload.get("max", 2))
PY
)

  if [[ -n "$SKIPPED_LIST" ]]; then
    while IFS= read -r skipped; do
      [[ -z "$skipped" ]] && continue
        echo "[$(date '+%Y-%m-%d %H:%M')] 跳过当前不可启动链（含 PENDING）: $skipped"
    done <<< "$SKIPPED_LIST"
  fi

  reconcile_completed_sessions
  if [[ -x "$RECONCILE_SOURCES_SCRIPT" ]]; then
    bash "$RECONCILE_SOURCES_SCRIPT" || true
  fi

  SNAPSHOT=$(get_scheduler_snapshot)
  ACTIVE=$(python3 - <<PY
import json
print(json.loads('''$SNAPSHOT''').get('activeCount', 0))
PY
)
  SLOTS=$(python3 - <<PY
import json
print(json.loads('''$SNAPSHOT''').get('availableSlots', 0))
PY
)
  PINNED_RUNNING=$(python3 - <<PY
import json
payload = json.loads('''$SNAPSHOT''')
print('、'.join(payload.get('pinnedRunning', [])))
PY
)
  if [[ -n "$PINNED_RUNNING" ]]; then
    echo "[$(date '+%Y-%m-%d %H:%M')] 当前有效并发: $ACTIVE/$MAX (含 pinned: $PINNED_RUNNING)"
  else
    echo "[$(date '+%Y-%m-%d %H:%M')] 当前有效并发: $ACTIVE/$MAX"
  fi

  if [[ "$SLOTS" -le 0 ]]; then
    continue
  fi

  TO_START=$(python3 - <<PY
import json
import sys
sys.path.insert(0, "$SYNC_MODULE_DIR")
import runtime_sync

payload = json.loads('''$SANITIZED''')
slots = int('''$SLOTS''')
for chain_id in runtime_sync.select_chains_to_start(payload.get('pending', []), slots):
    print(chain_id)
PY
)
  if [[ -z "$TO_START" ]]; then
    continue
  fi

  while IFS= read -r next_chain; do
    [[ -z "$next_chain" ]] && continue
    CHINESE_NAME=$(get_chinese_name "$next_chain")
    echo "[$(date '+%Y-%m-%d %H:%M')] 启动链: $next_chain ($CHINESE_NAME)"
    bash "$START_CHAIN" "$CHINESE_NAME"
  done <<< "$TO_START"
done
