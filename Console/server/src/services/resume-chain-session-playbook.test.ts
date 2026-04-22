import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const RESUME_PLAYBOOK_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "resume-chain-session.sh");

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

test("resume chain playbook sends prompt path instruction instead of pasting prompt body", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-resume-chain-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const shareRoot = path.join(projectRoot, "share");
  const newfeeShareRoot = path.join(shareRoot, "sources", "newfee");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");

  await Promise.all([
    mkdir(path.join(newfeeShareRoot, "work-items"), { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(
      path.join(shareRoot, "workspaces.json"),
      JSON.stringify([
        {
          sourceId: "newfee",
          label: "newfee",
          kind: "combined",
          enabled: true,
          sourceDocPath: "Projects/飞枢系统/newfee.md",
          worktreePath: path.join(homeRoot, "ff-worktrees", "newfee"),
          legacyRoot: false,
          draftIncomplete: false
        }
      ], null, 2)
    ),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "CHAIN_ZH = {'ContractAutoNumbering': '合同自动编号'}",
        "",
        "def build_worker_resume_prompt(**kwargs):",
        "    return 'line1\\nline2'",
        ""
      ].join("\n")
    ),
    writeExecutable(
      path.join(binRoot, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
state_file="${tmuxStatePath}"
command="$1"
shift

case "$command" in
  has-session)
    exit 0
    ;;
  display-message)
    format="\${@: -1}"
    case "$format" in
      "#{pane_current_command}")
        printf 'node\n'
        ;;
      *)
        printf '\n'
        ;;
    esac
    ;;
  send-keys)
    printf 'send-keys %s\n' "$*" >> "$state_file"
    ;;
  load-buffer|paste-buffer|delete-buffer)
    printf '%s %s\n' "$command" "$*" >> "$state_file"
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
    )
  ]);

  const { stdout } = await execFile("bash", [RESUME_PLAYBOOK_PATH, "ContractAutoNumbering"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`
    }
  });

  const tmuxState = await readFile(tmuxStatePath, "utf-8");
  assert.match(stdout, /已向 session 'chain-newfee-ContractAutoNumbering' 发送 LIGHT resume 提示/);
  assert.match(tmuxState, /send-keys -t chain-newfee-ContractAutoNumbering .*ff-worker-resume-ContractAutoNumbering\..* Enter/);
  assert.doesNotMatch(tmuxState, /paste-buffer/);
  assert.doesNotMatch(tmuxState, /load-buffer/);
});

test("resume chain playbook relaunches opencode when pane is not running node", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-resume-chain-relaunch-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const shareRoot = path.join(projectRoot, "share");
  const newfeeShareRoot = path.join(shareRoot, "sources", "newfee");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");

  await Promise.all([
    mkdir(path.join(newfeeShareRoot, "work-items"), { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(
      path.join(shareRoot, "workspaces.json"),
      JSON.stringify([
        {
          sourceId: "newfee",
          label: "newfee",
          kind: "combined",
          enabled: true,
          sourceDocPath: "Projects/飞枢系统/newfee.md",
          worktreePath: path.join(homeRoot, "ff-worktrees", "newfee"),
          legacyRoot: false,
          draftIncomplete: false
        }
      ], null, 2)
    ),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "CHAIN_ZH = {'ContractAutoNumbering': '合同自动编号'}",
        "",
        "def build_worker_resume_prompt(**kwargs):",
        "    return 'resume'",
        ""
      ].join("\n")
    ),
    writeExecutable(
      path.join(binRoot, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
state_file="${tmuxStatePath}"
command="$1"
shift

case "$command" in
  has-session)
    exit 0
    ;;
  display-message)
    format="\${@: -1}"
    case "$format" in
      "#{pane_current_command}")
        printf 'zsh\n'
        ;;
      *)
        printf '\n'
        ;;
    esac
    ;;
  send-keys)
    printf 'send-keys %s\n' "$*" >> "$state_file"
    ;;
  load-buffer|paste-buffer|delete-buffer)
    printf '%s %s\n' "$command" "$*" >> "$state_file"
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
    )
  ]);

  await execFile("bash", [RESUME_PLAYBOOK_PATH, "ContractAutoNumbering"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`
    }
  });

  const tmuxState = await readFile(tmuxStatePath, "utf-8");
  assert.match(tmuxState, /send-keys -t chain-newfee-ContractAutoNumbering opencode Enter/);
});
