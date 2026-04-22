# 飞枢系统 WSL2 快速启动

> 拿到这个压缩包后，按下面 4 步走，即可启动飞枢系统。

## 前置条件（请先装好）

| 依赖 | 用途 | 安装方式 |
|------|------|---------|
| WSL2 + Ubuntu | 运行后端和 tmux | [微软官方指南](https://docs.microsoft.com/zh-cn/windows/wsl/install) |
| Node.js v20+ | 运行前端和后端 | WSL2 内：`sudo apt install nodejs npm` 或 [NodeSource](https://github.com/nodesource/distributions) |
| tmux | 业务链会话管理 | WSL2 内：`sudo apt install tmux` |
| Obsidian | 查看 Vault 文档 | Windows 侧：[obsidian.md](https://obsidian.md/) 下载安装 |
| 业务仓库 | ff 后端 + ccweb 前端 | 自行克隆到 WSL2 home 或 Windows 文件系统 |

> 业务仓库路径不限，启动向导会交互式确认。

## 3 步启动

### 第 1 步：配置环境

在 WSL2 Ubuntu 内进入项目根目录：

```bash
cd 飞枢系统
bash share/scripts/setup-wsl2.sh
source ~/.bashrc
```

向导会自动：
- 检测 WSL2 环境
- 推导 Vault 路径
- 交互式确认业务仓库位置
- 追加 7 个环境变量到 `~/.bashrc`

### 第 2 步：安装依赖并启动

**后端**（端口 8787）：
```bash
cd Console/server
npm install
npm run dev
```

**前端**（端口 4173，另开终端）：
```bash
cd Console/web
npm install
npm run dev
```

### 第 3 步：浏览器访问

Windows 侧浏览器打开：
```
http://127.0.0.1:4173
```

> WSL2 的 localhost 会自动转发到 Windows，无需额外配置。

## 使用提示

- **进入业务链**：控制台点击"复制命令" → 粘贴到 **Windows Terminal** 执行
- **Obsidian 打开 Vault**：必须从 **Windows 侧**打开（如 `C:\Users\<用户名>\PasObsidian`），不要用 WSL2 内的 Obsidian
- **文件路径**：WSL2 内访问 Windows 文件用 `/mnt/c/...`，文本操作无感知

## 遇到问题？

查看完整文档：`README.md` → **WSL2 接入指南** 章节

常见问题：
- `setup-wsl2.sh` 提示不是 WSL2 → 确认在 WSL2 Ubuntu 内运行
- `tmux` 不存在 → `sudo apt install tmux`
- `npm` 不存在 → 先安装 Node.js
- 环境变量未生效 → 确认执行了 `source ~/.bashrc`

---

**祝使用愉快！**
