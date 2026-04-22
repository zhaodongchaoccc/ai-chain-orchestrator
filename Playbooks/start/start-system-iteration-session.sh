#!/usr/bin/env bash
# 启动飞枢系统迭代 session
# 用法: bash start-system-iteration-session.sh ["当前迭代任务描述"]
# 例如: bash start-system-iteration-session.sh "优化全局主控提示词分层"

set -euo pipefail

# 解析参数
TODO_ID=""
while [[ "${1:-}" == --* ]]; do
    case "$1" in
        --todo-id) TODO_ID="$2"; shift 2 ;;
        *) break ;;
    esac
done

CURRENT_TASK="${1:-}"
VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SESSION_NAME="system-iteration"
PROMPT_TMP="/tmp/ff-system-iteration.md"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
STATE_FILE="$PROJECT_ROOT/share/global/system-iteration-state.json"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "[WARN] session '$SESSION_NAME' 已存在"
    echo "[INFO] 如需注入新迭代任务，请先 attach 进入该 session 后手动注入"
    echo "[INFO] tmux attach -t $SESSION_NAME"
    if [[ -n "$CURRENT_TASK" ]]; then
        python3 - <<PY
import json
from pathlib import Path
from datetime import datetime

path = Path('$STATE_FILE')
path.parent.mkdir(parents=True, exist_ok=True)
data = {}
if path.exists():
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        data = {}
data.update({
    'running': True,
    'session': '$SESSION_NAME',
    'currentTask': '$CURRENT_TASK',
    'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'updatedBy': 'start-system-iteration-session.sh',
})
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
        echo "[INFO] 已更新当前迭代任务到状态文件"
    fi
    exit 0
fi

# 生成提示词
CURRENT_TASK="$CURRENT_TASK" PROJECT_ROOT="$PROJECT_ROOT" PROMPT_TMP="$PROMPT_TMP" python3 - <<'PY'
import os, sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ["PROJECT_ROOT"]) / "share"))
import runtime_sync

content = runtime_sync.build_system_iteration_prompt(
    current_task=os.environ.get("CURRENT_TASK", "")
)
Path(os.environ["PROMPT_TMP"]).write_text(content, encoding="utf-8")
PY

# 如果传入了 todo-id，在提示词末尾追加任务完成协议
if [[ -n "$TODO_ID" ]]; then
    cat >> "$PROMPT_TMP" <<EOF

## 任务完成协议（自动执行）

当你确认本任务已完成时，必须执行以下操作（按顺序）：

1. 标记代办完成：
   \`\`\`bash
   curl -sS -X POST http://127.0.0.1:8787/api/system/todos/${TODO_ID}/complete
   \`\`\`

2. 立即校验代办状态：
   \`\`\`bash
   curl -sS http://127.0.0.1:8787/api/system/todos
   \`\`\`

   你必须确认返回结果中该 todo 已从 \`pending\` 变为 \`done\`。

3. 触发记忆蒸馏：
   \`\`\`bash
   curl -sS -X POST http://127.0.0.1:8787/api/memory/distill
   \`\`\`

4. 在你的回复中明确说明："任务已完成，已自动标记、校验完成状态并触发蒸馏"

如果任务未能完成或遇到阻塞，不要调用上述 API，请在回复中说明原因并请求人工介入。
EOF
    echo "[INFO] 已注入任务完成协议（todo-id: $TODO_ID）"
fi

# 工作目录固定为 Vault（飞枢系统文件根目录）
tmux new-session -d -s "$SESSION_NAME" -c "$VAULT"
tmux send-keys -t "$SESSION_NAME" "$OPENCODE_BIN" Enter
sleep 5
tmux send-keys -t "$SESSION_NAME" "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter

# 写入状态文件
python3 - <<PY
import json
from pathlib import Path
from datetime import datetime

path = Path('$STATE_FILE')
path.parent.mkdir(parents=True, exist_ok=True)
data = {
    'running': True,
    'session': '$SESSION_NAME',
    'currentTask': '$CURRENT_TASK',
    'updatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'updatedBy': 'start-system-iteration-session.sh',
}
path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

echo "[OK] 已启动系统迭代 session: $SESSION_NAME"
echo "[OK] 工作目录: $VAULT"
echo "[OK] 提示词文件: $PROMPT_TMP"
if [[ -n "$CURRENT_TASK" ]]; then
    echo "[OK] 当前迭代任务: $CURRENT_TASK"
fi
echo ""
echo "[INFO] 退出后恢复迭代 session："
echo "  tmux attach -t $SESSION_NAME"
