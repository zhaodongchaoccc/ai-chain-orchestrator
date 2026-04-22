# AI Chain Orchestrator

> AI-driven business chain orchestration platform with multi-session parallel development, Obsidian integration, and cross-platform support (macOS / WSL2).

## Overview

This is a framework for managing parallel AI-assisted development workflows using:
- **Multi-session tmux orchestration** — Run multiple AI worker sessions in parallel
- **Obsidian Vault integration** — Document-driven workflow management
- **Web-based control panel** — Visual overview, chain management, and lifecycle actions
- **Cross-platform** — Native macOS support + WSL2 support for Windows

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Web UI    │────▶│  Node.js API │────▶│   tmux      │
│  (React)    │     │  (Fastify)   │     │  sessions   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Obsidian     │
                    │ Vault        │
                    └──────────────┘
```

### Components

| Component | Tech Stack | Purpose |
|-----------|-----------|---------|
| `Console/server` | Node.js + Fastify + TypeScript | Backend API, state aggregation, lifecycle management |
| `Console/web` | React + TypeScript + Vite | Web control panel, chain visualization |
| `Playbooks/` | Bash scripts | Session lifecycle (start/resume/rotate/attach) |
| `share/` | Python + JSON configs | Runtime sync, state management |

## Cross-Platform Support

| Feature | macOS | WSL2 (Windows) |
|---------|-------|----------------|
| Start backend/web | `npm run dev` | `npm run dev` |
| Enter chain session | Auto-open Terminal | Copy command, paste to Windows Terminal |
| Obsidian | Open Vault directly | Open same Vault from Windows side |
| tmux | Native | Native in WSL2 Ubuntu |
| File access | Native paths | `/mnt/c/...` forwarding |

## Quick Start

### Prerequisites

- **macOS**: Node.js v20+, tmux, Obsidian
- **WSL2**: WSL2 + Ubuntu, Node.js v20+, tmux, Obsidian (Windows side)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ai-chain-orchestrator.git
cd ai-chain-orchestrator

# Configure environment (WSL2 only)
bash share/scripts/setup-wsl2.sh
source ~/.bashrc

# Install dependencies
cd Console/server && npm install
cd Console/web && npm install
```

### First-Time Setup

Before first run, ensure the required directories exist:

```bash
# Create asset directories (used by the framework)
mkdir -p chain-assets/地图
mkdir -p chain-assets/代码清单
mkdir -p chain-assets/波次总结
mkdir -p demands
mkdir -p Sessions

# Configure environment (WSL2 only)
bash share/scripts/setup-wsl2.sh
source ~/.bashrc
```

### Start Development

```bash
# Terminal 1: Backend (port 8787)
cd Console/server
npm install
npm run dev

# Terminal 2: Frontend (port 4173)
cd Console/web
npm install
npm run dev

# Browser
http://127.0.0.1:4173
```

## Project Structure

```
ai-chain-orchestrator/
├── Console/
│   ├── server/          # Backend API
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── services/    # Business logic
│   │   │   └── types/       # TypeScript definitions
│   │   └── package.json
│   ├── web/             # Frontend UI
│   │   ├── src/
│   │   │   ├── pages/       # Page components
│   │   │   ├── components/  # Reusable components
│   │   │   └── api/         # API clients
│   │   └── package.json
│   └── shared/          # Shared type definitions
├── Playbooks/           # Lifecycle bash scripts
│   ├── start-*.sh
│   ├── resume-*.sh
│   ├── rotate-*.sh
│   └── stop-*.sh
├── share/               # Runtime configuration
│   ├── scripts/
│   │   └── setup-wsl2.sh
│   ├── runtime_sync.py
│   └── worker-prompt-template.md
└── README.md
```

## Core Concepts

### Chain Session Lifecycle

- **Start**: Create new tmux session with AI worker
- **Resume**: Inject context recovery prompt into running session
- **Rotate**: Switch to new AI context within same tmux pane
- **Attach**: Connect to existing tmux session

### Workspace Model

- **Global Main Control**: Cross-source overview, no chain details
- **Source Main Control**: Single source chain details
- **Worker**: Single chain, scoped work
- **System Iteration**: Framework maintenance only

### State Management

- `share/project-status.json` — Project overview
- `share/workspaces.json` — Workspace registry
- `share/scheduler-state.json` — Scheduler status
- `share/memory-distilled.md` — Long-term distilled memory

## WSL2 Setup Guide

For WSL2 users, see [WSL2-快速启动.md](./WSL2-快速启动.md) (Chinese) for detailed setup instructions.

### Key Differences from macOS

1. **"Enter" button becomes "Copy Command"** — Click to copy `tmux attach -t <session>` to clipboard
2. **Paste into Windows Terminal** — Execute the copied command in Windows Terminal
3. **Obsidian from Windows side** — Open the same Vault from Windows, not WSL2
4. **File paths** — Use `/mnt/c/...` for Windows file access

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PROJECT_ROOT` | Project root path | Auto-detected |
| `VAULT` | Obsidian Vault path | Auto-detected |
| `FF_REPO_PATH` | Backend repo path | `~/ff` |
| `FRONTEND_REPO_PATH` | Frontend repo path | `~/frontend/your-frontend-repo` |
| `FF_WORKTREES_ROOT` | Backend worktrees root | `~/ff-worktrees` |
| `FRONTEND_WORKTREES_ROOT` | Frontend worktrees root | `~/frontend-worktrees` |
| `LINGGEN_DIR` | linggen binary directory | `~/linggen/target/release` |

## Development

### Running Tests

```bash
cd Console/server
npm test
```

### Project Conventions

- All core paths computed via `_get_*()` functions, no hardcoded paths
- Worktree paths stored as relative paths (compatible with absolute path reads)
- Platform detection via `/proc/version` for WSL2

## License

MIT

## Acknowledgments

Built with:
- [Fastify](https://www.fastify.io/) — Web framework
- [React](https://react.dev/) — UI library
- [tmux](https://github.com/tmux/tmux) — Terminal multiplexer
- [Obsidian](https://obsidian.md/) — Knowledge base
