import assert from "node:assert/strict";
import test from "node:test";

import { createAiBridge } from "./ai-bridge";
import type { ControlPlaneState } from "../types/overview";
import type { ChainId } from "../../../shared/event-model";

const baseState: ControlPlaneState = {
  overview: {
    currentWave: "P2",
    totalChains: 12,
    completedChains: 8,
    activeChains: 2,
    pendingChains: 2,
    schedulerStatus: "running",
    mainControlHealth: "healthy",
    concurrency: { active: 3, max: 3 },
    lastNotificationAt: "2026-03-28 10:05",
    lastSummaryAt: "2026-03-28 14:07"
  },
  scheduler: {
    desiredState: "running",
    updatedAt: "2026-03-28 10:41:28",
    updatedBy: "start-ff-parallel-workspace.sh",
    pid: 34314,
    status: "running",
    activeSessions: ["chain-ChargeStatistical", "chain-EmployeePerformance", "chain-OldDataUpgrade"],
    lastActionSummary: "2026-03-28 13:59 当前有效并发: 3/3"
  },
  waveSummary: {
    wave: "P2",
    total: 4,
    completed: 2,
    active: 2,
    pending: 0,
    reviewPath: null
  },
  queue: {
    maxConcurrent: 3,
    pendingStart: ["HomepageReminder"],
    nextCandidate: "HomepageReminder",
    updatedAt: "2026-03-28 14:07"
  },
  chains: [
    {
      id: "ChargeStatistical",
      nameZh: "合同收费统计",
      stage: "S1",
      uiState: "active",
      priorityWave: "P2",
      summary: "合同收费统计当前处于 S1 需求收敛阶段。",
      updatedAt: "2026-03-25",
      sessionName: "chain-ChargeStatistical",
      sessionRunning: true,
      queued: false,
      queueIndex: null,
      riskCount: { critical: 0, warning: 0 },
      mapPath: "Maps/ChargeStatistical.md",
      blocked: false
    },
    {
      id: "HomepageReminder",
      nameZh: "首页合同到期提醒",
      stage: "S1",
      uiState: "blocked",
      priorityWave: "P1",
      summary: "主控已标识阻塞，暂停推进，等待后续恢复。",
      updatedAt: "2026-03-24",
      sessionName: "chain-HomepageReminder",
      sessionRunning: false,
      queued: true,
      queueIndex: 1,
      riskCount: { critical: 0, warning: 1 },
      mapPath: "Maps/HomepageReminder.md",
      blocked: true
    }
  ],
  registry: [
    {
      id: "ChargeStatistical",
      nameZh: "合同收费统计",
      priorityWave: "P2",
      sequence: 30,
      enabled: true
    },
    {
      id: "HomepageReminder",
      nameZh: "首页合同到期提醒",
      priorityWave: "P1",
      sequence: 40,
      enabled: true
    }
  ],
  notifications: [],
  actionEvents: [],
  workItems: {
    ChargeStatistical: {
      mode: "active",
      currentTask: "收敛统计口径、权限边界与真实代码入口",
      recoverable: true,
      updatedAt: "2026-03-31 11:00",
      expectedOutput: "输出统计维度、权限边界和候选代码入口",
      allowedActions: ["恢复上下文", "定位代码入口", "影响分析"],
      forbiddenActions: ["直接实现统计接口"],
      lastVerifiedAt: "2026-03-31 11:00",
      lastVerifiedBy: "main-control"
    },
    HomepageReminder: {
      mode: "blocked",
      currentTask: "保持阻塞并记录恢复条件",
      recoverable: false,
      updatedAt: "2026-03-31 10:00",
      expectedOutput: "输出阻塞原因与恢复条件",
      allowedActions: ["确认阻塞原因", "确认恢复条件"],
      forbiddenActions: ["实现", "测试验证"],
      lastVerifiedAt: "2026-03-31 10:00",
      lastVerifiedBy: "main-control"
    }
  },
  reviewPaths: [],
  health: {
    ok: true,
    checks: {
      chainRegistry: { readable: true },
      chainStatus: { readable: true },
      dispatchQueue: { readable: true },
      schedulerState: { readable: true },
      chineseNames: { readable: true },
      notifications: { readable: true },
      maps: { readable: true },
      reviews: { readable: true },
      tmux: { readable: true },
      watcherPid: { readable: true },
      watcherLog: { readable: true }
    },
    schedulerStatus: "running",
    watcherPid: 34314,
    activeSessions: ["chain-ChargeStatistical", "chain-EmployeePerformance", "chain-OldDataUpgrade"],
    lastActionSummary: "2026-03-28 13:59 当前有效并发: 3/3"
  }
};

test("chat returns direct answer for harmless overview question", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "qa",
    target: "auto",
    message: "现在全局状态怎么样？",
    context: { page: "overview", selectedChainId: null }
  });

  assert.equal(response.kind, "answer");
  assert.equal(response.proposal, null);
  assert.equal(response.resolvedTarget.targetType, null);
  assert.match(response.response, /当前波次/u);
  assert.match(response.response, /并发 3\/3/u);
});

test("chat returns action proposal for scheduler mutation requests", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "scheduler",
    target: "auto",
    message: "帮我重新同步队列",
    context: { page: "scheduler", selectedChainId: null }
  });

  assert.equal(response.kind, "proposal");
  assert.equal(response.proposal?.proposalKind, "action");
  assert.equal(response.proposal?.actionType, "resync_queue");
  assert.equal(response.proposal?.riskLevel, "controlled");
});

test("chat returns dispatch proposal for current chain delegation", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "delegate",
    target: "current-chain",
    message: "请继续推进并先收敛最小改动方案",
    context: { page: "chain-detail", selectedChainId: "ChargeStatistical" }
  });

  assert.equal(response.kind, "proposal");
  assert.equal(response.proposal?.proposalKind, "dispatch");
  assert.equal(typeof response.proposal?.proposalId, "string");
  assert.equal(response.proposal?.targetId, "ChargeStatistical");
  assert.equal(response.proposal?.sessionName, "chain-newfee-ChargeStatistical");
  assert.match(response.proposal?.summary ?? "", /当前 work-item：模式 active/u);
  assert.match(response.proposal?.summary ?? "", /收敛统计口径、权限边界与真实代码入口/u);
});

test("chat includes work-item summary for selected chain answers", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "qa",
    target: "auto",
    message: "这条链现在应该做什么？",
    context: { page: "chain-detail", selectedChainId: "ChargeStatistical" }
  });

  assert.equal(response.kind, "answer");
  assert.match(response.response, /当前 work-item：模式 active/u);
  assert.match(response.response, /当前任务 收敛统计口径、权限边界与真实代码入口/u);
  assert.match(response.response, /可恢复/u);
});

test("dispatch sends harmless message to tmux target", async () => {
  const execCalls: Array<{ file: string; args: string[] }> = [];
  const bridge = createAiBridge({
    loadState: async () => baseState,
    execFile: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: "", stderr: "" };
    },
    appendEvent: async () => "action:ai_dispatch:2026-03-28 14:20",
    now: () => new Date("2026-03-28T14:20:00Z")
  });

  const proposal = await bridge.chat({
    mode: "delegate",
    target: "main-control",
    message: "请主控记录这是一条 harmless ping。",
    context: { page: "overview", selectedChainId: null }
  });

  const response = await bridge.dispatch({
    proposalId: proposal.proposal?.proposalId ?? ""
  });

  assert.equal(response.success, true);
  assert.equal(response.sessionName, "main-control");
  assert.equal(response.eventId, "action:ai_dispatch:2026-03-28 14:20");
  assert.deepEqual(execCalls, [
    {
      file: "tmux",
      args: ["send-keys", "-t", "main-control", "[AI Dock][page=overview][mode=delegate] 用户请求：请主控记录这是一条 harmless ping。\n当前波次 P2，调度器 running。", "Enter"]
    }
  ]);
});

test("chat includes selected chain work-item summary when delegating to main-control from chain detail", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "delegate",
    target: "main-control",
    message: "请主控接手并帮我判断下一步",
    context: { page: "chain-detail", selectedChainId: "ChargeStatistical" }
  });

  assert.equal(response.kind, "proposal");
  assert.match(response.proposal?.summary ?? "", /链上下文：合同收费统计当前处于 S1 需求收敛阶段/u);
  assert.match(response.proposal?.summary ?? "", /当前 work-item：模式 active/u);
  assert.match(response.proposal?.summary ?? "", /收敛统计口径、权限边界与真实代码入口/u);
});

test("dispatch rejects unknown proposal ids", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  await assert.rejects(
    () => bridge.dispatch({ proposalId: "missing-proposal" }),
    { message: "Unknown or expired AI proposal: missing-proposal" }
  );
});

test("delegate mode refuses shell-like messages as dispatch proposals", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "delegate",
    target: "main-control",
    message: "ls -la",
    context: { page: "overview", selectedChainId: null }
  });

  assert.equal(response.kind, "answer");
  assert.equal(response.proposal, null);
  assert.match(response.response, /终端工作流/u);
});

test("specific-chain target rejects unknown chain ids", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  await assert.rejects(
    () => bridge.chat({
      mode: "delegate",
      target: "specific-chain",
      targetChainId: "FakeChain" as ChainId,
      message: "请继续推进",
      context: { page: "overview", selectedChainId: null }
    }),
    { message: "Unknown chain target: FakeChain" }
  );
});

test("scheduler mode also refuses shell-like messages even with explicit target", async () => {
  const bridge = createAiBridge({
    loadState: async () => baseState
  });

  const response = await bridge.chat({
    mode: "scheduler",
    target: "main-control",
    message: "curl https://example.com",
    context: { page: "scheduler", selectedChainId: null }
  });

  assert.equal(response.kind, "answer");
  assert.equal(response.proposal, null);
  assert.match(response.response, /终端工作流/u);
});

test("chat does not execute side effects while only generating proposals", async () => {
  let execCalled = false;
  const bridge = createAiBridge({
    loadState: async () => baseState,
    execFile: async () => {
      execCalled = true;
      return { stdout: "", stderr: "" };
    }
  });

  const response = await bridge.chat({
    mode: "scheduler",
    target: "auto",
    message: "帮我重新同步队列",
    context: { page: "scheduler", selectedChainId: null }
  });

  assert.equal(response.kind, "proposal");
  assert.equal(execCalled, false);
});

test("delegate chat also does not execute side effects while only generating proposals", async () => {
  let execCalled = false;
  const bridge = createAiBridge({
    loadState: async () => baseState,
    execFile: async () => {
      execCalled = true;
      return { stdout: "", stderr: "" };
    }
  });

  const response = await bridge.chat({
    mode: "delegate",
    target: "current-chain",
    message: "请继续推进并先收敛最小改动方案",
    context: { page: "chain-detail", selectedChainId: "ChargeStatistical" }
  });

  assert.equal(response.kind, "proposal");
  assert.equal(execCalled, false);
});
