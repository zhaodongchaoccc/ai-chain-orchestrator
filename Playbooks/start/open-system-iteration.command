#!/usr/bin/env bash

set -euo pipefail

VAULT="${VAULT:-$HOME/PasObsidian}"
PROJECT_ROOT="$VAULT/Projects/飞枢系统"
SESSION_NAME="system-iteration"

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux 未安装，无法进入 $SESSION_NAME"
  read -r -p "按回车退出..." _
  exit 1
fi

if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "未发现 $SESSION_NAME，正在启动..."
  bash "$PROJECT_ROOT/Playbooks/start/start-system-iteration-session.sh" "待命维护模式"
fi

exec tmux attach -t "$SESSION_NAME"
