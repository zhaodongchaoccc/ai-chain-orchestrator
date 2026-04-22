import assert from "node:assert/strict";
import test from "node:test";

import type { LoadedControlPlaneSources } from "./state-loader";

import { buildPreflightSummary } from "./preflight";

function baseSources(): LoadedControlPlaneSources {
  return {
    workspace: {
      sourceId: "testall",
      legacyRoot: false
    },
    registry: [
      { id: "ChargeStatistical", nameZh: "合同收费统计", priorityWave: "P1", sequence: 10, enabled: true },
      { id: "EmployeePerformance", nameZh: "员工绩效", priorityWave: "P1", sequence: 20, enabled: true },
      { id: "HomepageReminder", nameZh: "首页合同到期提醒", priorityWave: "P1", sequence: 30, enabled: true }
    ],
    chainStatus: {
      ChargeStatistical: { stage: "S1", updatedAt: "2026-04-01 09:00", summary: "active" },
      EmployeePerformance: { stage: "PENDING", updatedAt: "2026-04-01 09:00", summary: "queued" },
      HomepageReminder: { stage: "S1", updatedAt: "2026-04-01 09:00", summary: "blocked", blocked: true }
    },
    queue: {
      maxConcurrent: 2,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-04-01 09:00"
    },
    schedulerFile: {
      desiredState: "running",
      updatedAt: "2026-04-01 09:00",
      updatedBy: "resume-scheduler.sh"
    },
    chineseNames: {
      ChargeStatistical: "合同收费统计",
      EmployeePerformance: "员工绩效",
      HomepageReminder: "首页合同到期提醒"
    },
    tmuxSessions: ["chain-testall-ChargeStatistical"],
    watcherPid: 1234,
    watcherLogSummary: "2026-04-01 09:00 当前有效并发: 1/2",
    notifications: [],
    actionEvents: [],
    mainControlResume: {
      generatedAt: "2026-04-01-0900",
      handoffPath: "Projects/飞枢系统/Sessions/2026-04-01-0900-main-control-handoff.md",
      running: ["ChargeStatistical"],
      pending: ["EmployeePerformance"],
      blocked: ["HomepageReminder"],
      rollback: [],
      completedKept: [],
      queue: { pendingStart: [], nextCandidate: null, updatedAt: "2026-04-01 09:00" },
      trackedChains: {},
      workItems: {},
      delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
    },
    chainResumePackets: {
      EmployeePerformance: {
        generatedAt: "2026-04-01-0900",
        chainId: "EmployeePerformance",
        stage: "PENDING",
        summary: "queued",
        mode: "hold",
        currentTask: "保持挂起，等待恢复信号",
        recoverable: false,
        queued: false,
        sessionRunning: false,
        blocked: false,
        rollback: false,
        paths: {
          map: "Projects/飞枢系统/Maps/EmployeePerformance.md",
          codeList: "Projects/飞枢系统/CodeLists/EmployeePerformance.md",
          workItem: "Projects/飞枢系统/share/work-items/EmployeePerformance.json"
        },
        delta: {
          stageChanged: false,
          modeChanged: false,
          taskChanged: false,
          summaryChanged: false,
          queuedChanged: false,
          sessionRunningChanged: false
        }
      }
    },
    workItems: {
      ChargeStatistical: {
        mode: "active",
        currentTask: "继续当前唯一任务",
        recoverable: true,
        updatedAt: "2026-04-01 09:00",
        expectedOutput: "输出当前阶段、守门结论、当前风险和唯一下一步",
        allowedActions: ["恢复上下文"],
        forbiddenActions: [],
        lastVerifiedAt: "2026-04-01 09:00",
        lastVerifiedBy: "main-control"
      },
      EmployeePerformance: {
        mode: "hold",
        currentTask: "保持挂起，等待恢复信号",
        recoverable: false,
        updatedAt: "2026-04-01 09:00",
        expectedOutput: "输出当前阶段、当前风险和继续挂起的判断",
        allowedActions: ["恢复上下文"],
        forbiddenActions: ["实现"],
        lastVerifiedAt: "2026-04-01 09:00",
        lastVerifiedBy: "main-control"
      },
      HomepageReminder: {
        mode: "blocked",
        currentTask: "确认阻塞原因与恢复条件",
        recoverable: false,
        updatedAt: "2026-04-01 09:00",
        expectedOutput: "输出阻塞原因、恢复条件和下一次检查点",
        allowedActions: ["确认阻塞原因"],
        forbiddenActions: ["实现"],
        lastVerifiedAt: "2026-04-01 09:00",
        lastVerifiedBy: "main-control"
      }
    },
    mapPaths: [],
    mapStages: {},
    reviewPaths: [],
    manualSessionHolds: {},
    healthChecks: {
      chainRegistry: { readable: true },
      chainStatus: { readable: true },
      dispatchQueue: { readable: true },
      schedulerState: { readable: true },
      chineseNames: { readable: true },
      workItems: { readable: true },
      notifications: { readable: true },
      maps: { readable: true },
      reviews: { readable: true },
      tmux: { readable: true },
      watcherPid: { readable: true },
      watcherLog: { readable: true }
    },
    watcherAlive: true
  };
}

test("buildPreflightSummary returns fresh when truth and projections align", () => {
  const result = buildPreflightSummary(baseSources(), {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.blockingActionTypes, []);
});

test("buildPreflightSummary flags queue drift as needs_resync", () => {
  const sources = baseSources();
  sources.queue.pendingStart = ["EmployeePerformance"];
  sources.queue.nextCandidate = "EmployeePerformance";

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "needs_resync");
  assert.equal(result.issues[0]?.code, "queue_out_of_sync");
  assert.ok(result.recommendedActions.includes("resync_queue"));
});

test("buildPreflightSummary ignores legacy work-item modes when truth is consistent", () => {
  const sources = baseSources();
  sources.workItems.EmployeePerformance.mode = "active";

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
  assert.equal(result.issues.find((issue) => issue.code === "work_item_mode_conflict"), undefined);
  assert.deepEqual(result.blockingActionTypes, []);
});

test("buildPreflightSummary treats running pending chains as active", () => {
  const sources = baseSources();
  sources.registry.push({ id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true } as any);
  sources.chainStatus.Defect = { stage: "PENDING", updatedAt: "2026-04-01 09:00", summary: "waiting" };
  sources.workItems.Defect = {
    mode: "active",
    currentTask: "处理已认领缺陷",
    recoverable: true,
    updatedAt: "2026-04-01 09:00",
    expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
    allowedActions: ["恢复上下文"],
    forbiddenActions: [],
    lastVerifiedAt: "2026-04-01 09:00",
    lastVerifiedBy: "main-control"
  };
  sources.tmuxSessions.push("chain-testall-Defect");

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
  assert.equal(result.issues.some((issue) => issue.chainId === "Defect"), false);
});

test("buildPreflightSummary keeps queued S1 chains active", () => {
  const sources = baseSources();
  sources.queue.pendingStart = ["EmployeePerformance"];
  sources.queue.nextCandidate = "EmployeePerformance";
  sources.chainStatus.EmployeePerformance.stage = "S1" as any;
  sources.workItems.EmployeePerformance.mode = "active";
  sources.workItems.EmployeePerformance.currentTask = "继续当前唯一任务";
  sources.workItems.EmployeePerformance.recoverable = true;
  sources.mainControlResume.trackedChains.EmployeePerformance = {
    chainId: "EmployeePerformance",
    stage: "S1",
    summary: "queued",
    mode: "active",
    currentTask: "继续当前唯一任务",
    recoverable: true,
    queued: true,
    sessionRunning: false,
    blocked: false,
    rollback: false
  } as any;
  sources.chainResumePackets.EmployeePerformance = {
    ...sources.chainResumePackets.EmployeePerformance,
    stage: "S1",
    mode: "active",
    currentTask: "继续当前唯一任务",
    recoverable: true,
    queued: true
  };

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
  assert.equal(result.issues.some((issue) => issue.chainId === "EmployeePerformance"), false);
});

test("buildPreflightSummary flags stale watcher runtime without blocking actions", () => {
  const sources = baseSources();
  sources.watcherAlive = false;

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "stale");
  assert.equal(result.issues[0]?.code, "watcher_runtime_stale");
  assert.deepEqual(result.blockingActionTypes, []);
});

test("buildPreflightSummary flags stale main-control resume packet", () => {
  const sources = baseSources();
  sources.queue.updatedAt = "2026-04-01 10:00";

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T10:05:00Z")
  });

  assert.equal(result.state, "stale");
  assert.equal(result.issues[0]?.code, "main_control_resume_stale");
  assert.ok(result.recommendedActions.includes("handoff_main_control"));
});

test("buildPreflightSummary flags stale chain resume packet", () => {
  const sources = baseSources();
  sources.chainStatus.EmployeePerformance.updatedAt = "2026-04-01 10:00";

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T10:05:00Z")
  });

  assert.equal(result.state, "stale");
  assert.ok(result.issues.some((issue) => issue.code === "chain_resume_stale" && issue.chainId === "EmployeePerformance"));
});

test("buildPreflightSummary treats rollback chains as already removed from queue truth", () => {
  const sources = baseSources();
  sources.chainStatus.EmployeePerformance.stage = "ROLLBACK" as any;
  sources.workItems.EmployeePerformance.mode = "escalate";
  sources.workItems.EmployeePerformance.currentTask = "交回主控裁决当前动作";
  sources.workItems.EmployeePerformance.recoverable = false;
  sources.mainControlResume.trackedChains.EmployeePerformance = {
    chainId: "EmployeePerformance",
    stage: "ROLLBACK" as any,
    summary: "queued",
    mode: "escalate",
    currentTask: "交回主控裁决当前动作",
    recoverable: false,
    queued: false,
    sessionRunning: false,
    blocked: false,
    rollback: true
  };
  sources.chainResumePackets.EmployeePerformance.mode = "escalate";
  sources.chainResumePackets.EmployeePerformance.currentTask = "交回主控裁决当前动作";
  sources.chainResumePackets.EmployeePerformance.rollback = true;

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
});

test("buildPreflightSummary ignores unrelated chain resume packets outside current workspace registry", () => {
  const sources = baseSources();
  sources.chainResumePackets.OperationLogTracking = {
    generatedAt: "2026-03-20-0900",
    chainId: "OperationLogTracking" as any,
    stage: "S1",
    summary: "other workspace chain",
    mode: "hold",
    currentTask: "来自别的需求源的恢复包",
    recoverable: false,
    queued: false,
    sessionRunning: false,
    blocked: false,
    rollback: false,
    paths: {
      map: "Projects/飞枢系统/Maps/other/OperationLogTracking.md",
      codeList: "Projects/飞枢系统/CodeLists/other/OperationLogTracking.md",
      workItem: "Projects/飞枢系统/share/sources/other/work-items/OperationLogTracking.json"
    },
    delta: {
      stageChanged: false,
      modeChanged: false,
      taskChanged: false,
      summaryChanged: false,
      queuedChanged: false,
      sessionRunningChanged: false
    }
  } as any;

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
  assert.ok(result.issues.every((issue) => issue.chainId !== ("OperationLogTracking" as any)));
});

test("buildPreflightSummary ignores unrelated work-items outside current workspace registry", () => {
  const sources = baseSources();
  sources.workItems.OperationLogTracking = {
    mode: "active",
    currentTask: "孤儿 work-item",
    recoverable: true,
    updatedAt: "2026-04-01 09:00",
    expectedOutput: "无",
    allowedActions: [],
    forbiddenActions: [],
    lastVerifiedAt: "2026-04-01 09:00",
    lastVerifiedBy: "main-control"
  } as any;

  const result = buildPreflightSummary(sources, {
    now: () => new Date("2026-04-01T09:05:00Z")
  });

  assert.equal(result.state, "fresh");
  assert.ok(result.issues.every((issue) => issue.chainId !== ("OperationLogTracking" as any)));
});
