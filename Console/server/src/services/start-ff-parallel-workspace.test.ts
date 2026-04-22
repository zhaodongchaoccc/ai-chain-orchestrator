import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const START_WORKSPACE_PATH = path.resolve(
  process.cwd(),
  "..",
  "..",
  "Playbooks",
  "start-ff-parallel-workspace.sh"
);

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

test("start workspace tolerates tmux ls with no chain sessions", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-start-workspace-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const playbooksDir = path.join(projectRoot, "Playbooks");
  const shareDir = path.join(projectRoot, "share");
  const scopedShareDir = path.join(shareDir, "sources", "newfee");
  const fakeBinDir = path.join(homeRoot, "bin");
  const linggenBinDir = path.join(homeRoot, "linggen", "target", "debug");
  const ffWorkdir = path.join(homeRoot, "ff");
  const sandboxStartPath = path.join(playbooksDir, "start-ff-parallel-workspace.sh");

  await Promise.all([
    mkdir(playbooksDir, { recursive: true }),
    mkdir(shareDir, { recursive: true }),
    mkdir(scopedShareDir, { recursive: true }),
    mkdir(fakeBinDir, { recursive: true }),
    mkdir(linggenBinDir, { recursive: true }),
    mkdir(ffWorkdir, { recursive: true })
  ]);

  await writeExecutable(sandboxStartPath, await readFile(START_WORKSPACE_PATH, "utf8"));

  await Promise.all([
    writeExecutable(
      path.join(fakeBinDir, "tmux"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-V" ]]; then
  printf 'tmux 3.6a\n'
  exit 0
fi
if [[ "\${1:-}" == "ls" ]]; then
  exit 1
fi
if [[ "\${1:-}" == "has-session" ]]; then
  exit 1
fi
exit 0
`
    ),
    writeExecutable(
      path.join(fakeBinDir, "pgrep"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 1
`
    ),
    writeExecutable(
      path.join(fakeBinDir, "open"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(fakeBinDir, "opencode"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(fakeBinDir, "sleep"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(linggenBinDir, "ling"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(playbooksDir, "dispatch-watcher.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(playbooksDir, "main-control-sync.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(playbooksDir, "start-chain-session.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeExecutable(
      path.join(playbooksDir, "resume-chain-session.sh"),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`
    ),
    writeFile(path.join(scopedShareDir, "dispatch-queue.json"), JSON.stringify({ maxConcurrent: 2, pendingStart: [], updatedAt: "" })),
    writeFile(path.join(scopedShareDir, "chain-status.json"), JSON.stringify({})),
    writeFile(path.join(scopedShareDir, "chinese-chain-names.json"), JSON.stringify({})),
    writeFile(
      path.join(shareDir, "runtime_sync.py"),
      [
        "import json",
        "from pathlib import Path",
        "",
        "def load_json(path, default):",
        "    path = Path(path)",
        "    if not path.exists():",
        "        return default",
        "    try:",
        "        return json.loads(path.read_text(encoding='utf-8'))",
        "    except Exception:",
        "        return default",
        "",
        "def resolve_scheduler_policy(*_args, **_kwargs):",
        "    return {'maxConcurrent': 2, 'temporaryPinnedChains': [], 'pinnedChainsConsumeSlots': False}",
        "",
        "def rebuild_pending_start_queue(chain_status, running_chain_ids=None):",
        "    return []",
        "",
        "def is_chain_blocked(chain_id, status):",
        "    return False",
        "",
        "def is_chain_rollback(chain_id, status):",
        "    return False",
        "",
        "def is_chain_pending(chain_id, status):",
        "    return False",
        ""
      ].join("\n")
    )
  ]);

  const env = {
    ...process.env,
    HOME: homeRoot,
    FF_WORKDIR: ffWorkdir,
    PATH: `${fakeBinDir}:${process.env.PATH ?? ""}`
  };

  try {
    const result = await execFile("bash", [sandboxStartPath], {
      cwd: projectRoot,
      env,
      timeout: 20000
    });

    assert.match(result.stdout, /全部就绪/);
    assert.match(result.stdout, /当前无需补启临时 pinned 业务链/);
  } finally {
    await rm(homeRoot, { recursive: true, force: true });
  }
});
