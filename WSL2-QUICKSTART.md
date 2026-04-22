# AI Chain Orchestrator WSL2 Quick Start

> Follow these 4 steps to start AI Chain Orchestrator on WSL2.

## Prerequisites

| Dependency | Purpose | Installation |
|------------|---------|--------------|
| WSL2 + Ubuntu | Run backend and tmux | [Microsoft Guide](https://docs.microsoft.com/en-us/windows/wsl/install) |
| Node.js v20+ | Run frontend and backend | In WSL2: `sudo apt install nodejs npm` or [NodeSource](https://github.com/nodesource/distributions) |
| tmux | Chain session management | In WSL2: `sudo apt install tmux` |
| Obsidian | View Vault documents | Windows side: [obsidian.md](https://obsidian.md/) |
| Business Repos | Backend + Frontend | Clone to WSL2 home or Windows filesystem |

> Repo paths are flexible. The setup wizard will interactively confirm them.

## 3-Step Launch

### Step 1: Configure Environment

In WSL2 Ubuntu, enter the project root:

```bash
cd ai-chain-orchestrator
bash share/scripts/setup-wsl2.sh
source ~/.bashrc
```

The wizard will:
- Detect WSL2 environment
- Derive Vault path
- Interactively confirm business repo locations
- Append 7 environment variables to `~/.bashrc`

### Step 2: Install Dependencies and Start

**Backend** (port 8787):
```bash
cd Console/server
npm install
npm run dev
```

**Frontend** (port 4173, new terminal):
```bash
cd Console/web
npm install
npm run dev
```

### Step 3: Browser Access

Open in Windows browser:
```
http://127.0.0.1:4173
```

> WSL2 localhost automatically forwards to Windows. No extra configuration needed.

## Usage Tips

- **Enter chain session**: Click "Copy Command" in console → paste into **Windows Terminal**
- **Obsidian Vault**: Must open from **Windows side** (e.g., `C:\Users\<username>\PasObsidian`), not from WSL2
- **File paths**: Access Windows files via `/mnt/c/...` in WSL2. Text operations are seamless.

## Troubleshooting

See full documentation in `README.md` → **WSL2 Setup Guide** section.

Common issues:
- `setup-wsl2.sh` says not WSL2 → confirm you're in WSL2 Ubuntu
- `tmux` not found → `sudo apt install tmux`
- `npm` not found → install Node.js first
- Environment variables not working → confirm you ran `source ~/.bashrc`

---

**Happy orchestrating!**
