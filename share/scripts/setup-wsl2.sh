#!/usr/bin/env bash
# setup-wsl2.sh — 一键检测 WSL2 环境并生成 ~/.bashrc 配置
set -euo pipefail

echo "=== AI Chain Orchestrator WSL2 Setup Wizard ==="
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
  echo "✓ Default Vault path exists: $DEFAULT_VAULT"
  VAULT="$DEFAULT_VAULT"
else
  echo "⚠ Default Vault path not found: $DEFAULT_VAULT"
  read -rp "Please enter Vault absolute path in WSL2 (e.g. /mnt/d/PasObsidian): " VAULT
  if [ ! -d "$VAULT" ]; then
  echo "Error: Vault path $VAULT does not exist. Please create Obsidian Vault first."
  exit 1
fi

echo "✓ Project root: $PROJECT_ROOT"
echo ""

# 4. Business repo paths (customizable)
echo "--- Business Repo Configuration ---"
echo "Tips: The following are default paths. Modify as needed."
echo ""

read -rp "Backend repo path [${HOME}/ff]: " FF_REPO_PATH
FF_REPO_PATH=${FF_REPO_PATH:-${HOME}/ff}

read -rp "Frontend repo path [${HOME}/frontend/your-frontend-repo]: " FRONTEND_REPO_PATH
FRONTEND_REPO_PATH=${FRONTEND_REPO_PATH:-${HOME}/frontend/your-frontend-repo}

read -rp "Backend worktrees root [${HOME}/ff-worktrees]: " FF_WORKTREES_ROOT
FF_WORKTREES_ROOT=${FF_WORKTREES_ROOT:-${HOME}/ff-worktrees}

read -rp "Frontend worktrees root [${HOME}/frontend-worktrees]: " FRONTEND_WORKTREES_ROOT
FRONTEND_WORKTREES_ROOT=${FRONTEND_WORKTREES_ROOT:-${HOME}/frontend-worktrees}

read -rp "linggen build directory [${HOME}/linggen/target/release]: " LINGGEN_DIR
LINGGEN_DIR=${LINGGEN_DIR:-${HOME}/linggen/target/release}

echo ""

# 5. 写入 ~/.bashrc
BASHRC="${HOME}/.bashrc"
BACKUP="${BASHRC}.backup.$(date +%Y%m%d%H%M%S)"
cp "$BASHRC" "$BACKUP" 2>/dev/null || true

cat >> "$BASHRC" <<EOF

# ===== AI Chain Orchestrator WSL2 Environment Variables (Configured at $(date -Iseconds)) =====
export VAULT="${VAULT}"
export PROJECT_ROOT="${PROJECT_ROOT}"
export FF_REPO_PATH="${FF_REPO_PATH}"
export FRONTEND_REPO_PATH="${FRONTEND_REPO_PATH}"
export FF_WORKTREES_ROOT="${FF_WORKTREES_ROOT}"
export FRONTEND_WORKTREES_ROOT="${FRONTEND_WORKTREES_ROOT}"
export LINGGEN_DIR="${LINGGEN_DIR}"
# ================================================================
EOF

echo "✓ Configuration appended to ${BASHRC}"
echo "  Backup file: ${BACKUP}"
echo ""
echo "=== Configuration Summary ==="
echo "VAULT                  = ${VAULT}"
echo "PROJECT_ROOT           = ${PROJECT_ROOT}"
echo "FF_REPO_PATH           = ${FF_REPO_PATH}"
echo "FRONTEND_REPO_PATH     = ${FRONTEND_REPO_PATH}"
echo "FF_WORKTREES_ROOT      = ${FF_WORKTREES_ROOT}"
echo "FRONTEND_WORKTREES_ROOT = ${FRONTEND_WORKTREES_ROOT}"
echo "LINGGEN_DIR            = ${LINGGEN_DIR}"
echo ""
echo "Run the following command to apply configuration:"
echo "  source ~/.bashrc"
echo ""
echo "Then start the backend (node server/src/index.ts)."
