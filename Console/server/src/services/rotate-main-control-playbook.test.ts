import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const ROTATE_PLAYBOOK_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "rotate-main-control-session.sh");

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

test("rotate main-control playbook succeeds even when the session id is outside the last 20 pane lines", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-rotate-main-control-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const shareRoot = path.join(projectRoot, "share");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const sessionsRoot = path.join(projectRoot, "Sessions");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");
  const latestPath = path.join(sessionsRoot, "LATEST.md");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(sessionsRoot, { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await writeExecutable(
    path.join(playbooksRoot, "handoff-main-control.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$(dirname \"${latestPath}\")"
printf '# latest\n' > "${latestPath}"
printf '{"handoff":"%s","latest":"%s"}\n' "${path.join(sessionsRoot, "2026-03-29-main-control-handoff.md")}" "${latestPath}"
`
  );

  await writeFile(
    path.join(shareRoot, "runtime_sync.py"),
    [
      "def build_main_control_resume_prompt(*, latest_path: str) -> str:",
      "    return f'Read {latest_path}'",
      ""
    ].join("\n")
  );

  await writeExecutable(
    path.join(binRoot, "opencode"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "run" ]]; then
  printf '{"type":"step_start","sessionID":"ses_test_rotate"}\n'
  printf '{"type":"step_finish","sessionID":"ses_test_rotate"}\n'
  exit 0
fi
printf 'unexpected opencode args: %s\n' "$*" >&2
exit 1
`
  );

  await writeExecutable(
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
  list-panes)
    printf '%%1\n'
    ;;
  display-message)
    format="\${@: -1}"
    case "$format" in
      "#{session_path}")
        printf '%s\n' "${vaultRoot}"
        ;;
      "#{pane_dead}")
        printf '0\n'
        ;;
      "#{pane_current_command}")
        printf 'node\n'
        ;;
      *)
        printf '\n'
        ;;
    esac
    ;;
  respawn-pane)
    printf '%s\n' "\${@: -1}" > "$state_file"
    ;;
  clear-history|send-keys)
    exit 0
    ;;
  capture-pane)
    cat <<'EOF'
Build  gpt-5.4
Context
Todo
EOF
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
  );

  const { stdout } = await execFile("bash", [ROTATE_PLAYBOOK_PATH], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`
    }
  });

  const respawnCommand = await readFile(tmuxStatePath, "utf-8");

  assert.match(stdout, /已在 tmux session 'main-control' 内轮换新的主控上下文。/);
  assert.match(stdout, /新 opencode session: ses_test_rotate/);
  assert.match(respawnCommand, /--session ses_test_rotate/);
});

test("rotate main-control playbook proceeds once session id appears even if opencode run does not exit promptly", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-rotate-main-control-hanging-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "ff");
  const shareRoot = path.join(projectRoot, "share");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const sessionsRoot = path.join(projectRoot, "Sessions");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state-hanging.txt");
  const latestPath = path.join(sessionsRoot, "LATEST.md");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(sessionsRoot, { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await writeExecutable(
    path.join(playbooksRoot, "handoff-main-control.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$(dirname \"${latestPath}\")"
printf '# latest\n' > "${latestPath}"
printf '{"handoff":"%s","latest":"%s"}\n' "${path.join(sessionsRoot, "2026-03-29-main-control-handoff.md")}" "${latestPath}"
`
  );

  await writeFile(
    path.join(shareRoot, "runtime_sync.py"),
    [
      "def build_main_control_resume_prompt(*, latest_path: str) -> str:",
      "    return f'Read {latest_path}'",
      ""
    ].join("\n")
  );

  await writeExecutable(
    path.join(binRoot, "opencode"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "run" ]]; then
  printf '{"type":"step_start","sessionID":"ses_test_hanging"}\n'
  sleep 30
  exit 0
fi
printf 'unexpected opencode args: %s\n' "$*" >&2
exit 1
`
  );

  await writeExecutable(
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
  list-panes)
    printf '%%1\n'
    ;;
  display-message)
    format="\${@: -1}"
    case "$format" in
      "#{session_path}")
        printf '%s\n' "${vaultRoot}"
        ;;
      "#{pane_dead}")
        printf '0\n'
        ;;
      "#{pane_current_command}")
        printf 'node\n'
        ;;
      *)
        printf '\n'
        ;;
    esac
    ;;
  respawn-pane)
    printf '%s\n' "\${@: -1}" > "$state_file"
    ;;
  clear-history|send-keys)
    exit 0
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
  );

  const started = Date.now();
  const { stdout } = await execFile("bash", [ROTATE_PLAYBOOK_PATH], {
    cwd: projectRoot,
    timeout: 10000,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`
    }
  });
  const elapsedMs = Date.now() - started;

  const respawnCommand = await readFile(tmuxStatePath, "utf-8");

  assert.match(stdout, /新 opencode session: ses_test_hanging/);
  assert.match(respawnCommand, /--session ses_test_hanging/);
  assert.ok(elapsedMs < 10000, `expected script to finish before opencode run natural exit, got ${elapsedMs}ms`);
});
