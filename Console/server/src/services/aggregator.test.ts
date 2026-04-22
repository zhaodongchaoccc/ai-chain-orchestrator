import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadControlPlaneSources } from "./state-loader";
import { aggregateControlPlaneState } from "./aggregator";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

async function makeProjectFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-console-server-"));
  const shareRoot = path.join(projectRoot, "share");
  const workItemsRoot = path.join(shareRoot, "work-items");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const mapsRoot = path.join(projectRoot, "Maps");
  const reviewsRoot = path.join(projectRoot, "Reviews");
  const notificationsRoot = path.join(projectRoot, "notifications");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(workItemsRoot, { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(mapsRoot, { recursive: true }),
    mkdir(reviewsRoot, { recursive: true }),
    mkdir(notificationsRoot, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(shareRoot, "chain-registry.json"), [
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
      }
    ]),
    writeJson(path.join(shareRoot, "chain-status.json"), {
      ContractAddAndFee: {
        stage: "S5",
        updatedAt: "2026-03-25",
        summary: "done"
      },
      OperationLogTracking: {
        stage: "S2",
        updatedAt: "2026-03-26",
        summary: "working",
        blocked: true
      }
    }),
    writeJson(path.join(shareRoot, "dispatch-queue.json"), {
      maxConcurrent: 2,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: "2026-03-26 11:00"
    }),
    writeJson(path.join(shareRoot, "scheduler-state.json"), {
      desiredState: "running",
      updatedAt: "2026-03-26 11:00",
      updatedBy: "resume-scheduler.sh"
    }),
    writeFile(
      path.join(shareRoot, "action-events.jsonl"),
      JSON.stringify({
        id: "action:generate_fee_api_docs:2026-03-26 11:05",
        type: "action_executed",
        timestamp: "2026-03-26 11:05",
        chainId: null,
        level: "info",
        title: "已生成收费联调接口文档",
        summary: "已生成 5 个接口文档，纳入 4 条链。",
        source: "action",
        relatedPath: "03-业务链资产/接口文档",
        relatedSession: null,
        actionable: false,
        actionType: "generate_fee_api_docs",
        outputDir: "03-业务链资产/接口文档",
        generatedFiles: ["收费业务链联调总览.md"],
        includedChainIds: ["ContractAddAndFee"]
      }) + "\n"
    ),
    writeJson(path.join(shareRoot, "chinese-chain-names.json"), {
      ContractAddAndFee: "合同创建并收费",
      OperationLogTracking: "操作日志记录"
    }),
    writeJson(path.join(shareRoot, "work-items", "OperationLogTracking.json"), {
      chainId: "OperationLogTracking",
      mode: "blocked",
      currentTask: "保持阻塞并记录恢复条件",
      expectedOutput: "输出阻塞原因与恢复条件",
      allowedActions: ["确认阻塞原因", "确认恢复条件"],
      forbiddenActions: ["实现", "测试验证"],
      lastVerifiedAt: "2026-03-26 11:00",
      updatedAt: "2026-03-26 11:00"
    }),
    writeFile(path.join(playbooksRoot, "dispatch-watcher.pid"), "1234\n"),
    writeFile(
      path.join(playbooksRoot, "dispatch-watcher.log"),
      "[2026-03-26 11:01] 当前有效并发: 1/2\n[2026-03-26 11:02] 启动链 session: chain-OperationLogTracking"
    ),
    writeFile(path.join(mapsRoot, "ContractAddAndFee.md"), "# ContractAddAndFee\n\n## 当前阶段状态\n- S5 阶段：完整交付\n"),
    writeFile(path.join(mapsRoot, "OperationLogTracking.md"), "# OperationLogTracking\n"),
    writeFile(path.join(reviewsRoot, "Wave1-P0.md"), "# Wave1 - P0\n"),
    writeFile(
      path.join(notificationsRoot, "20260326-1103-OperationLogTracking.md"),
      "---\n"
        + "chain: OperationLogTracking\n"
        + "stage: S2\n"
        + "updatedAt: 2026-03-26 11:03\n"
        + "summary: OperationLogTracking is blocked.\n"
        + "action: 请主控检查当前阻塞状态\n"
        + "---\n"
    )
  ]);

  return {
    projectRoot,
    shareRoot,
    playbooksRoot,
    mapsRoot,
    reviewsRoot,
    notificationsRoot
  };
}

test("aggregateControlPlaneState builds overview, chains, queue, and health", async () => {
  const fixture = await makeProjectFixture();
  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking", "notes"],
      isProcessAlive: async () => true
    }
  );

  const state = aggregateControlPlaneState(sources);

  assert.equal(state.overview.totalChains, 2);
  assert.equal(state.overview.completedChains, 1);
  assert.equal(state.overview.activeChains, 1);
  assert.equal(state.overview.pendingChains, 0);
  assert.equal(state.overview.currentWave, "P1");
  assert.equal(state.overview.schedulerStatus, "running");
  assert.equal(state.scheduler.pid, 1234);
  assert.equal(state.scheduler.lastActionSummary, "2026-03-26 11:02 启动链 session: chain-OperationLogTracking");
  assert.deepEqual(state.scheduler.activeSessions, ["chain-OperationLogTracking"]);
  assert.equal(state.waveSummary.reviewPath, null);
  assert.equal(state.queue.nextCandidate, null);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.actionEvents?.length, 1);
  assert.equal(state.actionEvents?.[0]?.type, "action_executed");
  assert.equal(state.notifications[0]?.targetId, "OperationLogTracking");
  assert.equal(state.notifications[0]?.timestamp, "2026-03-26 11:03");
  assert.equal(state.notifications[0]?.summary, "OperationLogTracking is blocked.");
  assert.equal(state.chains[1]?.queued, false);
  assert.equal(state.chains[1]?.blocked, true);
  assert.equal(state.chains[1]?.sessionRunning, true);
  assert.equal(state.chains[1]?.workItemMode, "blocked");
  assert.equal(state.chains[1]?.workItemTask, "保持阻塞并记录恢复条件");
  assert.equal(state.chains[1]?.workItemRecoverable, false);
  assert.equal(state.preflight.state, "fresh");
  assert.equal(state.health.preflight?.state, "fresh");
  assert.equal(state.health.ok, true);
  assert.equal(state.health.checks.tmux.readable, true);
  assert.equal(state.health.checks.watcherPid.readable, true);
});

test("aggregateControlPlaneState surfaces queue mismatches as needs_resync", async () => {
  const fixture = await makeProjectFixture();
  await writeJson(path.join(fixture.shareRoot, "dispatch-queue.json"), {
    maxConcurrent: 2,
    pendingStart: ["ContractAddAndFee"],
    nextCandidate: "ContractAddAndFee",
    updatedAt: "2026-03-26 11:00"
  });

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      isProcessAlive: async () => true
    }
  );

  const state = aggregateControlPlaneState(sources);

  assert.equal(state.preflight.state, "needs_resync");
  assert.equal(state.preflight.issues[0]?.code, "queue_out_of_sync");
  assert.ok(state.preflight.recommendedActions.includes("resync_queue"));
});

test("aggregateControlPlaneState ignores legacy work-item modes when building health", async () => {
  const fixture = await makeProjectFixture();
  await writeJson(path.join(fixture.shareRoot, "work-items", "OperationLogTracking.json"), {
    chainId: "OperationLogTracking",
    mode: "active",
    currentTask: "继续当前唯一任务",
    expectedOutput: "输出当前阶段",
    allowedActions: ["实现"],
    forbiddenActions: [],
    lastVerifiedAt: "2026-03-26 11:00",
    updatedAt: "2026-03-26 11:00"
  });

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      isProcessAlive: async () => true
    }
  );

  const state = aggregateControlPlaneState(sources);

  assert.equal(state.preflight.state, "fresh");
  assert.equal(state.preflight.issues.find((issue) => issue.code === "work_item_mode_conflict"), undefined);
  assert.equal(state.health.ok, true);
});

test("loadControlPlaneSources degrades gracefully when optional data is missing or malformed", async () => {
  const fixture = await makeProjectFixture();

  await writeFile(path.join(fixture.shareRoot, "dispatch-queue.json"), "not json");

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: path.join(fixture.projectRoot, "missing-notifications")
    },
    {
      listTmuxSessions: async () => {
        throw new Error("tmux unavailable");
      }
    }
  );

  const state = aggregateControlPlaneState(sources);

  assert.deepEqual(state.queue.pendingStart, []);
  assert.equal(state.health.ok, false);
  assert.equal(state.health.checks.dispatchQueue.readable, false);
  assert.equal(state.health.checks.notifications.readable, false);
  assert.equal(state.health.checks.tmux.readable, false);
  assert.equal(state.notifications.length, 0);
});

test("aggregateControlPlaneState marks scheduler-down state unhealthy", async () => {
  const fixture = await makeProjectFixture();
  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => [],
      isProcessAlive: async () => true
    }
  );

  sources.schedulerFile = {
    desiredState: "running",
    updatedAt: "2026-03-26 11:00",
    updatedBy: "resume-scheduler.sh"
  };
  sources.watcherPid = null;

  const state = aggregateControlPlaneState(sources);

  assert.equal(state.scheduler.status, "stopped");
  assert.equal(state.overview.mainControlHealth, "abnormal");
  assert.equal(state.health.ok, false);
});

test("aggregateControlPlaneState keeps scoped workspace healthy from source runtime state", () => {
  const state = aggregateControlPlaneState({
    workspace: {
      sourceId: "newfee",
      legacyRoot: false
    },
    registry: [
      { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
    ],
    chainStatus: {
      Defect: { stage: "PENDING", updatedAt: null, summary: "waiting" }
    },
    queue: {
      maxConcurrent: 3,
      pendingStart: [],
      nextCandidate: null,
      updatedAt: null
    },
    schedulerFile: {
      desiredState: "paused",
      updatedAt: null,
      updatedBy: null
    },
    chineseNames: {
      Defect: "缺陷处理"
    },
    tmuxSessions: ["chain-newfee-Defect"],
    watcherPid: null,
    watcherLogSummary: null,
    notifications: [],
    actionEvents: [],
    mainControlResume: null,
    chainResumePackets: {},
    workItems: {
      Defect: {
        mode: "active",
        currentTask: "处理已认领缺陷",
        recoverable: true,
        updatedAt: "2026-04-07 11:42:08",
        expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
        allowedActions: ["恢复上下文"],
        forbiddenActions: [],
        lastVerifiedAt: "2026-04-07 11:42:08",
        lastVerifiedBy: "main-control-newfee"
      }
    },
    defectItems: {
      Defect: []
    },
    mapPaths: [],
    mapStages: {},
    reviewPaths: [],
    manualSessionHolds: {},
    sourceRuntimeState: {
      sourceId: "newfee",
      runtimeState: "running",
      lastActiveAt: "2026-04-07 11:42:08",
      pinned: false
    },
    sourcePolicy: null,
    controlInboxItems: [],
    orchestrationState: null,
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
    watcherAlive: null
  } as any);

  assert.equal(state.scheduler.status, "running");
  assert.equal(state.overview.mainControlHealth, "healthy");
  assert.equal(state.health.ok, true);
});

test("aggregateControlPlaneState marks unreadable work-items unhealthy", async () => {
  const fixture = await makeProjectFixture();

  await writeFile(path.join(fixture.shareRoot, "work-items", "OperationLogTracking.json"), "not json");

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      isProcessAlive: async () => true
    }
  );

  const state = aggregateControlPlaneState(sources);

  assert.equal(state.health.checks.workItems?.readable, false);
  assert.equal(state.health.ok, false);
});

test("loadControlPlaneSources parses map stages and watcher liveness", async () => {
  const fixture = await makeProjectFixture();

  const sources = await loadControlPlaneSources(
    {
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      actionEventsPath: path.join(fixture.shareRoot, "action-events.jsonl"),
      playbooksRoot: fixture.playbooksRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      notificationsRoot: fixture.notificationsRoot
    },
    {
      listTmuxSessions: async () => ["chain-OperationLogTracking"],
      isProcessAlive: async () => false
    }
  );

  assert.equal(sources.mapStages.ContractAddAndFee, "S5");
  assert.equal(sources.mapStages.OperationLogTracking, null);
  assert.equal(sources.watcherAlive, false);
});
