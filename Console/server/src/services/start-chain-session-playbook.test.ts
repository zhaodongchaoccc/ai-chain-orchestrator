import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const START_PLAYBOOK_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "start-chain-session.sh");

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

test("start chain playbook opens opencode from shared parent dir and feeds prompt path", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-start-chain-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const ffWorkdir = path.join(homeRoot, "ff");
  const worktreesRoot = path.join(homeRoot, "ff-worktrees");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const newfeeShareRoot = path.join(shareRoot, "sources", "newfee");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");

  await Promise.all([
    mkdir(newfeeShareRoot, { recursive: true }),
    mkdir(ffWorkdir, { recursive: true }),
    mkdir(worktreesRoot, { recursive: true }),
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
          worktreePath: path.join(worktreesRoot, "newfee"),
          legacyRoot: false,
          draftIncomplete: false
        }
      ], null, 2)
    ),
    writeFile(
      path.join(newfeeShareRoot, "chinese-chain-names.json"),
      JSON.stringify({ ContractAutoNumbering: "合同自动编号" }, null, 2)
    ),
    writeFile(path.join(shareRoot, "worker-prompt-template.md"), "恢复 {{CHAIN_CHINESE}} / {{CHAIN_ENGLISH }}\n".replace("{{CHAIN_ENGLISH }}", "{{CHAIN_ENGLISH}}")),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "def write_manual_session_hold(chain_id: str, **_kwargs):",
        "    return {chain_id: '2026-03-30 12:00:00'}",
        "",
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
  printf '%s\n' "${ffWorkdir}"
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

  const { stdout } = await execFile("bash", [START_PLAYBOOK_PATH, "ContractAutoNumbering"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      FF_PRIMARY_REPO: ffWorkdir,
      FF_WORKTREES_ROOT: worktreesRoot,
      VAULT: vaultRoot
    }
  });

  const tmuxState = await readFile(tmuxStatePath, "utf-8");
  assert.match(stdout, /已启动 session: chain-newfee-ContractAutoNumbering/);
  assert.match(tmuxState, /new-session .*chain-newfee-ContractAutoNumbering -c .*ff-worktrees\/newfee$/m);
  assert.match(tmuxState, /send-keys -t chain-newfee-ContractAutoNumbering opencode Enter/);
  assert.match(tmuxState, /send-keys -t chain-newfee-ContractAutoNumbering .*ff-worker-prompt-ContractAutoNumbering\.md Enter/);
});

test("start chain playbook builds scoped prompt paths for source workspaces", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-start-chain-scoped-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const ffWorkdir = path.join(homeRoot, "ff");
  const worktreesRoot = path.join(homeRoot, "ff-worktrees");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const scopedShareRoot = path.join(shareRoot, "sources", "testall");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(path.join(scopedShareRoot, "work-items"), { recursive: true }),
    mkdir(path.join(projectRoot, "Maps", "testall"), { recursive: true }),
    mkdir(path.join(projectRoot, "CodeLists", "testall"), { recursive: true }),
    mkdir(ffWorkdir, { recursive: true }),
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
          sourceDocPath: "Projects/飞枢系统/05-需求/templates/testAll.md",
          worktreePath: path.join(worktreesRoot, "testall"),
          legacyRoot: false,
          draftIncomplete: true
        }
      ], null, 2)
    ),
    writeFile(
      path.join(scopedShareRoot, "chinese-chain-names.json"),
      JSON.stringify({ ContractAddAndFeeLogEnhancement: "合同创建并收费日志补强" }, null, 2)
    ),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "def write_manual_session_hold(chain_id: str, **_kwargs):",
        "    return {chain_id: '2026-03-30 12:00:00'}",
        "",
        "def build_worker_start_prompt(**kwargs):",
        "    return '\\n'.join([",
        "        kwargs.get('map_path', ''),",
        "        kwargs.get('code_list_path', ''),",
        "        kwargs.get('work_item_path', ''),",
        "        kwargs.get('chain_status_path', ''),",
        "        kwargs.get('source_doc_path', '')",
        "    ])",
        "",
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
  printf '%s\n' "${ffWorkdir}"
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

  const { stdout } = await execFile("bash", [START_PLAYBOOK_PATH, "ContractAddAndFeeLogEnhancement", "testall"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      FF_PRIMARY_REPO: ffWorkdir,
      FF_WORKTREES_ROOT: worktreesRoot,
      VAULT: vaultRoot
    }
  });

  const promptPath = stdout.match(/提示词文件已生成: (.+)$/m)?.[1]?.trim();
  assert.ok(promptPath);
  assert.match(stdout, /已启动 session: chain-testall-ContractAddAndFeeLogEnhancement/);

  const promptContent = await readFile(promptPath!, "utf-8");
  assert.match(promptContent, /Projects\/飞枢系统\/03-业务链资产\/地图\/testall\/ContractAddAndFeeLogEnhancement\.md/);
  assert.match(promptContent, /Projects\/飞枢系统\/03-业务链资产\/代码清单\/testall\/ContractAddAndFeeLogEnhancement\.md/);
  assert.match(promptContent, /Projects\/飞枢系统\/share\/sources\/testall\/work-items\/ContractAddAndFeeLogEnhancement\.json/);
  assert.match(promptContent, /Projects\/飞枢系统\/share\/sources\/testall\/chain-status\.json/);
  assert.match(promptContent, /Projects\/飞枢系统\/05-需求\/templates\/testAll\.md/);
});

test("start chain playbook keeps sourceId in resume hint for scoped workspaces", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-start-chain-scoped-existing-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const scopedShareRoot = path.join(shareRoot, "sources", "testall");
  const ffWorkdir = path.join(homeRoot, "ff");
  const worktreesRoot = path.join(homeRoot, "ff-worktrees");
  const binRoot = path.join(homeRoot, "bin");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(ffWorkdir, { recursive: true }),
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
    writeFile(
      path.join(scopedShareRoot, "chinese-chain-names.json"),
      JSON.stringify({ ContractAddAndFeeLogEnhancement: "合同创建并收费日志补强" }, null, 2)
    ),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "def write_manual_session_hold(*_args, **_kwargs):",
        "    return {}",
        "",
        "def build_worker_start_prompt(**_kwargs):",
        "    return 'resume hint'",
        ""
      ].join("\n")
    ),
    writeExecutable(
      path.join(binRoot, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-C" ]]; then
  shift 2
fi
if [[ "$1" == "rev-parse" ]]; then
  printf '%s\n' "${ffWorkdir}"
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
command="$1"
shift

case "$command" in
  has-session)
    exit 0
    ;;
  *)
    printf 'unexpected tmux command: %s\n' "$command" >&2
    exit 1
    ;;
esac
`
    )
  ]);

  const { stdout } = await execFile("bash", [START_PLAYBOOK_PATH, "ContractAddAndFeeLogEnhancement", "testall"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      FF_PRIMARY_REPO: ffWorkdir,
      FF_WORKTREES_ROOT: worktreesRoot,
      VAULT: vaultRoot
    }
  });

  assert.match(stdout, /resume-chain-session\.sh ContractAddAndFeeLogEnhancement testall/);
});

test("start chain playbook uses repoKey-specific worktree for frontend chains", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-start-chain-frontend-"));
  const vaultRoot = path.join(homeRoot, "PasObsidian");
  const projectRoot = path.join(vaultRoot, "Projects", "飞枢系统");
  const shareRoot = path.join(projectRoot, "share");
  const scopedShareRoot = path.join(shareRoot, "sources", "req-ui");
  const backendRepo = path.join(homeRoot, "ff");
  const frontendRepo = path.join(homeRoot, "frontend", "your-frontend-repo");
  const frontendWorktreesRoot = path.join(homeRoot, "frontend-worktrees");
  const binRoot = path.join(homeRoot, "bin");
  const tmuxStatePath = path.join(homeRoot, "tmux-state.txt");
  const gitStatePath = path.join(homeRoot, "git-state.txt");

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(backendRepo, { recursive: true }),
    mkdir(frontendRepo, { recursive: true }),
    mkdir(frontendWorktreesRoot, { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  await Promise.all([
    writeFile(
      path.join(shareRoot, "project-status.json"),
      JSON.stringify({
        repos: {
          backend: {
            path: "~/ff",
            worktreesBase: "~/ff-worktrees"
          },
          frontend: {
            path: "~/frontend/your-frontend-repo",
            worktreesBase: "~/frontend-worktrees"
          }
        },
        requirements: [
          {
            id: "req-ui",
            title: "前端需求",
            status: "active",
            docPath: "Projects/飞枢系统/05-需求/req-ui/前端需求.md",
            kind: "single",
            chains: [
              {
                id: "ChargeDashboardPage",
                titleZh: "收费统计页面",
                type: "frontend",
                repoKey: "frontend",
                stage: "S1",
                status: "active",
                session: "chain-req-ui-ChargeDashboardPage"
              }
            ]
          }
        ]
      }, null, 2)
    ),
    writeFile(
      path.join(scopedShareRoot, "chinese-chain-names.json"),
      JSON.stringify({ ChargeDashboardPage: "收费统计页面" }, null, 2)
    ),
    writeFile(path.join(shareRoot, "worker-prompt-template.md"), "恢复 {{CHAIN_CHINESE}} / {{CHAIN_ENGLISH}}\n"),
    writeFile(
      path.join(shareRoot, "runtime_sync.py"),
      [
        "def write_manual_session_hold(chain_id: str, **_kwargs):",
        "    return {chain_id: '2026-03-30 12:00:00'}",
        "",
      ].join("\n")
    ),
    writeExecutable(path.join(binRoot, "opencode"), "#!/usr/bin/env bash\nexit 0\n"),
    writeExecutable(
      path.join(binRoot, "git"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${gitStatePath}"
if [[ "$1" == "-C" ]]; then
  repo="$2"
  shift 2
else
  repo=""
fi
if [[ "$1" == "rev-parse" ]]; then
  exit 1
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

  const { stdout } = await execFile("bash", [START_PLAYBOOK_PATH, "收费统计页面", "req-ui"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOME: homeRoot,
      PATH: `${binRoot}:${process.env.PATH ?? ""}`,
      VAULT: vaultRoot
    }
  });

  const tmuxState = await readFile(tmuxStatePath, "utf-8");
  const gitState = await readFile(gitStatePath, "utf-8");
  assert.match(stdout, /已启动 session: chain-req-ui-ChargeDashboardPage/);
  assert.match(tmuxState, /new-session .*chain-req-ui-ChargeDashboardPage -c .*frontend-worktrees\/req-ui$/m);
  assert.match(gitState, /-C .*ccweb\/your-frontend-repo show-ref --verify --quiet refs\/heads\/source\/req-ui/m);
  assert.match(gitState, /-C .*ccweb\/your-frontend-repo worktree add .*frontend-worktrees\/req-ui -b source\/req-ui/m);
});
