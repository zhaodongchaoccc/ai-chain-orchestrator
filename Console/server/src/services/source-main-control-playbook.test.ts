import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const ENSURE_WORKTREE_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "ensure-source-worktree.sh");
const START_SOURCE_MAIN_CONTROL_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "start-source-main-control.sh");
const SLEEP_SOURCE_MAIN_CONTROL_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "sleep-source-main-control.sh");

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

test("ensure source worktree creates source-specific git worktree when missing", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-ensure-source-worktree-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const shareRoot = path.join(projectRoot, "share");
  const primaryRepoRoot = path.join(homeRoot, "ff");
  const worktreesRoot = path.join(homeRoot, "ff-worktrees");
  const binRoot = path.join(homeRoot, "bin");
  const gitStatePath = path.join(homeRoot, "git-state.txt");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(primaryRepoRoot, { recursive: true }),
    mkdir(worktreesRoot, { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(
      path.join(shareRoot, "workspaces.json"),
      JSON.stringify([
        {
          sourceId: "testall",
          label: "testAll",
          kind: "single",
          enabled: true,
          sourceDocPath: "Projects/飞枢系统/testAll.md",
          worktreePath: path.join(worktreesRoot, "testall"),
          legacyRoot: false,
          draftIncomplete: true
        }
      ], null, 2)
    ),
    writeExecutable(
      path.join(binRoot, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
state_file="${gitStatePath}"

if [[ "$1" == "-C" ]]; then
  repo_root="$2"
  shift 2
else
  repo_root="$PWD"
fi

command="$1"
shift

case "$command" in
  rev-parse)
    printf '%s\n' "$repo_root"
    ;;
  show-ref)
    exit 1
    ;;
  worktree)
    if [[ "$1" == "add" ]]; then
      shift
      worktree_path="$1"
      mkdir -p "$worktree_path"
      printf 'worktree add %s\n' "$*" >> "$state_file"
      exit 0
    fi
    ;;
esac

printf 'unexpected git args: %s %s\n' "$command" "$*" >&2
exit 1
`
    )
  ]);

  const { stdout } = await execFile("bash", [ENSURE_WORKTREE_PATH, "testall"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      FF_PRIMARY_REPO: primaryRepoRoot,
      FF_WORKTREES_ROOT: worktreesRoot,
      VAULT: vaultRoot
    }
  });

  const gitState = await readFile(gitStatePath, "utf-8");
  assert.equal(stdout.trim(), path.join(worktreesRoot, "testall"));
  assert.match(gitState, /worktree add .*ff-worktrees\/testall -b source\/testall/);
});

test("start source main-control playbook starts source session in source worktree", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-start-source-main-control-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const shareRoot = path.join(projectRoot, "share");
  const sourceShareRoot = path.join(shareRoot, "sources", "testall");
  const primaryRepoRoot = path.join(homeRoot, "ff");
  const worktreesRoot = path.join(homeRoot, "ff-worktrees");
  const sourceWorktree = path.join(worktreesRoot, "testall");
  const sessionsRoot = path.join(projectRoot, "Sessions", "sources", "testall");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");

  await Promise.all([
    mkdir(sourceShareRoot, { recursive: true }),
    mkdir(primaryRepoRoot, { recursive: true }),
    mkdir(worktreesRoot, { recursive: true }),
    mkdir(sessionsRoot, { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(
      path.join(shareRoot, "workspaces.json"),
      JSON.stringify([
        {
          sourceId: "testall",
          label: "testAll",
          kind: "single",
          enabled: true,
          sourceDocPath: "Projects/飞枢系统/testAll.md",
          worktreePath: sourceWorktree,
          legacyRoot: false,
          draftIncomplete: true
        }
      ], null, 2)
    ),
    writeFile(path.join(sourceShareRoot, "chain-status.json"), JSON.stringify({}, null, 2)),
    writeFile(path.join(sourceShareRoot, "dispatch-queue.json"), JSON.stringify({ maxConcurrent: 1, pendingStart: [], nextCandidate: null, updatedAt: null }, null, 2)),
    writeFile(path.join(sessionsRoot, "main-control-resume.json"), JSON.stringify({ generatedAt: "2026-04-03-1000" }, null, 2)),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "def build_source_main_control_resume_prompt(source_id, **kwargs):",
        "    return f'stub prompt for {source_id}'",
        ""
      ].join("\n")
    ),
    writeExecutable(path.join(binRoot, "opencode"), "#!/usr/bin/env bash\nexit 0\n"),
    writeExecutable(
      path.join(binRoot, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-C" ]]; then
  shift 2
fi
if [[ "$1" == "rev-parse" ]]; then
  printf '%s\n' "${primaryRepoRoot}"
  exit 0
fi
if [[ "$1" == "show-ref" ]]; then
  exit 1
fi
if [[ "$1" == "worktree" && "$2" == "add" ]]; then
  mkdir -p "$3"
  exit 0
fi
exit 1
`
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
    exit 1
    ;;
  new-session)
    printf 'new-session %s\n' "$*" >> "$state_file"
    ;;
  send-keys)
    printf 'send-keys %s\n' "$*" >> "$state_file"
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
    )
  ]);

  const { stdout } = await execFile("bash", [START_SOURCE_MAIN_CONTROL_PATH, "testall"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      FF_PRIMARY_REPO: primaryRepoRoot,
      FF_WORKTREES_ROOT: worktreesRoot,
      VAULT: vaultRoot
    }
  });

  const tmuxState = await readFile(tmuxStatePath, "utf-8");
  assert.match(stdout, /已启动需求子主控 session: main-control-testall/);
  assert.match(tmuxState, /new-session .*main-control-testall -c .*ff-worktrees\/testall$/m);
  assert.match(tmuxState, /send-keys -t main-control-testall opencode Enter/);
  assert.match(tmuxState, /send-keys -t main-control-testall .*ff-source-main-control-testall\.md Enter/);
});

test("sleep source main-control playbook hands off before killing source session", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-sleep-source-main-control-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");

  await Promise.all([
    mkdir(path.join(projectRoot, "share", "sources", "testall"), { recursive: true }),
    mkdir(path.join(projectRoot, "Sessions", "sources", "testall"), { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(path.join(projectRoot, "share", "runtime_sync.py"), [
      "def load_json(_path, default):",
      "    return default",
      "",
      "def get_tmux_session_names():",
      "    return ['chain-testall-OperationLogTracking']",
      "",
      "def parse_chain_session_name(session_name):",
      "    if session_name.startswith('chain-testall-'):",
      "        return ('testall', session_name.removeprefix('chain-testall-'))",
      "    return None",
      "",
      "def write_handoff_files(**_kwargs):",
      "    return ('/tmp/handoff.md', '/tmp/LATEST.md')",
      "",
    ].join("\n")),
    writeExecutable(
      path.join(binRoot, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
state_file="${tmuxStatePath}"
command="$1"
shift

case "$command" in
  kill-session)
    printf 'kill-session %s\n' "$*" >> "$state_file"
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
    )
  ]);

  const { stdout } = await execFile("bash", [SLEEP_SOURCE_MAIN_CONTROL_PATH, "testall"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      VAULT: vaultRoot
    }
  });

  const tmuxState = await readFile(tmuxStatePath, "utf-8");
  assert.match(stdout, /已休眠需求子主控 session: main-control-testall/);
  assert.match(tmuxState, /kill-session -t main-control-testall/);
});
