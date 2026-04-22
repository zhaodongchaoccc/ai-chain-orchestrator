import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const RECONCILE_SOURCE_MAIN_CONTROLS_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "reconcile-source-main-controls.sh");

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

test("reconcile source main-controls sleeps idle unpinned source sessions", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-reconcile-source-main-controls-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const binRoot = path.join(homeRoot, "bin");
  const sleepStatePath = path.join(homeRoot, "sleep-state.txt");

  await Promise.all([
    mkdir(path.join(shareRoot, "global"), { recursive: true }),
    mkdir(path.join(shareRoot, "sources", "testall"), { recursive: true }),
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
          worktreePath: path.join(homeRoot, "ff-worktrees", "testall"),
          legacyRoot: false,
          draftIncomplete: true
        }
      ], null, 2)
    ),
    writeFile(
      path.join(shareRoot, "global", "orchestration-state.json"),
      JSON.stringify({
        maxRunningSources: 5,
        runningSources: ["testall"],
        sourceStates: {
          testall: {
            sourceId: "testall",
            runtimeState: "running",
            lastActiveAt: "2026-04-03T09:00:00Z",
            pinned: false
          }
        },
        updatedAt: "2026-04-03 09:00:00"
      }, null, 2)
    ),
    writeFile(path.join(shareRoot, "sources", "testall", "policy.json"), JSON.stringify({ autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "testall", "dispatch-queue.json"), JSON.stringify({ maxConcurrent: 3, pendingStart: [], nextCandidate: null, updatedAt: null }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "testall", "control-inbox.jsonl"), ""),
    writeExecutable(
      path.join(binRoot, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "ls" ]]; then
  printf 'main-control-testall: 1 windows (created Fri Apr 03 10:00:00 2026)\n'
  exit 0
fi
printf 'unexpected tmux args: %s\n' "$*" >&2
exit 1
`
    ),
    writeExecutable(
      path.join(binRoot, "fake-sleep-source-main-control.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "${sleepStatePath}"
`
    )
  ]);

  await execFile("bash", [RECONCILE_SOURCE_MAIN_CONTROLS_PATH], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      VAULT: vaultRoot,
      RECONCILE_NOW_ISO: "2026-04-03T10:00:00Z",
      FF_SLEEP_SOURCE_MAIN_CONTROL_SCRIPT: path.join(binRoot, "fake-sleep-source-main-control.sh")
    }
  });

  const sleepState = await readFile(sleepStatePath, "utf-8");
  assert.match(sleepState, /testall/);
});

test("reconcile source main-controls does not sleep source with active chain session", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-reconcile-source-main-controls-active-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const binRoot = path.join(homeRoot, "bin");
  const sleepStatePath = path.join(homeRoot, "sleep-state.txt");

  await Promise.all([
    mkdir(path.join(shareRoot, "global"), { recursive: true }),
    mkdir(path.join(shareRoot, "sources", "testall"), { recursive: true }),
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
          worktreePath: path.join(homeRoot, "ff-worktrees", "testall"),
          legacyRoot: false,
          draftIncomplete: true
        }
      ], null, 2)
    ),
    writeFile(
      path.join(shareRoot, "global", "orchestration-state.json"),
      JSON.stringify({
        maxRunningSources: 5,
        runningSources: ["testall"],
        sourceStates: {
          testall: {
            sourceId: "testall",
            runtimeState: "running",
            lastActiveAt: "2026-04-03T09:00:00Z",
            pinned: false
          }
        },
        updatedAt: "2026-04-03 09:00:00"
      }, null, 2)
    ),
    writeFile(path.join(shareRoot, "sources", "testall", "policy.json"), JSON.stringify({ autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "testall", "dispatch-queue.json"), JSON.stringify({ maxConcurrent: 3, pendingStart: [], nextCandidate: null, updatedAt: null }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "testall", "control-inbox.jsonl"), ""),
    writeExecutable(
      path.join(binRoot, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "ls" ]]; then
  printf 'main-control-testall: 1 windows (created Fri Apr 03 10:00:00 2026)\n'
  printf 'chain-testall-OperationLogTracking: 1 windows (created Fri Apr 03 10:00:00 2026)\n'
  exit 0
fi
printf 'unexpected tmux args: %s\n' "$*" >&2
exit 1
`
    ),
    writeExecutable(
      path.join(binRoot, "fake-sleep-source-main-control.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "${sleepStatePath}"
`
    )
  ]);

  await execFile("bash", [RECONCILE_SOURCE_MAIN_CONTROLS_PATH], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      VAULT: vaultRoot,
      RECONCILE_NOW_ISO: "2026-04-03T10:00:00Z",
      FF_SLEEP_SOURCE_MAIN_CONTROL_SCRIPT: path.join(binRoot, "fake-sleep-source-main-control.sh")
    }
  });

  await assert.rejects(() => readFile(sleepStatePath, "utf-8"));
});

test("reconcile source main-controls refreshes orchestration-state snapshots for all workspaces", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-reconcile-source-main-controls-refresh-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const binRoot = path.join(homeRoot, "bin");

  await Promise.all([
    mkdir(path.join(shareRoot, "global"), { recursive: true }),
    mkdir(path.join(shareRoot, "sources", "testall"), { recursive: true }),
    mkdir(path.join(shareRoot, "sources", "req-b"), { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(
      path.join(shareRoot, "workspaces.json"),
      JSON.stringify([
        { sourceId: "testall", label: "testAll", kind: "single", enabled: true, sourceDocPath: "Projects/飞枢系统/testAll.md", worktreePath: path.join(homeRoot, "ff-worktrees", "testall"), legacyRoot: false, draftIncomplete: true },
        { sourceId: "req-b", label: "B需求", kind: "single", enabled: true, sourceDocPath: "Projects/飞枢系统/B需求.md", worktreePath: path.join(homeRoot, "ff-worktrees", "req-b"), legacyRoot: false, draftIncomplete: false }
      ], null, 2)
    ),
    writeFile(
      path.join(shareRoot, "global", "orchestration-state.json"),
      JSON.stringify({
        maxRunningSources: 5,
        runningSources: [],
        sourceStates: {},
        updatedAt: null
      }, null, 2)
    ),
    writeFile(path.join(shareRoot, "sources", "testall", "policy.json"), JSON.stringify({ autoSleep: true, idleSleepMinutes: 30, pinned: true, maxConcurrentChains: 3 }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "req-b", "policy.json"), JSON.stringify({ autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "testall", "dispatch-queue.json"), JSON.stringify({ maxConcurrent: 3, pendingStart: [], nextCandidate: null, updatedAt: null }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "req-b", "dispatch-queue.json"), JSON.stringify({ maxConcurrent: 3, pendingStart: [], nextCandidate: null, updatedAt: null }, null, 2)),
    writeFile(path.join(shareRoot, "sources", "testall", "control-inbox.jsonl"), ""),
    writeFile(path.join(shareRoot, "sources", "req-b", "control-inbox.jsonl"), ""),
    writeExecutable(
      path.join(binRoot, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "ls" ]]; then
  printf 'main-control-testall: 1 windows (created Fri Apr 03 10:00:00 2026)\n'
  exit 0
fi
printf 'unexpected tmux args: %s\n' "$*" >&2
exit 1
`
    ),
    writeExecutable(
      path.join(binRoot, "fake-sleep-source-main-control.sh"),
      "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n"
    )
  ]);

  await execFile("bash", [RECONCILE_SOURCE_MAIN_CONTROLS_PATH], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      VAULT: vaultRoot,
      RECONCILE_NOW_ISO: "2026-04-03T10:00:00Z",
      FF_SLEEP_SOURCE_MAIN_CONTROL_SCRIPT: path.join(binRoot, "fake-sleep-source-main-control.sh")
    }
  });

  const state = JSON.parse(await readFile(path.join(shareRoot, "global", "orchestration-state.json"), "utf-8"));
  assert.deepEqual(state.runningSources, ["testall"]);
  assert.equal(state.sourceStates.testall.runtimeState, "pinned");
  assert.equal(state.sourceStates["req-b"].runtimeState, "sleeping");
});
