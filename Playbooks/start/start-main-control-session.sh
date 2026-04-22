#!/usr/bin/env bash
# 单独启动飞枢系统全局主控 session（main-control）
# 适用场景：全局主控被意外关闭，需要重建，不影响调度器和其他 session
#
# 用法:
#   bash start-main-control-session.sh          # 直接启动，进入 opencode 等待输入
#   bash start-main-control-session.sh --resume # 启动并自动注入恢复提示词

set -euo pipefail

RESUME_MODE=0
while [[ $# -gt 0 ]]; do
    case "$1" in
        --resume) RESUME_MODE=1 ;;
        *) echo "[ERROR] 未知参数: $1" >&2; exit 1 ;;
    esac
    shift
done

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
OPENCODE_BIN="${OPENCODE_BIN:-opencode}"
MAIN_CONTROL_SESSION="main-control"
LATEST_FILE="$PROJECT_ROOT/Sessions/LATEST.md"
PROMPT_TMP="/tmp/ff-main-control-start.md"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── 检查是否已存在 ──────────────────────────────────────────
if tmux has-session -t "$MAIN_CONTROL_SESSION" 2>/dev/null; then
    echo ""
    echo -e "${CYAN}[INFO]${NC}  session '$MAIN_CONTROL_SESSION' 已存在"
    echo ""
    echo "  可用操作："
    echo "    进入现有 session:   tmux attach -t $MAIN_CONTROL_SESSION"
    echo "    轮换新的上下文:     bash $PROJECT_ROOT/Playbooks/rotate-main-control-session.sh"
    echo ""
    exit 0
fi

# ── 检查必要条件 ────────────────────────────────────────────
command -v tmux >/dev/null 2>&1 || err "tmux 未安装"
command -v "$OPENCODE_BIN" >/dev/null 2>&1 || err "opencode 未安装"

# ── 生成全局恢复包（确保是最新的）──────────────────────────
info "刷新全局恢复包..."
python3 - <<PY
import json, sys
from pathlib import Path
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync

packet = runtime_sync.build_global_resume_packet(
    workspaces_path='$PROJECT_ROOT/share/workspaces.json',
    sessions_dir='$PROJECT_ROOT/Sessions',
    share_dir='$PROJECT_ROOT/share',
)
out = Path('$PROJECT_ROOT/Sessions/global-main-control-resume.json')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY

# ── 创建 session ─────────────────────────────────────────────
info "创建 session: $MAIN_CONTROL_SESSION"
tmux new-session -d -s "$MAIN_CONTROL_SESSION" -c "$VAULT"
tmux setw -t "$MAIN_CONTROL_SESSION" pane-base-index 0 2>/dev/null || true
tmux send-keys -t "$MAIN_CONTROL_SESSION" \
    "echo '── main-control（全局主控）──' && echo 'Workspace: $VAULT' && echo '' && $OPENCODE_BIN" \
    Enter

ok "已创建: $MAIN_CONTROL_SESSION"

# ── 如果指定 --resume，等待 opencode 就绪后注入恢复提示词 ──
if [[ "$RESUME_MODE" -eq 1 ]]; then
    info "准备恢复提示词..."

    python3 - <<PY
import sys
from pathlib import Path
sys.path.insert(0, '$PROJECT_ROOT/share')
import runtime_sync

content = runtime_sync.build_main_control_resume_prompt(
    latest_path='$LATEST_FILE',
)
Path('$PROMPT_TMP').write_text(content, encoding='utf-8')
PY

    info "等待 opencode 启动（5s）..."
    sleep 5
    tmux send-keys -t "$MAIN_CONTROL_SESSION" \
        "请读取并严格按照以下文件中的指引恢复上下文：$PROMPT_TMP" Enter
    ok "已注入恢复提示词: $PROMPT_TMP"
fi

echo ""
echo -e "${GREEN}全局主控 session 已就绪${NC}"
echo ""
echo "  进入 session:  tmux attach -t $MAIN_CONTROL_SESSION"
if [[ "$RESUME_MODE" -eq 0 ]]; then
    echo ""
    echo "  提示：若需要自动注入恢复提示词，下次加 --resume 参数："
    echo "    bash $PROJECT_ROOT/Playbooks/start/start-main-control-session.sh --resume"
fi
