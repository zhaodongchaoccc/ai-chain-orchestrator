#!/usr/bin/env bash
# setup-wsl2.sh — 一键检测 WSL2 环境并生成 ~/.bashrc 配置
set -euo pipefail

echo "=== 飞枢系统 WSL2 环境配置向导 ==="
echo ""

# 1. 检测是否在 WSL2
if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "错误：当前环境不是 WSL2（/proc/version 未包含 'microsoft'）。"
  echo "本脚本仅适用于 WSL2 Ubuntu。"
  exit 1
fi

echo "✓ WSL2 环境已确认"
echo ""

# 2. 检测 Windows 用户名
WIN_USER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r' || true)
if [ -z "$WIN_USER" ]; then
  read -rp "请输入 Windows 侧用户名: " WIN_USER
fi

echo "Windows 用户名: $WIN_USER"
echo ""

# 3. 推导并验证 Vault 路径
DEFAULT_VAULT="/mnt/c/Users/${WIN_USER}/PasObsidian"
if [ -d "$DEFAULT_VAULT" ]; then
  echo "✓ 默认 Vault 路径存在: $DEFAULT_VAULT"
  VAULT="$DEFAULT_VAULT"
else
  echo "⚠ 默认 Vault 路径不存在: $DEFAULT_VAULT"
  read -rp "请手动输入 Vault 在 WSL2 中的绝对路径 (例如 /mnt/d/PasObsidian): " VAULT
  if [ ! -d "$VAULT" ]; then
    echo "错误：路径 $VAULT 不存在。请确认 Obsidian Vault 已创建。"
    exit 1
  fi
fi

PROJECT_ROOT="${VAULT}/Projects/飞枢系统"
if [ ! -d "$PROJECT_ROOT" ]; then
  echo "错误：项目根目录不存在: $PROJECT_ROOT"
  echo "请确保飞枢系统项目已克隆或解压到 Vault/Projects/飞枢系统/"
  exit 1
fi

echo "✓ 项目根目录: $PROJECT_ROOT"
echo ""

# 4. 业务仓库路径（用户自定义）
echo "--- 业务仓库路径配置 ---"
echo "提示：以下路径为默认值，请按实际位置修改。"
echo ""

read -rp "ff 后端仓库路径 [${HOME}/ff]: " FF_REPO_PATH
FF_REPO_PATH=${FF_REPO_PATH:-${HOME}/ff}

read -rp "前端仓库路径 [${HOME}/ccweb/saas-cc-web-ydzee]: " FRONTEND_REPO_PATH
FRONTEND_REPO_PATH=${FRONTEND_REPO_PATH:-${HOME}/ccweb/saas-cc-web-ydzee}

read -rp "ff worktrees 根目录 [${HOME}/ff-worktrees]: " FF_WORKTREES_ROOT
FF_WORKTREES_ROOT=${FF_WORKTREES_ROOT:-${HOME}/ff-worktrees}

read -rp "前端 worktrees 根目录 [${HOME}/ccweb-worktrees]: " FRONTEND_WORKTREES_ROOT
FRONTEND_WORKTREES_ROOT=${FRONTEND_WORKTREES_ROOT:-${HOME}/ccweb-worktrees}

read -rp "linggen 构建目录 [${HOME}/linggen/target/release]: " LINGGEN_DIR
LINGGEN_DIR=${LINGGEN_DIR:-${HOME}/linggen/target/release}

echo ""

# 5. 写入 ~/.bashrc
BASHRC="${HOME}/.bashrc"
BACKUP="${BASHRC}.backup.$(date +%Y%m%d%H%M%S)"
cp "$BASHRC" "$BACKUP" 2>/dev/null || true

cat >> "$BASHRC" <<EOF

# ===== 飞枢系统 WSL2 环境变量（自动配置于 $(date -Iseconds)） =====
export VAULT="${VAULT}"
export PROJECT_ROOT="${PROJECT_ROOT}"
export FF_REPO_PATH="${FF_REPO_PATH}"
export FRONTEND_REPO_PATH="${FRONTEND_REPO_PATH}"
export FF_WORKTREES_ROOT="${FF_WORKTREES_ROOT}"
export FRONTEND_WORKTREES_ROOT="${FRONTEND_WORKTREES_ROOT}"
export LINGGEN_DIR="${LINGGEN_DIR}"
# ================================================================
EOF

echo "✓ 配置已追加到 ${BASHRC}"
echo "  备份文件: ${BACKUP}"
echo ""
echo "=== 配置摘要 ==="
echo "VAULT                  = ${VAULT}"
echo "PROJECT_ROOT           = ${PROJECT_ROOT}"
echo "FF_REPO_PATH           = ${FF_REPO_PATH}"
echo "FRONTEND_REPO_PATH     = ${FRONTEND_REPO_PATH}"
echo "FF_WORKTREES_ROOT      = ${FF_WORKTREES_ROOT}"
echo "FRONTEND_WORKTREES_ROOT = ${FRONTEND_WORKTREES_ROOT}"
echo "LINGGEN_DIR            = ${LINGGEN_DIR}"
echo ""
echo "请运行以下命令使配置生效："
echo "  source ~/.bashrc"
echo ""
echo "然后即可正常启动飞枢系统后端（node server/src/index.ts）。"
