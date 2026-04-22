import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ChainRegistryEntry } from "../../../shared/event-model";

import { createActionRunner } from "./action-runner";
import { readControlInbox } from "./control-inbox";
import { getWorkspacePaths } from "./workspace-registry";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function makeActionFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-console-actions-"));
  const shareRoot = path.join(projectRoot, "share");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const mapsRoot = path.join(projectRoot, "Maps");
  const reviewsRoot = path.join(projectRoot, "Reviews");
  const notificationsRoot = path.join(projectRoot, "share", "notifications");
  const codeListsRoot = path.join(projectRoot, "CodeLists");
  const chainAssetRoot = path.join(projectRoot, "03-业务链资产", "测试用例");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(path.join(shareRoot, "work-items"), { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(mapsRoot, { recursive: true }),
    mkdir(codeListsRoot, { recursive: true }),
    mkdir(reviewsRoot, { recursive: true }),
    mkdir(notificationsRoot, { recursive: true }),
    mkdir(chainAssetRoot, { recursive: true })
  ]);

  const registry: ChainRegistryEntry[] = [
    {
      id: "ContractAddAndFee",
      nameZh: "合同创建并收费",
      priorityWave: "P0",
      sequence: 10,
      enabled: true
    },
    {
      id: "OperationLogTracking",
      nameZh: "操作日志记录",
      priorityWave: "P1",
      sequence: 20,
      enabled: true
    },
    {
      id: "HomepageReminder",
      nameZh: "首页合同到期提醒",
      priorityWave: "P1",
      sequence: 40,
      enabled: true
    }
  ];

  await Promise.all([
    writeJson(path.join(shareRoot, "chain-registry.json"), registry),
    writeJson(path.join(shareRoot, "chain-status.json"), {
      ContractAddAndFee: { stage: "S5", updatedAt: "2026-03-28", summary: "done" },
      OperationLogTracking: { stage: "S2", updatedAt: "2026-03-28", summary: "working" },
      HomepageReminder: { stage: "S1", updatedAt: "2026-03-28", summary: "blocked", blocked: true }
    }),
    writeJson(path.join(shareRoot, "dispatch-queue.json"), {
      maxConcurrent: 3,
      pendingStart: ["OperationLogTracking", "HomepageReminder"],
      updatedAt: "2026-03-28 11:00:00"
    }),
    writeJson(path.join(shareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-03-28 11:00:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeJson(path.join(shareRoot, "chinese-chain-names.json"), {
      ContractAddAndFee: "合同创建并收费",
      OperationLogTracking: "操作日志记录",
      HomepageReminder: "首页合同到期提醒"
    }),
    writeJson(path.join(shareRoot, "work-items", "OperationLogTracking.json"), {
      chainId: "OperationLogTracking",
      mode: "active",
      currentTask: "继续当前唯一任务",
      expectedOutput: "输出当前阶段",
      allowedActions: ["实现"],
      forbiddenActions: [],
      lastVerifiedAt: "2026-03-28 11:00:00",
      updatedAt: "2026-03-28 11:00:00"
    }),
    writeFile(path.join(shareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(reviewsRoot, "Wave1-P0.md"), "# Wave1-P0\n"),
    writeFile(path.join(reviewsRoot, "Wave2-P1.md"), "# Wave2-P1\n\n### 1. OperationLogTracking [S2]\n- 失败时不得中断日志查询链路\n"),
    writeFile(path.join(mapsRoot, "OperationLogTracking.md"), "# OperationLogTracking\n\n## 范围\n- 记录关键操作日志\n\n## 当前边界\n- 日志查询失败时要明确返回错误，不做静默吞掉\n"),
    writeFile(path.join(codeListsRoot, "OperationLogTracking.md"), "# OperationLogTracking\n\n## 验证\n- 模块编译\n- 定向测试\n")
  ]);

  return {
    projectRoot,
    shareRoot,
    playbooksRoot,
    mapsRoot,
    codeListsRoot,
    reviewsRoot,
    notificationsRoot,
    chainAssetRoot,
    actionEventsPath: path.join(shareRoot, "action-events.jsonl")
  };
}

async function makeFreshActionFixture() {
  const fixture = await makeActionFixture();
  await writeJson(path.join(fixture.shareRoot, "work-items", "OperationLogTracking.json"), {
    chainId: "OperationLogTracking",
    mode: "active",
    currentTask: "继续当前唯一任务",
    expectedOutput: "输出当前阶段",
    allowedActions: ["恢复上下文", "定位代码入口", "影响分析"],
    forbiddenActions: [],
    lastVerifiedAt: "2026-03-28 11:00:00",
    updatedAt: "2026-03-28 11:00:00"
  });
  return fixture;
}

async function seedScopedWorkspaceFixture(fixture: Awaited<ReturnType<typeof makeFreshActionFixture>>, sourceId: string) {
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", sourceId);
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const scopedNotificationsRoot = path.join(scopedShareRoot, "notifications");
  const scopedMapsRoot = path.join(fixture.mapsRoot, sourceId);
  const scopedReviewsRoot = path.join(fixture.reviewsRoot, sourceId);

  await Promise.all([
    mkdir(scopedShareRoot, { recursive: true }),
    mkdir(scopedWorkItemsRoot, { recursive: true }),
    mkdir(scopedNotificationsRoot, { recursive: true }),
    mkdir(scopedMapsRoot, { recursive: true }),
    mkdir(scopedReviewsRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
      {
        id: "OperationLogTracking",
        nameZh: "操作日志记录",
        priorityWave: "P1",
        sequence: 20,
        enabled: true
      }
    ]),
    writeJson(path.join(scopedShareRoot, "chain-status.json"), {
      OperationLogTracking: { stage: "S1", updatedAt: "2026-04-02", summary: "working" }
    }),
    writeJson(path.join(scopedShareRoot, "dispatch-queue.json"), {
      maxConcurrent: 1,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-04-02 16:00:00"
    }),
    writeJson(path.join(scopedShareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-04-02 16:00:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
      OperationLogTracking: "操作日志记录"
    }),
    writeJson(path.join(scopedWorkItemsRoot, "OperationLogTracking.json"), {
      chainId: "OperationLogTracking",
      mode: "active",
      currentTask: "恢复上下文",
      expectedOutput: "输出下一步",
      allowedActions: ["恢复上下文"],
      forbiddenActions: ["直接实现"]
    }),
    writeFile(path.join(scopedShareRoot, "action-events.jsonl"), ""),
    writeFile(path.join(scopedMapsRoot, "OperationLogTracking.md"), "# OperationLogTracking\n"),
    writeFile(path.join(scopedReviewsRoot, "Wave2-P1.md"), "# Wave2-P1\n")
  ]);
}

test("resume_chain_session ignores legacy work-item modes once mode is derived", async () => {
  const fixture = await makeActionFixture();
  await writeJson(path.join(fixture.shareRoot, "work-items", "OperationLogTracking.json"), {
    chainId: "OperationLogTracking",
    mode: "done",
    currentTask: "保持只读参考，不重新开工",
    expectedOutput: "输出当前阶段",
    allowedActions: ["只读核对"],
    forbiddenActions: ["重新开工"],
    lastVerifiedAt: "2026-03-28 11:00:00",
    updatedAt: "2026-03-28 11:00:00"
  });
  let execCalled = false;
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async () => {
        execCalled = true;
        return { stdout: "", stderr: "" };
      },
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      now: () => new Date("2026-03-28T12:03:30Z")
    }
  );

  const result = await runAction({ actionType: "resume_chain_session", targetId: "OperationLogTracking" as any });

  assert.equal(result.success, true);
  assert.equal(execCalled, true);
});

test("copy_attach_command remains allowed when preflight is drift", async () => {
  const fixture = await makeActionFixture();
  await writeJson(path.join(fixture.shareRoot, "work-items", "OperationLogTracking.json"), {
    chainId: "OperationLogTracking",
    mode: "done",
    currentTask: "保持只读参考，不重新开工",
    expectedOutput: "输出当前阶段",
    allowedActions: ["只读核对"],
    forbiddenActions: ["重新开工"],
    lastVerifiedAt: "2026-03-28 11:00:00",
    updatedAt: "2026-03-28 11:00:00"
  });
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      now: () => new Date("2026-03-28T12:00:00Z")
    }
  );

  const result = await runAction({ actionType: "copy_attach_command", targetId: "OperationLogTracking" });
  assert.equal(result.success, true);
  assert.equal(result.command, "tmux attach -t chain-newfee-OperationLogTracking");
});

test("open_session returns attach command and writes an action event", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:00:00Z")
    }
  );

  const result = await runAction({ actionType: "open_session", targetId: "OperationLogTracking" });

  assert.equal(result.success, true);
  assert.equal(result.command, "tmux attach -t chain-newfee-OperationLogTracking");

  const actionLog = await readFile(fixture.actionEventsPath, "utf8");
  assert.equal(actionLog.includes("open_session"), true);
});

test("start_chain_session launches a missing chain session and returns attach command", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return {
          stdout: "[OK] 已启动 session: chain-OperationLogTracking\n[OK] 提示词文件: /tmp/ff-worker-prompt-OperationLogTracking.md\n",
          stderr: ""
        };
      },
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-30T09:00:00Z")
    }
  );

  const result = await runAction({ actionType: "start_chain_session" as any, targetId: "OperationLogTracking" as any });

  assert.equal(result.success, true);
  assert.equal(result.command, "tmux attach -t chain-newfee-OperationLogTracking");
  assert.equal(result.message, "已启动该链 session 并注入初始上下文，可继续 attach 进入编码。");
  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-chain-session.sh"), "OperationLogTracking"]
    }
  ]);

  const actionLog = await readFile(fixture.actionEventsPath, "utf8");
  assert.equal(actionLog.includes("start_chain_session"), true);
});

test("start_chain_session rejects chains that already have a running session", async () => {
  const fixture = await makeFreshActionFixture();
  let execCalled = false;
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async () => {
        execCalled = true;
        return { stdout: "", stderr: "" };
      },
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      now: () => new Date("2026-03-30T09:01:00Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "start_chain_session" as any, targetId: "OperationLogTracking" as any }),
    { message: "链 session 已在运行，请直接恢复上下文或 attach 进入：OperationLogTracking" }
  );

  assert.equal(execCalled, false);
});

test("resume_chain_session runs resume playbook and returns attach command", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return {
          stdout: "[OK] 已向 session 'chain-OperationLogTracking' 发送 LIGHT resume 提示\n",
          stderr: ""
        };
      },
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      now: () => new Date("2026-03-28T12:03:00Z")
    }
  );

  const result = await runAction({ actionType: "resume_chain_session", targetId: "OperationLogTracking" as any });

  assert.equal(result.success, true);
  assert.equal(result.command, "tmux attach -t chain-newfee-OperationLogTracking");
  assert.equal(result.message, "已向该链 session 注入恢复上下文，可继续 attach 进入编码。");
  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "resume-chain-session.sh"), "OperationLogTracking"]
    }
  ]);

  const actionLog = await readFile(fixture.actionEventsPath, "utf8");
  assert.equal(actionLog.includes("resume_chain_session"), true);
});

test("resume_chain_session rejects chains without a running session", async () => {
  const fixture = await makeFreshActionFixture();
  let execCalled = false;
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async () => {
        execCalled = true;
        return { stdout: "", stderr: "" };
      },
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:03:30Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "resume_chain_session", targetId: "OperationLogTracking" as any }),
    { message: "链 session 未运行，请先启动该链后再恢复上下文：OperationLogTracking" }
  );

  assert.equal(execCalled, false);
});

test("start_chain_session passes sourceId to playbook for scoped workspaces", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const workspacePaths = getWorkspacePaths(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      sourceId: "testall",
      label: "testAll",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/testAll.md",
      legacyRoot: false,
      draftIncomplete: true
    }
  );

  const runAction = createActionRunner(workspacePaths, {
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return {
        stdout: "[OK] 已启动 session: chain-OperationLogTracking\n",
        stderr: ""
      };
    },
    listTmuxSessions: async () => [],
    now: () => new Date("2026-03-30T09:00:00Z")
  });

  await runAction({ actionType: "start_chain_session" as any, targetId: "OperationLogTracking" as any });

  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-source-main-control.sh"), "testall"]
    },
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-chain-session.sh"), "OperationLogTracking", "testall"]
    }
  ]);
});

test("resume_chain_session passes sourceId to playbook for scoped workspaces", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const workspacePaths = getWorkspacePaths(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      sourceId: "testall",
      label: "testAll",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/testAll.md",
      legacyRoot: false,
      draftIncomplete: true
    }
  );

  const runAction = createActionRunner(workspacePaths, {
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return {
        stdout: "[OK] 已向 session 'chain-OperationLogTracking' 发送 LIGHT resume 提示\n",
        stderr: ""
      };
    },
    listTmuxSessions: async () => ["chain-testall-OperationLogTracking"],
    now: () => new Date("2026-03-28T12:03:00Z")
  });

  await runAction({ actionType: "resume_chain_session", targetId: "OperationLogTracking" as any });

  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-source-main-control.sh"), "testall"]
    },
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "resume-chain-session.sh"), "OperationLogTracking", "testall"]
    }
  ]);
});

test("start_chain_session auto-starts source main-control for scoped workspaces", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const workspacePaths = getWorkspacePaths(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      sourceId: "testall",
      label: "testAll",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/testAll.md",
      legacyRoot: false,
      draftIncomplete: true,
      worktreePath: "/tmp/ff-worktrees/testall"
    }
  );

  const runAction = createActionRunner(workspacePaths, {
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return {
        stdout: args[0]?.endsWith("start-source-main-control.sh")
          ? "[OK] 已启动需求子主控 session: main-control-testall\n"
          : "[OK] 已启动 session: chain-OperationLogTracking\n",
        stderr: ""
      };
    },
    listTmuxSessions: async () => [],
    now: () => new Date("2026-04-03T09:00:00Z")
  });

  await runAction({ actionType: "start_chain_session", targetId: "OperationLogTracking" as any });

  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-source-main-control.sh"), "testall"]
    },
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-chain-session.sh"), "OperationLogTracking", "testall"]
    }
  ]);
});

test("resume_chain_session auto-starts source main-control for scoped workspaces", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const workspacePaths = getWorkspacePaths(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      sourceId: "testall",
      label: "testAll",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/testAll.md",
      legacyRoot: false,
      draftIncomplete: true,
      worktreePath: "/tmp/ff-worktrees/testall"
    }
  );

  const runAction = createActionRunner(workspacePaths, {
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return {
        stdout: args[0]?.endsWith("start-source-main-control.sh")
          ? "[OK] 已启动需求子主控 session: main-control-testall\n"
          : "[OK] 已向 session 'chain-OperationLogTracking' 发送 LIGHT resume 提示\n",
        stderr: ""
      };
    },
    listTmuxSessions: async () => ["chain-testall-OperationLogTracking"],
    now: () => new Date("2026-04-03T09:00:00Z")
  });

  await runAction({ actionType: "resume_chain_session", targetId: "OperationLogTracking" as any });

  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-source-main-control.sh"), "testall"]
    },
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "resume-chain-session.sh"), "OperationLogTracking", "testall"]
    }
  ]);
});

test("scoped chain actions fall back to the default tmux session lister when dependency is omitted", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "tmux-fallback");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const workspacePaths = getWorkspacePaths(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      sourceId: "tmux-fallback",
      label: "tmuxFallback",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/tmuxFallback.md",
      legacyRoot: false,
      draftIncomplete: true,
      worktreePath: "/tmp/ff-worktrees/tmux-fallback"
    }
  );

  const runAction = createActionRunner(workspacePaths, {
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return {
        stdout: args[0]?.endsWith("start-source-main-control.sh")
          ? "[OK] 已启动需求子主控 session: main-control-tmux-fallback\n"
          : "[OK] 已启动 session: chain-tmux-fallback-OperationLogTracking\n",
        stderr: ""
      };
    },
    now: () => new Date("2026-04-03T11:00:00Z")
  });

  await runAction({ actionType: "start_chain_session", targetId: "OperationLogTracking" as any });

  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-source-main-control.sh"), "tmux-fallback"]
    },
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "start-chain-session.sh"), "OperationLogTracking", "tmux-fallback"]
    }
  ]);
});

test("open_terminal_and_attach launches Terminal with the chain attach command", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "Terminal opened\n", stderr: "" };
      },
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      now: () => new Date("2026-03-28T12:04:00Z")
    }
  );

  const result = await runAction({ actionType: "open_terminal_and_attach", targetId: "OperationLogTracking" as any });

  assert.equal(result.success, true);
  assert.equal(result.command, "tmux attach -t chain-newfee-OperationLogTracking");
  assert.equal(result.message, "已尝试打开 Terminal 并进入该链 session。");
  assert.deepEqual(execCalls, [
    {
      file: "osascript",
      args: [
        "-e",
        'tell application "Terminal" to activate',
        "-e",
        'tell application "Terminal" to do script "tmux attach -t chain-newfee-OperationLogTracking"'
      ]
    }
  ]);

  const actionLog = await readFile(fixture.actionEventsPath, "utf8");
  assert.equal(actionLog.includes("open_terminal_and_attach"), true);
});

test("open_terminal_and_attach rejects chains without a running session", async () => {
  const fixture = await makeFreshActionFixture();
  let execCalled = false;
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async () => {
        execCalled = true;
        return { stdout: "", stderr: "" };
      },
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:04:30Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "open_terminal_and_attach", targetId: "OperationLogTracking" as any }),
    { message: "链 session 未运行，请先启动该链后再进入终端：OperationLogTracking" }
  );

  assert.equal(execCalled, false);
});

test("handoff_main_control runs the handoff playbook", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "交接完成。下一任主控先读: /tmp/LATEST.md\n", stderr: "" };
      },
      now: () => new Date("2026-03-29T03:00:00Z")
    }
  );

  const result = await runAction({ actionType: "handoff_main_control" as any, confirmed: true });

  assert.equal(result.success, true);
  assert.equal(result.message, "已生成主控交接并更新 LATEST。");
  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "handoff-main-control.sh")]
    }
  ]);
});

test("handoff_main_control uses source playbook for scoped workspaces", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "已生成需求子主控交接\n", stderr: "" };
      },
      now: () => new Date("2026-03-29T03:00:00Z")
    }
  );

  await runAction({ actionType: "handoff_main_control" as any, confirmed: true });

  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "handoff-source-main-control.sh"), "testall"]
    }
  ]);
});

test("rotate_main_control_session runs the rotate playbook", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const timeouts: number[] = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args, options) => {
        execCalls.push({ file, args });
        timeouts.push(options?.timeout ?? 0);
        return { stdout: "已在 tmux session 'main-control' 内轮换新的主控上下文。\n", stderr: "" };
      },
      now: () => new Date("2026-03-29T03:03:00Z")
    }
  );

  const result = await runAction({ actionType: "rotate_main_control_session" as any, confirmed: true });

  assert.equal(result.success, true);
  assert.equal(result.message, "已在 main-control 内轮换新的主控上下文。");
  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "rotate-main-control-session.sh")]
    }
  ]);
  assert.deepEqual(timeouts, [600000]);
});

test("open_main_control_terminal opens Terminal and attaches main-control", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "tab 1 of window id 28001\n", stderr: "" };
      },
      now: () => new Date("2026-03-29T03:05:00Z")
    }
  );

  const result = await runAction({ actionType: "open_main_control_terminal" as any });

  assert.equal(result.success, true);
  assert.equal(result.command, "tmux attach -t main-control");
  assert.equal(result.message, "已尝试打开 Terminal 并进入 main-control。");
  assert.deepEqual(execCalls, [
    {
      file: "osascript",
      args: [
        "-e",
        'tell application "Terminal" to activate',
        "-e",
        'tell application "Terminal" to do script "tmux attach -t main-control"'
      ]
    }
  ]);
});

test("open_main_control_terminal opens Terminal and attaches source main-control", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "tab 1 of window id 28001\n", stderr: "" };
      },
      now: () => new Date("2026-03-29T03:05:00Z")
    }
  );

  const result = await runAction({ actionType: "open_main_control_terminal" as any });

  assert.equal(result.command, "tmux attach -t main-control-testall");
  assert.deepEqual(execCalls, [
    {
      file: "osascript",
      args: [
        "-e",
        'tell application "Terminal" to activate',
        "-e",
        'tell application "Terminal" to do script "tmux attach -t main-control-testall"'
      ]
    }
  ]);
});

test("escalate_to_source_control appends source control inbox item", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const scopedInboxPath = path.join(fixture.shareRoot, "sources", "testall", "control-inbox.jsonl");
  await writeFile(scopedInboxPath, "", "utf8");
  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-04-03T10:00:00Z")
    }
  );

  const result = await runAction({
    actionType: "escalate_to_source_control" as any,
    targetId: "OperationLogTracking",
    payload: { reason: "需要子主控裁决", requestedAction: "确认下一步", severity: "warning" }
  });

  const items = await readControlInbox(scopedInboxPath);
  assert.equal(result.success, true);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.scopeTo, "source");
  assert.equal(items[0]?.chainId, "OperationLogTracking");
});

test("send_to_defect appends independent defect items without overwriting history", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const scopedWorkItemsRoot = path.join(scopedShareRoot, "work-items");
  const defectItemsRoot = path.join(scopedShareRoot, "defect-items");
  await writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
    { id: "OperationLogTracking", nameZh: "操作日志记录", priorityWave: "P1", sequence: 20, enabled: true },
    { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
  ]);
  await writeJson(path.join(scopedShareRoot, "chain-status.json"), {
    OperationLogTracking: { stage: "S1", updatedAt: "2026-04-02", summary: "working" },
    Defect: { stage: "PENDING", updatedAt: null, summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
  });
  await writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
    OperationLogTracking: "操作日志记录",
    Defect: "缺陷处理"
  });
  await writeJson(path.join(scopedWorkItemsRoot, "Defect.json"), {
    chainId: "Defect",
    mode: "hold",
    currentTask: "等待缺陷进入并由主控派发当前唯一缺陷任务",
    expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
    allowedActions: ["恢复上下文", "缺陷归因", "状态判断", "最小修复方案"],
    forbiddenActions: ["擅自扩展为新功能", "无来源链直接进入大改"],
    sourceChainId: null,
    severity: null,
    regression: null,
    expectedBehavior: null,
    actualBehavior: null,
    verificationScope: []
  });

  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-04-03T10:05:00Z")
    }
  );

  const result = await runAction({
    actionType: "send_to_defect" as any,
    targetId: "OperationLogTracking",
    payload: {
      reason: "分页日志缺少合同 ID",
      severity: "high",
      regression: true,
      expectedBehavior: "分页日志应包含合同 ID",
      actualBehavior: "当前响应缺少合同 ID",
      verificationScope: ["OperationLogTracking 单测", "接口回归"]
    }
  });

  await runAction({
    actionType: "send_to_defect" as any,
    targetId: "OperationLogTracking",
    payload: {
      reason: "第二个缺陷",
      severity: "warning",
      regression: false,
      expectedBehavior: "第二次调用应保留第一条",
      actualBehavior: "当前只保留最新",
      verificationScope: ["第二轮验证"]
    }
  });

  const defect = JSON.parse(await readFile(path.join(scopedWorkItemsRoot, "Defect.json"), "utf8"));
  const defectItemNames = (await readdir(defectItemsRoot)).filter((name) => name.endsWith(".json")).sort();
  const firstDefectItem = JSON.parse(await readFile(path.join(defectItemsRoot, defectItemNames[0]!), "utf8"));
  const secondDefectItem = JSON.parse(await readFile(path.join(defectItemsRoot, defectItemNames[1]!), "utf8"));

  assert.equal(result.success, true);
  assert.equal("mode" in defect, false);
  assert.equal(defect.sourceChainId, "OperationLogTracking");
  assert.match(defect.currentTask, /2 条缺陷|OperationLogTracking/u);
  assert.equal(defectItemNames.length, 2);
  assert.equal(firstDefectItem.sourceChainId, "OperationLogTracking");
  assert.equal(firstDefectItem.severity, "high");
  assert.equal(firstDefectItem.regression, true);
  assert.equal(firstDefectItem.expectedBehavior, "分页日志应包含合同 ID");
  assert.equal(firstDefectItem.actualBehavior, "当前响应缺少合同 ID");
  assert.deepEqual(firstDefectItem.verificationScope, ["OperationLogTracking 单测", "接口回归"]);
  assert.equal(secondDefectItem.reason, "第二个缺陷");
  assert.equal(secondDefectItem.severity, "warning");
  assert.equal(secondDefectItem.regression, false);
});

test("defect item actions drive claim fixed and verify lifecycle", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const defectItemsRoot = path.join(scopedShareRoot, "defect-items");

  await mkdir(defectItemsRoot, { recursive: true });
  await writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
    { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
  ]);
  await writeJson(path.join(scopedShareRoot, "chain-status.json"), {
    Defect: { stage: "PENDING", updatedAt: null, summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
  });
  await writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
    Defect: "缺陷处理"
  });
  await writeJson(path.join(scopedShareRoot, "work-items", "Defect.json"), {
    chainId: "Defect",
    mode: "hold",
    currentTask: "跟进最近 1 条缺陷"
  });
  await writeJson(path.join(defectItemsRoot, "2026-04-03-100500-OperationLogTracking-001.json"), {
    itemId: "2026-04-03-100500-OperationLogTracking-001",
    sourceChainId: "OperationLogTracking",
    reason: "分页日志缺少合同 ID",
    severity: "high",
    regression: true,
    expectedBehavior: "分页日志应包含合同 ID",
    actualBehavior: "当前响应缺少合同 ID",
    verificationScope: ["OperationLogTracking 单测"],
    createdAt: "2026-04-03 10:05:00",
    createdBy: "main-control-testall",
    status: "open",
    claimedBy: null,
    claimedAt: null,
    fixedAt: null,
    verifiedAt: null
  });

  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-04-03T10:15:00Z")
    }
  );

  await runAction({ actionType: "claim_defect_item" as any, targetId: "Defect", payload: { itemId: "2026-04-03-100500-OperationLogTracking-001", claimedBy: "qa-user" } });
  await runAction({ actionType: "mark_defect_fixed" as any, targetId: "Defect", payload: { itemId: "2026-04-03-100500-OperationLogTracking-001" } });
  await runAction({ actionType: "verify_defect_item" as any, targetId: "Defect", payload: { itemId: "2026-04-03-100500-OperationLogTracking-001" } });

  const defectWorkItem = JSON.parse(await readFile(path.join(scopedShareRoot, "work-items", "Defect.json"), "utf8"));
  const defectItem = JSON.parse(await readFile(path.join(defectItemsRoot, "2026-04-03-100500-OperationLogTracking-001.json"), "utf8"));
  assert.equal("mode" in defectWorkItem, false);
  assert.equal(defectWorkItem.sourceChainId, "OperationLogTracking");
  assert.match(defectWorkItem.currentTask, /验证已修复缺陷/);
  assert.match(defectWorkItem.currentTask, /2026-04-03-100500-OperationLogTracking-001/);
  assert.equal(defectWorkItem.expectedBehavior, "分页日志应包含合同 ID");
  assert.equal(defectWorkItem.actualBehavior, "当前响应缺少合同 ID");
  assert.deepEqual(defectWorkItem.verificationScope, ["OperationLogTracking 单测"]);
  assert.equal(defectItem.status, "verified");
  assert.equal(defectItem.claimedBy, "qa-user");
  assert.equal(defectItem.claimedAt, "2026-04-03 10:15:00");
  assert.equal(defectItem.fixedAt, "2026-04-03 10:15:00");
  assert.equal(defectItem.verifiedAt, "2026-04-03 10:15:00");
});

test("claim_defect_item refreshes running Defect session context", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const defectItemsRoot = path.join(scopedShareRoot, "defect-items");
  const execCalls: Array<{ file: string; args: string[] }> = [];

  await mkdir(defectItemsRoot, { recursive: true });
  await writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
    { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
  ]);
  await writeJson(path.join(scopedShareRoot, "chain-status.json"), {
    Defect: { stage: "PENDING", updatedAt: null, summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
  });
  await writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
    Defect: "缺陷处理"
  });
  await writeJson(path.join(scopedShareRoot, "work-items", "Defect.json"), {
    chainId: "Defect",
    mode: "hold",
    currentTask: "跟进最近 1 条缺陷"
  });
  await writeJson(path.join(defectItemsRoot, "2026-04-03-100500-CustomerServiceStatus-001.json"), {
    itemId: "2026-04-03-100500-CustomerServiceStatus-001",
    sourceChainId: "CustomerServiceStatus",
    reason: "服务状态优先级错误",
    severity: "high",
    regression: true,
    expectedBehavior: "优先关联最新记账服务状态",
    actualBehavior: "当前返回了全部项目状态",
    verificationScope: ["CustomerServiceStatus 回归"],
    createdAt: "2026-04-03 10:05:00",
    createdBy: "main-control-testall",
    status: "open",
    claimedBy: null,
    claimedAt: null,
    fixedAt: null,
    verifiedAt: null
  });

  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "[OK] 已向 session 'chain-testall-Defect' 发送 LIGHT resume 提示", stderr: "" };
      },
      listTmuxSessions: async () => ["chain-testall-Defect"],
      now: () => new Date("2026-04-03T10:20:00Z")
    }
  );

  const result = await runAction({ actionType: "claim_defect_item" as any, targetId: "Defect", payload: { itemId: "2026-04-03-100500-CustomerServiceStatus-001", claimedBy: "qa-user" } });

  const defectWorkItem = JSON.parse(await readFile(path.join(scopedShareRoot, "work-items", "Defect.json"), "utf8"));
  assert.equal("mode" in defectWorkItem, false);
  assert.equal(defectWorkItem.sourceChainId, "CustomerServiceStatus");
  assert.match(defectWorkItem.currentTask, /2026-04-03-100500-CustomerServiceStatus-001/);
  assert.match(result.message, /已刷新当前 Defect session/);
  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "resume-chain-session.sh"), "Defect", "testall"]
    }
  ]);
});

test("mark_defect_fixed refreshes running Defect session into verification context", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const scopedShareRoot = path.join(fixture.shareRoot, "sources", "testall");
  const defectItemsRoot = path.join(scopedShareRoot, "defect-items");
  const execCalls: Array<{ file: string; args: string[] }> = [];

  await mkdir(defectItemsRoot, { recursive: true });
  await writeJson(path.join(scopedShareRoot, "chain-registry.json"), [
    { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
  ]);
  await writeJson(path.join(scopedShareRoot, "chain-status.json"), {
    Defect: { stage: "PENDING", updatedAt: null, summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
  });
  await writeJson(path.join(scopedShareRoot, "chinese-chain-names.json"), {
    Defect: "缺陷处理"
  });
  await writeJson(path.join(scopedShareRoot, "work-items", "Defect.json"), {
    chainId: "Defect",
    mode: "active",
    currentTask: "处理已认领缺陷 2026-04-03-100500-CustomerServiceStatus-001"
  });
  await writeJson(path.join(defectItemsRoot, "2026-04-03-100500-CustomerServiceStatus-001.json"), {
    itemId: "2026-04-03-100500-CustomerServiceStatus-001",
    sourceChainId: "CustomerServiceStatus",
    reason: "服务状态优先级错误",
    severity: "high",
    regression: true,
    expectedBehavior: "优先关联最新记账服务状态",
    actualBehavior: "当前返回了全部项目状态",
    verificationScope: ["CustomerServiceStatus 回归"],
    createdAt: "2026-04-03 10:05:00",
    createdBy: "main-control-testall",
    status: "claimed",
    claimedBy: "qa-user",
    claimedAt: "2026-04-03 10:10:00",
    fixedAt: null,
    verifiedAt: null
  });

  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "[OK] 已向 session 'chain-testall-Defect' 发送 LIGHT resume 提示", stderr: "" };
      },
      listTmuxSessions: async () => ["chain-testall-Defect"],
      now: () => new Date("2026-04-03T10:25:00Z")
    }
  );

  const result = await runAction({ actionType: "mark_defect_fixed" as any, targetId: "Defect", payload: { itemId: "2026-04-03-100500-CustomerServiceStatus-001" } });

  const defectWorkItem = JSON.parse(await readFile(path.join(scopedShareRoot, "work-items", "Defect.json"), "utf8"));
  const defectItem = JSON.parse(await readFile(path.join(defectItemsRoot, "2026-04-03-100500-CustomerServiceStatus-001.json"), "utf8"));
  assert.equal(defectItem.status, "fixed");
  assert.equal(defectItem.fixedAt, "2026-04-03 10:25:00");
  assert.equal("mode" in defectWorkItem, false);
  assert.equal(defectWorkItem.sourceChainId, "CustomerServiceStatus");
  assert.match(defectWorkItem.currentTask, /验证已修复缺陷/);
  assert.match(result.message, /待验证视角/);
  assert.match(result.message, /已刷新当前 Defect session/);
  assert.deepEqual(execCalls, [
    {
      file: "bash",
      args: [path.join(fixture.playbooksRoot, "resume-chain-session.sh"), "Defect", "testall"]
    }
  ]);
});

test("escalate_to_global_control appends global control inbox item", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const globalInboxDir = path.join(fixture.projectRoot, "share", "global");
  const globalInboxPath = path.join(globalInboxDir, "control-inbox.jsonl");
  await mkdir(globalInboxDir, { recursive: true });
  await writeFile(globalInboxPath, "", "utf8");
  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-04-03T10:01:00Z")
    }
  );

  await runAction({
    actionType: "escalate_to_global_control" as any,
    payload: { reason: "需要全局主控裁决", requestedAction: "暂停需求", severity: "critical" }
  });

  const items = await readControlInbox(globalInboxPath);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.scopeTo, "global");
  assert.equal(items[0]?.severity, "critical");
});

test("claim_control_item and resolve_control_item update scoped inbox status", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const scopedInboxPath = path.join(fixture.shareRoot, "sources", "testall", "control-inbox.jsonl");
  await writeFile(scopedInboxPath, '{"eventId":"control:1","scopeFrom":"chain","scopeTo":"source","sourceId":"testall","chainId":"OperationLogTracking","severity":"warning","reason":"need","requestedAction":"confirm","status":"open","createdAt":"2026-04-03 10:00:00","claimedBy":null,"resolvedAt":null}\n', "utf8");
  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-04-03T10:02:00Z")
    }
  );

  await runAction({ actionType: "claim_control_item" as any, payload: { scope: "source", eventId: "control:1", claimedBy: "main-control-testall" } });
  await runAction({ actionType: "resolve_control_item" as any, payload: { scope: "source", eventId: "control:1" } });

  const items = await readControlInbox(scopedInboxPath);
  assert.equal(items[0]?.status, "resolved");
  assert.equal(items[0]?.claimedBy, "main-control-testall");
  assert.equal(items[0]?.resolvedAt, "2026-04-03 10:02:00");
});

test("sleep_source_main_control and wake_source_main_control run source lifecycle playbooks", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "ok\n", stderr: "" };
      },
      listTmuxSessions: async () => [],
      now: () => new Date("2026-04-03T10:03:00Z")
    }
  );

  await runAction({ actionType: "sleep_source_main_control" as any, confirmed: true });
  await runAction({ actionType: "wake_source_main_control" as any, confirmed: true });

  assert.deepEqual(execCalls, [
    { file: "bash", args: [path.join(fixture.playbooksRoot, "sleep-source-main-control.sh"), "testall"] },
    { file: "bash", args: [path.join(fixture.playbooksRoot, "wake-source-main-control.sh"), "testall"] }
  ]);
});

test("wake_source_main_control evicts oldest unpinned source when capacity is full", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const globalDir = path.join(fixture.projectRoot, "share", "global");
  await mkdir(globalDir, { recursive: true });
  await writeJson(path.join(globalDir, "orchestration-state.json"), {
    maxRunningSources: 2,
    runningSources: ["old-a", "old-b"],
    sourceStates: {
      "old-a": { sourceId: "old-a", runtimeState: "running", lastActiveAt: "2026-04-03 09:00:00", pinned: false },
      "old-b": { sourceId: "old-b", runtimeState: "running", lastActiveAt: "2026-04-03 09:10:00", pinned: false }
    },
    updatedAt: "2026-04-03 09:10:00"
  });
  await Promise.all([
    mkdir(path.join(fixture.projectRoot, "share", "sources", "old-a"), { recursive: true }),
    mkdir(path.join(fixture.projectRoot, "share", "sources", "old-b"), { recursive: true })
  ]);
  await Promise.all([
    writeJson(path.join(fixture.projectRoot, "share", "sources", "old-a", "policy.json"), { autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 }),
    writeJson(path.join(fixture.projectRoot, "share", "sources", "old-b", "policy.json"), { autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 }),
    writeJson(path.join(fixture.projectRoot, "share", "sources", "testall", "policy.json"), { autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 })
  ]);

  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "ok\n", stderr: "" };
      },
      listTmuxSessions: async () => ["main-control-old-a", "main-control-old-b"],
      now: () => new Date("2026-04-03T10:03:00Z")
    }
  );

  await runAction({ actionType: "wake_source_main_control" as any, confirmed: true });

  assert.deepEqual(execCalls, [
    { file: "bash", args: [path.join(fixture.playbooksRoot, "sleep-source-main-control.sh"), "old-a"] },
    { file: "bash", args: [path.join(fixture.playbooksRoot, "wake-source-main-control.sh"), "testall"] }
  ]);
});

test("wake_source_main_control rejects when all running sources are pinned", async () => {
  const fixture = await makeFreshActionFixture();
  await seedScopedWorkspaceFixture(fixture, "testall");
  const globalDir = path.join(fixture.projectRoot, "share", "global");
  await mkdir(globalDir, { recursive: true });
  await writeJson(path.join(globalDir, "orchestration-state.json"), {
    maxRunningSources: 2,
    runningSources: ["old-a", "old-b"],
    sourceStates: {
      "old-a": { sourceId: "old-a", runtimeState: "pinned", lastActiveAt: "2026-04-03 09:00:00", pinned: true },
      "old-b": { sourceId: "old-b", runtimeState: "pinned", lastActiveAt: "2026-04-03 09:10:00", pinned: true }
    },
    updatedAt: "2026-04-03 09:10:00"
  });
  await Promise.all([
    mkdir(path.join(fixture.projectRoot, "share", "sources", "old-a"), { recursive: true }),
    mkdir(path.join(fixture.projectRoot, "share", "sources", "old-b"), { recursive: true })
  ]);
  await Promise.all([
    writeJson(path.join(fixture.projectRoot, "share", "sources", "old-a", "policy.json"), { autoSleep: true, idleSleepMinutes: 30, pinned: true, maxConcurrentChains: 3 }),
    writeJson(path.join(fixture.projectRoot, "share", "sources", "old-b", "policy.json"), { autoSleep: true, idleSleepMinutes: 30, pinned: true, maxConcurrentChains: 3 }),
    writeJson(path.join(fixture.projectRoot, "share", "sources", "testall", "policy.json"), { autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 })
  ]);

  const runAction = createActionRunner(
    getWorkspacePaths(
      {
        projectRoot: fixture.projectRoot,
        consoleRoot: path.join(fixture.projectRoot, "Console"),
        serverRoot: path.join(fixture.projectRoot, "Console", "server"),
        webRoot: path.join(fixture.projectRoot, "Console", "web"),
        shareRoot: fixture.shareRoot,
        actionEventsPath: fixture.actionEventsPath,
        playbooksRoot: fixture.playbooksRoot,
        mapsRoot: fixture.mapsRoot,
        reviewsRoot: fixture.reviewsRoot,
        notificationsRoot: fixture.notificationsRoot,
        specsRoot: path.join(fixture.projectRoot, "Specs"),
        plansRoot: path.join(fixture.projectRoot, "Plans")
      },
      {
        sourceId: "testall",
        label: "testAll",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testAll.md",
        worktreePath: "/tmp/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: true
      }
    ),
    {
      listTmuxSessions: async () => ["main-control-old-a", "main-control-old-b"],
      now: () => new Date("2026-04-03T10:03:00Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "wake_source_main_control" as any, confirmed: true }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match(String((error as Error).message), /没有可自动淘汰的需求子主控/);
      return true;
    }
  );
});

test("resync_queue rewrites queue using deterministic ordering", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      now: () => new Date("2026-03-28T12:05:00Z")
    }
  );

  const result = await runAction({ actionType: "resync_queue", confirmed: true });

  assert.equal(result.success, true);
  assert.deepEqual(result.queue?.pendingStart, []);

  const queueOnDisk = JSON.parse(await readFile(path.join(fixture.shareRoot, "dispatch-queue.json"), "utf8"));
  assert.deepEqual(queueOnDisk.pendingStart, []);
});

test("summarize_overview dispatches the fixed panel message to main-control", async () => {
  const fixture = await makeFreshActionFixture();
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async (file, args) => {
        execCalls.push({ file, args });
        return { stdout: "", stderr: "" };
      },
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:10:00Z")
    }
  );

  const result = await runAction({ actionType: "summarize_overview", confirmed: true });

  assert.equal(result.success, true);
  assert.deepEqual(execCalls, [
    {
      file: "tmux",
      args: ["send-keys", "-t", "main-control", "[panel-action] summarize-global-state", "Enter"]
    }
  ]);
});

test("generate_wave_summary rejects unsupported wave tokens", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async () => ({ stdout: "", stderr: "" }),
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:10:00Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "generate_wave_summary", targetId: "P1;rm -rf /", confirmed: true }),
    { message: "Unsupported wave target: P1;rm -rf /" }
  );
});

test("generate_wave_summary rejects waves that are not fully completed", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      execFile: async () => ({ stdout: "", stderr: "" }),
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-30T13:20:00Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "generate_wave_summary", targetId: "P1", confirmed: true }),
    { message: "当前波次 P1 尚未全部收口到 S5，不能触发 Wave 汇总" }
  );
});

test("generate_chain_test_cases writes a markdown draft and action event", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:20:00Z")
    }
  );

  const result = await runAction({ actionType: "generate_chain_test_cases", targetId: "OperationLogTracking" });

  assert.equal(result.success, true);
  assert.equal(result.actionType, "generate_chain_test_cases");
  assert.equal(result.generatedFiles?.[0], "OperationLogTracking-test-cases.md");
  assert.equal(result.path, "03-业务链资产/测试用例/OperationLogTracking-test-cases.md");

  const generated = await readFile(path.join(fixture.chainAssetRoot, "OperationLogTracking-test-cases.md"), "utf8");
  assert.match(generated, /OperationLogTracking 测试用例草案/u);
  assert.match(generated, /记录关键操作日志/u);
  assert.match(generated, /模块编译/u);
  assert.match(generated, /建议验证命令/u);
  assert.doesNotMatch(generated, /缺关键参数、空结果或非法状态/u);

  const actionLog = await readFile(fixture.actionEventsPath, "utf8");
  assert.equal(actionLog.includes("generate_chain_test_cases"), true);
});

test("runner rejects unconfirmed B-level actions even if called directly", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:12:00Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "resync_queue" }),
    { message: "Confirmation required for action: resync_queue" }
  );
});

test("promote_queue_item rejects chains that are not currently queued", async () => {
  const fixture = await makeFreshActionFixture();
  const runAction = createActionRunner(
    {
      projectRoot: fixture.projectRoot,
      consoleRoot: path.join(fixture.projectRoot, "Console"),
      serverRoot: path.join(fixture.projectRoot, "Console", "server"),
      webRoot: path.join(fixture.projectRoot, "Console", "web"),
      shareRoot: fixture.shareRoot,
      actionEventsPath: fixture.actionEventsPath,
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot,
      specsRoot: path.join(fixture.projectRoot, "Specs"),
      plansRoot: path.join(fixture.projectRoot, "Plans")
    },
    {
      listTmuxSessions: async () => [],
      now: () => new Date("2026-03-28T12:15:00Z")
    }
  );

  await assert.rejects(
    () => runAction({ actionType: "promote_queue_item", targetId: "ContractAddAndFee", confirmed: true }),
    { message: "Chain is not currently in dispatch queue: ContractAddAndFee" }
  );
});
