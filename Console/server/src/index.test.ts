import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ffPaths, resolveProjectRoot } from "./config";
import { buildServer } from "./index";
import { DemandSourceManifestError } from "./services/demand-source-manifest";

test("GET /health returns ok true", async () => {
  const server = buildServer({
    loadState: async () => ({
      health: {
        ok: true,
        preflight: {
          state: "fresh",
          checkedAt: "2026-04-01 09:05",
          issues: [],
          blockingActionTypes: [],
          recommendedActions: []
        }
      }
    }) as any
  });

  const response = await server.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
});

test("GET /api/health returns ok true", async () => {
  const server = buildServer({
    loadState: async () => ({
      health: {
        ok: true,
        preflight: {
          state: "fresh",
          checkedAt: "2026-04-01 09:05",
          issues: [],
          blockingActionTypes: [],
          recommendedActions: []
        }
      }
    }) as any
  });

  const response = await server.inject({ method: "GET", url: "/api/health" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
});

test("GET /api/health includes preflight summary when available", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-04-01 09:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["chain-ChargeStatistical"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      chains: [],
      registry: [],
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      notifications: [],
      actionEvents: [],
      workItems: {},
      health: {
        ok: true,
        checks: {
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
        preflight: {
          state: "fresh",
          checkedAt: "2026-04-01 09:05",
          issues: [],
          blockingActionTypes: [],
          recommendedActions: []
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-01 09:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/health" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().preflight.state, "fresh");
});

test("GET /api/overview returns aggregated overview state", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 2,
        completedChains: 1,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: "2026-03-26 11:03",
        lastSummaryAt: "2026-03-26 11:02"
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-03-26 11:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["chain-OperationLogTracking"],
        lastActionSummary: "2026-03-26 11:02 启动链 session: chain-OperationLogTracking"
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: ["OperationLogTracking"],
        nextCandidate: "OperationLogTracking",
        updatedAt: "2026-03-26 11:00"
      },
      mainControlResume: {
        generatedAt: "2026-03-26-1100",
        handoffPath: "Projects/飞枢系统/Sessions/2026-03-26-1100-main-control-handoff.md",
        running: ["OperationLogTracking"],
        pending: [],
        blocked: [],
        rollback: [],
        completedKept: [],
        queue: {
          pendingStart: ["OperationLogTracking"],
          nextCandidate: "OperationLogTracking",
          updatedAt: "2026-03-26 11:00"
        },
        trackedChains: {},
        workItems: {},
        delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
      },
      chains: [],
      registry: [],
      notifications: [],
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
        }
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/overview" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().overview.currentWave, "P1");
  assert.equal(response.json().mainControlResume.generatedAt, "2026-03-26-1100");
});

test("GET /api/global/overview returns aggregated global overview state", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 2,
        completedChains: 1,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: "2026-03-26 11:03",
        lastSummaryAt: "2026-03-26 11:02"
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-03-26 11:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["chain-newfee-OperationLogTracking"],
        lastActionSummary: "2026-03-26 11:02 启动链 session: chain-newfee-OperationLogTracking"
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: ["OperationLogTracking"],
        nextCandidate: "OperationLogTracking",
        updatedAt: "2026-03-26 11:00"
      },
      mainControlResume: {
        generatedAt: "2026-03-26-1100",
        handoffPath: "Projects/飞枢系统/Sessions/sources/newfee/2026-03-26-1100-main-control-handoff.md",
        running: ["OperationLogTracking"],
        pending: [],
        blocked: [],
        rollback: [],
        completedKept: [],
        queue: {
          pendingStart: ["OperationLogTracking"],
          nextCandidate: "OperationLogTracking",
          updatedAt: "2026-03-26 11:00"
        },
        trackedChains: {},
        workItems: {},
        delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
      },
      chains: [],
      registry: [],
      notifications: [],
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
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-03-26 11:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/global/overview" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().overview.currentWave, "P1");
  assert.equal(response.json().mainControlResume.generatedAt, "2026-03-26-1100");
});

test("GET /api/global/health returns aggregated global health state", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-04-01 09:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["chain-newfee-ChargeStatistical"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      chains: [],
      registry: [],
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      notifications: [],
      actionEvents: [],
      workItems: {},
      health: {
        ok: true,
        checks: {
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
        preflight: {
          state: "fresh",
          checkedAt: "2026-04-01 09:05",
          issues: [],
          blockingActionTypes: [],
          recommendedActions: []
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-01 09:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/global/health" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().preflight.state, "fresh");
});

test("GET /api/global/control returns aggregated global control payload", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-04-01 09:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["main-control"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: ["ChargeStatistical"],
        nextCandidate: "ChargeStatistical",
        updatedAt: "2026-04-01 09:00"
      },
      sourceRuntimeState: {
        sourceId: "newfee",
        runtimeState: "running",
        lastActiveAt: "2026-04-01T09:00:00Z",
        pinned: false
      },
      sourcePolicy: {
        autoSleep: true,
        idleSleepMinutes: 30,
        pinned: false,
        maxConcurrentChains: 3
      },
      controlInboxItems: [
        {
          eventId: "control:global:1",
          scopeFrom: "source",
          scopeTo: "global",
          sourceId: "testall",
          chainId: null,
          severity: "warning",
          reason: "需要全局主控裁决",
          requestedAction: "确认下一步",
          status: "open",
          createdAt: "2026-04-01 09:01:00",
          claimedBy: null,
          resolvedAt: null
        }
      ],
      notifications: [],
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
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-01 09:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      },
      chains: [],
      registry: [],
      mainControlResume: {
        generatedAt: "2026-04-01-0905",
        handoffPath: "Projects/飞枢系统/Sessions/sources/newfee/2026-04-01-0905-main-control-handoff.md",
        running: ["ChargeStatistical"],
        pending: [],
        blocked: [],
        rollback: [],
        completedKept: [],
        queue: { pendingStart: ["ChargeStatistical"], nextCandidate: "ChargeStatistical", updatedAt: "2026-04-01 09:00" },
        trackedChains: {},
        workItems: {},
        delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/global/control" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().queue.nextCandidate, "ChargeStatistical");
  assert.equal(response.json().mainControlResume.generatedAt, "2026-04-01-0905");
  assert.equal(response.json().preflight.state, "fresh");
  assert.equal(response.json().actions.handoff_main_control.enabled, true);
  assert.equal(response.json().actions.open_main_control_terminal.enabled, true);
  assert.equal(response.json().sourceRuntimeState.runtimeState, "running");
  assert.equal(response.json().sourcePolicy.idleSleepMinutes, 30);
  assert.equal(response.json().controlInboxItems[0].eventId, "control:global:1");
});

test("GET /api/meta returns api version and action capabilities", async () => {
  const server = buildServer();

  const response = await server.inject({ method: "GET", url: "/api/meta" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.apiVersion, "ff-console-api-v2");
  assert.equal(typeof payload.serverVersion, "string");
  assert.equal(typeof payload.startedAt, "string");
  assert.equal(typeof payload.pid, "number");
  assert.equal(payload.port, 8787);
  assert.equal(payload.manualSessionHoldMinutes, 60);
  assert.equal(payload.capabilities.actions.start_chain_session.supported, true);
  assert.equal(payload.capabilities.actions.pause_scheduler.requiresConfirmation, true);
});

test("GET /api/workspaces returns available demand sources", async () => {
  const server = buildServer({
    listWorkspaces: async () => ([
      {
        sourceId: "newfee",
        label: "newfee",
        kind: "combined",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/newfee.md",
        legacyRoot: true,
        draftIncomplete: false
      },
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: true
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().workspaces[1].sourceId, "req-b");
  assert.equal(response.json().workspaces[1].draftIncomplete, true);
});

test("POST /api/workspaces creates a new demand source from demand name", async () => {
  const server = buildServer({
    createDemandSource: async (demandName) => {
      assert.equal(demandName, "B");
      return {
        locatedDoc: {
          filePath: "/tmp/B.md",
          relativePath: "Projects/飞枢系统/B.md"
        },
        parsed: {
          demandName: "B",
          relativePath: "Projects/飞枢系统/B.md",
          title: "测试 B 需求源创建流程",
          background: "背景",
          expectedResult: "结果",
          constraints: "约束",
          kind: "single",
          missingFields: [],
          draftIncomplete: false
        },
        workspace: {
          sourceId: "b",
          label: "B",
          kind: "single",
          enabled: true,
          sourceDocPath: "Projects/飞枢系统/B.md",
          legacyRoot: false,
          draftIncomplete: false
        },
        entryDocPath: "/tmp/10-需求源入口（B）.md"
      };
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: {
      demandName: "B"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().workspace.sourceId, "b");
  assert.equal(response.json().suggestedOverviewPath, "/ws/b/overview");
});

test("POST /api/workspaces returns 404 when demand source doc is missing", async () => {
  const server = buildServer({
    createDemandSource: async () => {
      throw new DemandSourceManifestError(404, "未找到需求源文件：不存在的需求。请先创建 `Projects/飞枢系统/不存在的需求.md`（或 `Projects/飞枢系统/05-需求与模板/不存在的需求.md`），再点击“新建需求源”。");
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/workspaces",
    payload: {
      demandName: "不存在的需求"
    }
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().message, "未找到需求源文件：不存在的需求。请先创建 `Projects/飞枢系统/不存在的需求.md`（或 `Projects/飞枢系统/05-需求与模板/不存在的需求.md`），再点击“新建需求源”。");
});

test("GET /api/workspaces/:sourceId/overview returns source-scoped overview", async () => {
  const server = buildServer({
    loadStateForSource: async (sourceId) => ({
      overview: {
        currentWave: sourceId === "req-b" ? "P2" : "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: sourceId === "req-b" ? "P2" : "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      mainControlResume: {
        generatedAt: "2026-04-01-1200",
        handoffPath: "Projects/飞枢系统/Sessions/2026-04-01-1200-main-control-handoff.md",
        running: [],
        pending: [],
        blocked: [],
        rollback: [],
        completedKept: [],
        queue: { pendingStart: [], nextCandidate: null, updatedAt: null },
        trackedChains: {},
        workItems: {},
        delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
      },
      chains: [],
      registry: [],
      notifications: [],
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
        }
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "newfee",
        label: "newfee",
        kind: "combined",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/newfee.md",
        legacyRoot: true,
        draftIncomplete: false
      },
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/req-b/overview" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().overview.currentWave, "P2");
  assert.equal(response.json().mainControlResume.generatedAt, "2026-04-01-1200");
});

test("GET /api/workspaces/:sourceId/control returns source main-control payload", async () => {
  const server = buildServer({
    loadStateForSource: async (sourceId) => ({
      workspace: {
        sourceId,
        legacyRoot: false
      },
      overview: {
        currentWave: sourceId === "req-b" ? "P2" : "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: ["main-control-req-b"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: sourceId === "req-b" ? "P2" : "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      sourceRuntimeState: {
        sourceId: "req-b",
        runtimeState: "sleeping",
        lastActiveAt: "2026-04-03T11:20:00Z",
        pinned: true
      },
      sourcePolicy: {
        autoSleep: true,
        idleSleepMinutes: 45,
        pinned: true,
        maxConcurrentChains: 2
      },
      controlInboxItems: [
        {
          eventId: "control:req-b:1",
          scopeFrom: "chain",
          scopeTo: "source",
          sourceId: "req-b",
          chainId: "HomepageReminder",
          severity: "critical",
          reason: "需要需求主控裁决",
          requestedAction: "人工确认",
          status: "claimed",
          createdAt: "2026-04-03 11:30:00",
          claimedBy: "main-control-req-b",
          resolvedAt: null
        }
      ],
      mainControlResume: {
        generatedAt: "2026-04-03-1200",
        handoffPath: "Projects/飞枢系统/Sessions/sources/req-b/2026-04-03-1200-main-control-handoff.md",
        running: [],
        pending: [],
        blocked: [],
        rollback: [],
        completedKept: [],
        queue: { pendingStart: [], nextCandidate: null, updatedAt: null },
        trackedChains: {},
        workItems: {},
        delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
      },
      chains: [],
      registry: [],
      notifications: [],
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
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-03 12:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        worktreePath: "/Users/zhaodongchao/ff-worktrees/req-b",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/req-b/control" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().workspace.sourceId, "req-b");
  assert.equal(response.json().overview.currentWave, "P2");
  assert.equal(response.json().mainControlResume.generatedAt, "2026-04-03-1200");
  assert.equal(response.json().actions.sleep_source_main_control.enabled, true);
  assert.equal(response.json().actions.wake_source_main_control.enabled, false);
  assert.equal(response.json().sourceRuntimeState.runtimeState, "sleeping");
  assert.equal(response.json().sourcePolicy.pinned, true);
  assert.equal(response.json().controlInboxItems[0].claimedBy, "main-control-req-b");
});

test("GET /api/workspaces/:sourceId/chains/:id returns source-scoped chain resume", async () => {
  const server = buildServer({
    loadStateForSource: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "PaymentPermissionAdjustment",
          nameZh: "收费记录权限调整",
          stage: "PENDING",
          uiState: "pending",
          priorityWave: "P1",
          summary: "待定",
          updatedAt: "2026-04-01 11:51",
          sessionName: "chain-PaymentPermissionAdjustment",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/PaymentPermissionAdjustment.md",
          blocked: false
        }
      ],
      registry: [
        { id: "PaymentPermissionAdjustment", nameZh: "收费记录权限调整", priorityWave: "P1", sequence: 10, enabled: true }
      ],
      notifications: [],
      actionEvents: [],
      chainResumePackets: {
        PaymentPermissionAdjustment: {
          generatedAt: "2026-04-01-1151",
          chainId: "PaymentPermissionAdjustment",
          stage: "PENDING",
          summary: "待定",
          mode: "hold",
          currentTask: "保持挂起，等待恢复信号",
          recoverable: false,
          queued: false,
          sessionRunning: false,
          blocked: false,
          rollback: false,
          paths: {
            map: "Projects/飞枢系统/Maps/PaymentPermissionAdjustment.md",
            codeList: "Projects/飞枢系统/CodeLists/PaymentPermissionAdjustment.md",
            workItem: "Projects/飞枢系统/share/work-items/PaymentPermissionAdjustment.json"
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
      workItems: {},
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
        }
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "newfee",
        label: "newfee",
        kind: "combined",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/newfee.md",
        legacyRoot: true,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/newfee/chains/PaymentPermissionAdjustment" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().chainResume.mode, "hold");
  assert.equal(response.json().chainResume.currentTask, "保持挂起，等待恢复信号");
});

test("GET /api/workspaces/:sourceId/chains/:id rewrites document paths for scoped sources", async () => {
  const server = buildServer({
    loadStateForSource: async () => ({
      workspace: {
        sourceId: "req-b",
        legacyRoot: false
      },
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "PaymentPermissionAdjustment",
          nameZh: "收费记录权限调整",
          stage: "PENDING",
          uiState: "pending",
          priorityWave: "P1",
          summary: "待定",
          updatedAt: "2026-04-01 11:51",
          sessionName: "chain-PaymentPermissionAdjustment",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/PaymentPermissionAdjustment.md",
          blocked: false
        }
      ],
      registry: [
        { id: "PaymentPermissionAdjustment", nameZh: "收费记录权限调整", priorityWave: "P1", sequence: 10, enabled: true }
      ],
      notifications: [
        {
          id: "20260402-1151-PaymentPermissionAdjustment",
          eventId: "20260402-1151-PaymentPermissionAdjustment",
          timestamp: "2026-04-02 11:51",
          level: "warning",
          title: "收费记录权限调整",
          summary: "待定",
          targetType: "chain",
          targetId: "PaymentPermissionAdjustment",
          status: "derived-unread",
          recommendedAction: null,
          canAiHandle: false
        }
      ],
      actionEvents: [],
      chainResumePackets: {},
      workItems: {},
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
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-01 11:51",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "req-b",
        label: "B 需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/req-b/chains/PaymentPermissionAdjustment" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().chain.mapPath, "Maps/req-b/PaymentPermissionAdjustment.md");
  assert.equal(response.json().documents.mapPath, "Maps/req-b/PaymentPermissionAdjustment.md");
  assert.equal(response.json().documents.codeListPath, "CodeLists/req-b/PaymentPermissionAdjustment.md");
  assert.equal(response.json().notifications[0]?.path, "share/sources/req-b/notifications/20260402-1151-PaymentPermissionAdjustment.md");
});

test("GET /api/workspaces/:sourceId/overview returns 404 for unknown source", async () => {
  const server = buildServer({
    listWorkspaces: async () => ([
      {
        sourceId: "newfee",
        label: "newfee",
        kind: "combined",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/newfee.md",
        legacyRoot: true,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/missing/overview" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().message, "Unknown source id: missing");
});

test("GET /api/workspaces/:sourceId/chains returns 404 for unknown source", async () => {
  const server = buildServer({
    listWorkspaces: async () => ([
      {
        sourceId: "newfee",
        label: "newfee",
        kind: "combined",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/newfee.md",
        legacyRoot: true,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/missing/chains" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().message, "Unknown source id: missing");
});

test("GET /api/workspaces/:sourceId/events returns consistent 404 body for unknown source", async () => {
  const server = buildServer({
    listWorkspaces: async () => ([
      {
        sourceId: "newfee",
        label: "newfee",
        kind: "combined",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/newfee.md",
        legacyRoot: true,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/missing/events" });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { message: "Unknown source id: missing" });
});

test("GET /api/workspaces/:sourceId/health returns source-scoped health", async () => {
  const server = buildServer({
    loadStateForSource: async (sourceId) => ({
      overview: {
        currentWave: sourceId === "req-b" ? "P2" : "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: 2345,
        status: "running",
        activeSessions: ["chain-ReqBChain"],
        lastActionSummary: "req-b running"
      },
      waveSummary: {
        wave: "P2",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [],
      registry: [],
      notifications: [],
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
        watcherPid: 2345,
        watcherAlive: true,
        activeSessions: ["chain-ReqBChain"],
        lastActionSummary: "req-b running"
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/req-b/health" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().watcherPid, 2345);
  assert.equal(response.json().lastActionSummary, "req-b running");
});

test("GET /api/chains and /api/queue return aggregated payloads", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P0",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: ["chain-ContractAddAndFee"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P0",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S2",
          uiState: "active",
          priorityWave: "P0",
          summary: "working",
          updatedAt: "2026-03-26",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: true,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        }
      ],
      registry: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          priorityWave: "P0",
          sequence: 10,
          enabled: true
        }
      ],
      notifications: [],
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
        }
      }
    })
  });

  const [chainsResponse, queueResponse] = await Promise.all([
    server.inject({ method: "GET", url: "/api/chains" }),
    server.inject({ method: "GET", url: "/api/queue" })
  ]);

  assert.equal(chainsResponse.statusCode, 200);
  assert.equal(chainsResponse.json().chains[0].sessionRunning, true);
  assert.equal(queueResponse.statusCode, 200);
  assert.equal(queueResponse.json().scheduler.status, "running");
});

test("GET /api/events returns latest-first projected events", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 2,
        completedChains: 1,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "paused",
        mainControlHealth: "abnormal",
        concurrency: { active: 0, max: 2 },
        lastNotificationAt: "2026-03-26 11:03",
        lastSummaryAt: "2026-03-26 11:02"
      },
      scheduler: {
        desiredState: "paused",
        updatedAt: "2026-03-26 11:02",
        updatedBy: "pause-scheduler.sh",
        pid: 1234,
        status: "paused",
        activeSessions: [],
        lastActionSummary: "2026-03-26 11:02 暂停调度器"
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: ["OperationLogTracking"],
        nextCandidate: "OperationLogTracking",
        updatedAt: "2026-03-26 11:01"
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S5",
          uiState: "done",
          priorityWave: "P0",
          summary: "done",
          updatedAt: "2026-03-26 10:55",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        },
        {
          id: "OperationLogTracking",
          nameZh: "操作日志记录",
          stage: "S2",
          uiState: "blocked",
          priorityWave: "P1",
          summary: "blocked",
          updatedAt: "2026-03-26 11:00",
          sessionName: "chain-OperationLogTracking",
          sessionRunning: false,
          queued: true,
          queueIndex: 1,
          riskCount: { critical: 0, warning: 1 },
          mapPath: "Maps/OperationLogTracking.md",
          blocked: true,
          workItemMode: "blocked",
          workItemTask: "保持阻塞并记录恢复条件",
          workItemRecoverable: false,
          workItemUpdatedAt: "2026-03-26 11:00"
        }
      ],
      registry: [
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
      ],
      notifications: [
        {
          id: "20260326-1103-OperationLogTracking",
          eventId: "20260326-1103-OperationLogTracking",
          timestamp: "2026-03-26 11:03",
          level: "warning",
          title: "操作日志记录",
          summary: "OperationLogTracking is blocked.",
          targetType: "chain",
          targetId: "OperationLogTracking",
          status: "resolved",
          recommendedAction: "保留原始通知元数据",
          canAiHandle: true
        },
        {
          id: "20260326-1102-scheduler-paused",
          eventId: "20260326-1102-scheduler-paused",
          timestamp: "2026-03-26 11:02",
          level: "warning",
          title: "调度器已暂停",
          summary: "Scheduler is paused.",
          targetType: "scheduler",
          targetId: null,
          status: "derived-unread",
          recommendedAction: "恢复调度器",
          canAiHandle: false
        }
      ],
      actionEvents: [
        {
          id: "action:generate_fee_api_docs:2026-03-26 11:04",
          type: "action_executed",
          timestamp: "2026-03-26 11:04",
          chainId: null,
          level: "info",
          title: "已生成收费联调接口文档",
          summary: "已生成 5 个接口文档，纳入 4 条链。",
          source: "action",
          relatedPath: "03-业务链资产/接口文档",
          relatedSession: null,
          actionable: false
        }
      ],
      health: {
        ok: false,
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
        schedulerStatus: "paused",
        watcherPid: 1234,
        activeSessions: [],
        lastActionSummary: "2026-03-26 11:02 暂停调度器"
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/events" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(Array.isArray(payload.events), true);
  const eventTypes = payload.events.map((item: { type: string }) => item.type);
  assert.equal(eventTypes.includes("chain_notified"), true);
  assert.equal(eventTypes.includes("scheduler_notified"), true);
  assert.equal(eventTypes.includes("scheduler_paused"), true);
  assert.equal(eventTypes.includes("queue_updated"), true);
  assert.equal(eventTypes.includes("risk_detected"), true);
  assert.equal(eventTypes.includes("action_executed"), true);
  const actionEvent = payload.events.find((item: { type: string }) => item.type === "action_executed");
  assert.equal(actionEvent?.title, "已生成收费联调接口文档");
  assert.equal(actionEvent?.relatedPath, "03-业务链资产/接口文档");
  const chainNotificationEvent = payload.events.find((item: { type: string }) => item.type === "chain_notified");
  assert.equal(chainNotificationEvent?.title, "操作日志记录");
  assert.equal(chainNotificationEvent?.summary, "操作日志记录 有新的链路通知。");
  const schedulerNotificationEvent = payload.events.find((item: { type: string }) => item.type === "scheduler_notified");
  assert.equal(schedulerNotificationEvent?.title, "调度器已暂停");
  assert.equal(schedulerNotificationEvent?.summary, "调度器当前有新的状态通知。");
  const schedulerPausedEvent = payload.events.find((item: { type: string }) => item.type === "scheduler_paused");
  assert.equal(schedulerPausedEvent?.title, "调度器已暂停");
  assert.equal(schedulerPausedEvent?.summary, "2026-03-26 11:02 暂停调度器");
  const queueUpdatedEvent = payload.events.find((item: { type: string }) => item.type === "queue_updated");
  assert.equal(queueUpdatedEvent?.title, "待启动队列已更新");
  assert.equal(queueUpdatedEvent?.summary, "当前有 1 条待启动链，下一候选链为 OperationLogTracking。");
});

test("GET /api/notifications returns attention-worthy derived notifications", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "paused",
        mainControlHealth: "abnormal",
        concurrency: { active: 0, max: 1 },
        lastNotificationAt: "2026-03-26 11:03",
        lastSummaryAt: "2026-03-26 11:02"
      },
      scheduler: {
        desiredState: "paused",
        updatedAt: "2026-03-26 11:02",
        updatedBy: "pause-scheduler.sh",
        pid: 1234,
        status: "paused",
        activeSessions: [],
        lastActionSummary: "2026-03-26 11:02 暂停调度器"
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 1,
        pendingStart: ["OperationLogTracking"],
        nextCandidate: "OperationLogTracking",
        updatedAt: "2026-03-26 11:01"
      },
      chains: [
        {
          id: "OperationLogTracking",
          nameZh: "操作日志记录",
          stage: "S2",
          uiState: "blocked",
          priorityWave: "P1",
          summary: "blocked",
          updatedAt: "2026-03-26 11:00",
          sessionName: "chain-OperationLogTracking",
          sessionRunning: false,
          queued: true,
          queueIndex: 1,
          riskCount: { critical: 0, warning: 1 },
          mapPath: "Maps/OperationLogTracking.md",
          blocked: true
        }
      ],
      registry: [
        {
          id: "OperationLogTracking",
          nameZh: "操作日志记录",
          priorityWave: "P1",
          sequence: 20,
          enabled: true
        }
      ],
      notifications: [
        {
          id: "20260326-1103-OperationLogTracking",
          eventId: "20260326-1103-OperationLogTracking",
          timestamp: "2026-03-26 11:03",
          level: "warning",
          title: "操作日志记录",
          summary: "OperationLogTracking is blocked.",
          targetType: "chain",
          targetId: "OperationLogTracking",
          status: "resolved",
          recommendedAction: "保留原始通知元数据",
          canAiHandle: true
        },
        {
          id: "20260326-1102-scheduler-paused",
          eventId: "20260326-1102-scheduler-paused",
          timestamp: "2026-03-26 11:02",
          level: "warning",
          title: "调度器已暂停",
          summary: "Scheduler is paused.",
          targetType: "scheduler",
          targetId: null,
          status: "derived-unread",
          recommendedAction: "恢复调度器",
          canAiHandle: false
        }
      ],
      health: {
        ok: false,
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
        schedulerStatus: "paused",
        watcherPid: 1234,
        activeSessions: [],
        lastActionSummary: "2026-03-26 11:02 暂停调度器"
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/notifications" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(Array.isArray(payload.notifications), true);
  assert.equal(payload.notifications.length, 3);
  const sourceNotification = payload.notifications.find((item: { eventId: string }) => item.eventId === "20260326-1103-OperationLogTracking");
  assert.equal(sourceNotification?.status, "resolved");
  assert.equal(sourceNotification?.summary, "操作日志记录 有新的链路通知。");
  assert.equal(sourceNotification?.recommendedAction, "保留原始通知元数据");
  assert.equal(sourceNotification?.canAiHandle, true);
  const schedulerNotifications = payload.notifications.filter((item: { targetType: string }) => item.targetType === "scheduler");
  assert.equal(schedulerNotifications.length, 1);
  assert.equal(schedulerNotifications[0]?.eventId, "20260326-1102-scheduler-paused");
  assert.equal(schedulerNotifications[0]?.summary, "调度器当前有新的状态通知。");
  assert.equal(schedulerNotifications[0]?.recommendedAction, "恢复调度器");
  assert.equal(payload.notifications.some((item: { targetType: string }) => item.targetType === "chain"), true);
});

test("config derives core FF paths from project root", () => {
  assert.equal(ffPaths.projectRoot.endsWith("/Projects/飞枢系统"), true);
  assert.equal(ffPaths.consoleRoot, `${ffPaths.projectRoot}/Console`);
  assert.equal(ffPaths.shareRoot, `${ffPaths.projectRoot}/share`);
  assert.equal(ffPaths.notificationsRoot, `${ffPaths.projectRoot}/share/notifications`);
});

test("resolveProjectRoot handles both src and dist-like directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ff-console-config-"));
  await Promise.all([
    mkdir(path.join(root, "share"), { recursive: true }),
    mkdir(path.join(root, "Playbooks"), { recursive: true }),
    mkdir(path.join(root, "03-业务链资产"), { recursive: true })
  ]);

  const srcDir = path.join(root, "Console", "server", "src");
  const distDir = path.join(root, "Console", "server", "dist", "server", "src");

  assert.equal(resolveProjectRoot(srcDir), root);
  assert.equal(resolveProjectRoot(distDir), root);
});

test("POST /api/actions rejects non-whitelisted actions", async () => {
  let runActionCalled = false;
  const server = buildServer({
    runAction: async () => {
      runActionCalled = true;
      throw new Error("should not run");
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/actions",
    payload: { actionType: "drop_everything" }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().success, false);
  assert.equal(runActionCalled, false);
});

test("POST /api/actions runs generate_fee_api_docs", async () => {
  const server = buildServer({
    runAction: async (request) => {
      assert.equal(request.actionType, "generate_fee_api_docs");
      return {
        success: true,
        actionType: request.actionType,
        eventId: "action:generate_fee_api_docs:2026-03-26 11:04",
        message: "收费接口文档已生成，请前往 Projects/飞枢系统/03-业务链资产/接口文档/收费业务链联调总览.md 查看。",
        outputDir: "Projects/飞枢系统/03-业务链资产/接口文档",
        generatedFiles: ["收费业务链联调总览.md"],
        includedChainIds: ["ContractAddAndFee"]
      };
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/actions",
    payload: { actionType: "generate_fee_api_docs" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  assert.equal(response.json().actionType, "generate_fee_api_docs");
  assert.equal(response.json().eventId, "action:generate_fee_api_docs:2026-03-26 11:04");
  assert.equal(response.json().generatedFiles[0], "收费业务链联调总览.md");
  assert.match(response.json().message, /收费业务链联调总览\.md/u);
});

test("POST /api/actions requires explicit confirmation for B-level actions", async () => {
  const server = buildServer({
    runAction: async () => {
      throw new Error("should not execute without confirmation");
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/actions",
    payload: { actionType: "pause_scheduler" }
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().success, false);
  assert.equal(response.json().message, "Confirmation required for action: pause_scheduler");
});

test("POST /api/actions forwards payload for confirmed queue actions", async () => {
  const server = buildServer({
    runAction: async (request) => {
      assert.equal(request.actionType, "promote_queue_item");
      assert.equal(request.targetId, "HomepageReminder");
      assert.equal(request.confirmed, true);
      return {
        success: true,
        actionType: request.actionType,
        eventId: "action:promote_queue_item:2026-03-28 11:30",
        message: "已将链提升到队列顶部",
        queue: {
          maxConcurrent: 3,
          pendingStart: ["HomepageReminder", "OperationLogTracking"],
          nextCandidate: "HomepageReminder",
          updatedAt: "2026-03-28 11:30:00"
        }
      };
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/actions",
    payload: {
      actionType: "promote_queue_item",
      targetId: "HomepageReminder",
      confirmed: true
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  assert.equal(response.json().queue.pendingStart[0], "HomepageReminder");
});

test("POST /api/global/actions forwards action to global runner", async () => {
  const server = buildServer({
    runAction: async (request) => {
      assert.equal(request.actionType, "summarize_overview");
      assert.equal(request.confirmed, true);
      return {
        success: true,
        actionType: request.actionType,
        eventId: "action:summarize_overview:global",
        message: "global summary sent"
      };
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/global/actions",
    payload: {
      actionType: "summarize_overview",
      confirmed: true
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().message, "global summary sent");
});

test("POST /api/ai/chat returns proposal for scheduler mutation requests", async () => {
  const server = buildServer({
    aiBridge: {
      chat: async (request) => {
        assert.equal(request.mode, "scheduler");
        return {
          kind: "proposal",
          response: "我建议先重新同步队列。",
          resolvedTarget: {
            targetType: "scheduler",
            targetId: null,
            sessionName: null,
            reason: "scheduler mode"
          },
          proposal: {
            proposalKind: "action",
            actionType: "resync_queue",
            title: "重新同步待启动队列",
            summary: "按固定算法重算 pendingStart。",
            impact: "会写回 dispatch-queue.json",
            riskLevel: "controlled",
            confirmLabel: "确认同步",
            targetType: "scheduler",
            targetId: null,
            sessionName: null
          }
        };
      },
      dispatch: async () => {
        throw new Error("not used");
      }
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/ai/chat",
    payload: {
      mode: "scheduler",
      target: "auto",
      message: "帮我重新同步队列",
      context: { page: "scheduler", selectedChainId: null }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().kind, "proposal");
  assert.equal(response.json().proposal.actionType, "resync_queue");
});

test("POST /api/ai/dispatch sends controlled message", async () => {
  const server = buildServer({
    aiBridge: {
      chat: async () => {
        throw new Error("not used");
      },
      dispatch: async (request) => {
        assert.equal(request.proposalId, "proposal-123");
        return {
          success: true,
          eventId: "action:ai_dispatch:2026-03-28 14:20",
          targetType: "main-control",
          targetId: null,
          sessionName: "main-control",
          message: "请主控总结当前全局状态。",
          stdout: null,
          stderr: null
        };
      }
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/ai/dispatch",
    payload: {
      proposalId: "proposal-123"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  assert.equal(response.json().sessionName, "main-control");
});

test("POST /api/ai/dispatch rejects direct dispatch without proposal id", async () => {
  const server = buildServer({
    aiBridge: {
      chat: async () => {
        throw new Error("not used");
      },
      dispatch: async () => {
        throw new Error("should not be called");
      }
    }
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/ai/dispatch",
    payload: {
      targetType: "main-control",
      message: "[task8-demo] main-control harmless ping"
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().message, "AI proposal id is required");
});

test("POST /api/workspaces/:sourceId/actions forwards action to source-scoped runner", async () => {
  const server = buildServer({
    runActionForSource: async (sourceId, request) => {
      assert.equal(sourceId, "req-b");
      assert.equal(request.actionType, "summarize_overview");
      return {
        success: true,
        actionType: request.actionType,
        eventId: "action:summarize_overview:req-b",
        message: "req-b summary sent"
      };
    },
    listWorkspaces: async () => ([
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/workspaces/req-b/actions",
    payload: {
      actionType: "summarize_overview",
      confirmed: true
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().message, "req-b summary sent");
});

test("POST /api/workspaces/:sourceId/actions forwards generate_chain_test_cases to source-scoped runner", async () => {
  const server = buildServer({
    runActionForSource: async (sourceId, request) => {
      assert.equal(sourceId, "req-b");
      assert.equal(request.actionType, "generate_chain_test_cases");
      assert.equal(request.targetId, "ReceiptPrinting");
      return {
        success: true,
        actionType: request.actionType,
        eventId: "action:generate_chain_test_cases:req-b:ReceiptPrinting",
        message: "ReceiptPrinting 测试用例已生成",
        path: "03-业务链资产/测试用例/ReceiptPrinting-test-cases.md",
        generatedFiles: ["ReceiptPrinting-test-cases.md"]
      };
    },
    listWorkspaces: async () => ([
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/workspaces/req-b/actions",
    payload: {
      actionType: "generate_chain_test_cases",
      targetId: "ReceiptPrinting"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().actionType, "generate_chain_test_cases");
  assert.equal(response.json().path, "03-业务链资产/测试用例/ReceiptPrinting-test-cases.md");
});

test("POST /api/workspaces/:sourceId/ai/chat forwards to source-scoped ai bridge", async () => {
  const server = buildServer({
    aiBridgeForSource: async (sourceId) => ({
      chat: async (request) => {
        assert.equal(sourceId, "req-b");
        assert.equal(request.message, "现在状态如何？");
        return {
          kind: "answer",
          response: `workspace=${sourceId}`,
          resolvedTarget: {
            targetType: null,
            targetId: null,
            sessionName: null,
            reason: "scoped bridge"
          },
          proposal: null
        };
      },
      dispatch: async () => {
        throw new Error("not used");
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "req-b",
        label: "B需求",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/B需求.md",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({
    method: "POST",
    url: "/api/workspaces/req-b/ai/chat",
    payload: {
      mode: "qa",
      target: "auto",
      message: "现在状态如何？",
      context: { page: "overview", selectedChainId: null }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().response, "workspace=req-b");
});

test("GET /api/risks returns detected risk list", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P0",
        totalChains: 1,
        completedChains: 1,
        activeChains: 0,
        pendingChains: 0,
        schedulerStatus: "abnormal",
        mainControlHealth: "abnormal",
        concurrency: { active: 0, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-03-28 10:00:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "abnormal",
        activeSessions: [],
        lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 0/2"
      },
      waveSummary: {
        wave: "P0",
        total: 1,
        completed: 1,
        active: 0,
        pending: 0,
        reviewPath: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S5",
          uiState: "done",
          priorityWave: "P0",
          summary: "done",
          updatedAt: "2026-03-28 09:00:00",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: true,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        }
      ],
      registry: [
        { id: "ContractAddAndFee", nameZh: "合同创建并收费", priorityWave: "P0", sequence: 10, enabled: true }
      ],
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: "2026-03-28 09:59:00"
      },
      notifications: [],
      actionEvents: [],
      reviewPaths: [],
      mapStages: {
        ContractAddAndFee: "S4"
      },
      health: {
        ok: false,
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
        schedulerStatus: "abnormal",
        watcherPid: 1234,
        watcherAlive: false,
        activeSessions: [],
        lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 0/2"
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/risks" });

  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.json().risks), true);
  assert.equal(response.json().risks.length > 0, true);
});

test("GET /api/wave returns current wave progress and review files", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 2,
        completedChains: 1,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-03-28 10:00:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["chain-HomepageReminder"],
        lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 1/2"
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S5",
          uiState: "done",
          priorityWave: "P0",
          summary: "done",
          updatedAt: "2026-03-28",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        },
        {
          id: "HomepageReminder",
          nameZh: "首页合同到期提醒",
          stage: "S1",
          uiState: "blocked",
          priorityWave: "P1",
          summary: "blocked",
          updatedAt: "2026-03-28",
          sessionName: "chain-HomepageReminder",
          sessionRunning: true,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 1 },
          mapPath: "Maps/HomepageReminder.md",
          blocked: true
        }
      ],
      registry: [],
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: "2026-03-28 10:00:00"
      },
      notifications: [],
      actionEvents: [],
      reviewPaths: ["Reviews/Wave1-P0.md"],
      mapStages: {},
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
        watcherPid: 1234,
        watcherAlive: true,
        activeSessions: ["chain-HomepageReminder"],
        lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 1/2"
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/wave" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().waveSummary.wave, "P1");
  assert.equal(response.json().reviews[0].path, "Reviews/Wave1-P0.md");
  assert.equal(response.json().chains[0].id, "HomepageReminder");
});

test("GET /api/chains/:id returns single-chain detail payload", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P0",
        totalChains: 2,
        completedChains: 1,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: "2026-03-26 11:03",
        lastSummaryAt: "2026-03-26 11:02"
      },
      scheduler: {
        desiredState: "running",
        updatedAt: "2026-03-26 11:00",
        updatedBy: "resume-scheduler.sh",
        pid: 1234,
        status: "running",
        activeSessions: ["chain-OperationLogTracking"],
        lastActionSummary: "2026-03-26 11:02 启动链 session: chain-OperationLogTracking"
      },
      waveSummary: {
        wave: "P0",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: "Reviews/Wave1-P0.md"
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: ["OperationLogTracking"],
        nextCandidate: "OperationLogTracking",
        updatedAt: "2026-03-26 11:01"
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S5",
          uiState: "done",
          priorityWave: "P0",
          summary: "需求边界、接口设计、后端实现均已完成",
          updatedAt: "2026-03-26 10:55",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        },
        {
          id: "OperationLogTracking",
          nameZh: "操作日志记录",
          stage: "S2",
          uiState: "blocked",
          priorityWave: "P1",
          summary: "当前有阻塞，需要主控检查",
          updatedAt: "2026-03-26 11:00",
          sessionName: "chain-OperationLogTracking",
          sessionRunning: true,
          queued: true,
          queueIndex: 1,
          riskCount: { critical: 0, warning: 1 },
          mapPath: "Maps/OperationLogTracking.md",
          blocked: true
        }
      ],
      registry: [
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
      ],
      notifications: [
        {
          id: "20260326-1103-OperationLogTracking",
          eventId: "20260326-1103-OperationLogTracking",
          timestamp: "2026-03-26 11:03",
          level: "warning",
          title: "操作日志记录",
          summary: "当前阻塞，请主控关注。",
          targetType: "chain",
          targetId: "OperationLogTracking",
          status: "derived-unread",
          recommendedAction: "请主控检查当前阻塞状态",
          canAiHandle: false
        }
      ],
      actionEvents: [],
      workItems: {
        OperationLogTracking: {
          chainId: "OperationLogTracking",
          mode: "blocked",
          currentTask: "保持阻塞并记录恢复条件",
          expectedOutput: "输出阻塞原因与恢复条件",
          allowedActions: ["确认阻塞原因", "确认恢复条件"],
          forbiddenActions: ["实现", "测试验证"],
          lastVerifiedAt: "2026-03-26 11:00",
          lastVerifiedBy: "main-control",
          updatedAt: "2026-03-26 11:00"
        }
      },
      chainResumePackets: {
        OperationLogTracking: {
          generatedAt: "2026-03-26-1100",
          chainId: "OperationLogTracking",
          stage: "S2",
          summary: "当前阻塞，需要主控检查",
          mode: "blocked",
          currentTask: "确认阻塞原因与恢复条件",
          recoverable: false,
          queued: true,
          sessionRunning: true,
          blocked: true,
          rollback: false,
          paths: {
            map: "Projects/飞枢系统/Maps/OperationLogTracking.md",
            codeList: "Projects/飞枢系统/CodeLists/OperationLogTracking.md",
            workItem: "Projects/飞枢系统/share/work-items/OperationLogTracking.json"
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
      manualSessionHolds: {
        OperationLogTracking: "2026-03-30 11:45:00"
      },
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
        watcherPid: 1234,
        activeSessions: ["chain-OperationLogTracking"],
        lastActionSummary: "2026-03-26 11:02 启动链 session: chain-OperationLogTracking"
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/chains/OperationLogTracking" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.chain.id, "OperationLogTracking");
  assert.equal(payload.session.attachCommand, "tmux attach -t chain-OperationLogTracking");
  assert.equal(payload.session.manualHoldUntil, "2026-03-30 11:45:00");
  assert.equal(payload.actions.start_chain_session.enabled, false);
  assert.equal(payload.actions.resume_chain_session.enabled, true);
  assert.equal(payload.actions.open_terminal_and_attach.enabled, true);
  assert.equal(payload.actions.copy_attach_command.enabled, true);
  assert.equal(payload.actions.generate_chain_test_cases.enabled, true);
  assert.equal(payload.actions.generate_chain_test_cases.targetType, "chain");
  assert.equal(payload.risk.blocked, true);
  assert.equal(payload.risk.warning, 1);
  assert.equal(payload.chainResume.generatedAt, "2026-03-26-1100");
  assert.equal(payload.chainResume.mode, "blocked");
  assert.equal(payload.workItem.mode, "blocked");
  assert.equal(payload.workItem.currentTask, "保持阻塞并记录恢复条件");
  assert.deepEqual(payload.workItem.allowedActions, ["确认阻塞原因", "确认恢复条件"]);
  assert.equal(payload.workItem.lastVerifiedBy, "main-control");
  assert.equal(payload.documents.mapPath, "Maps/OperationLogTracking.md");
  assert.equal(payload.documents.codeListPath, "CodeLists/OperationLogTracking.md");
  assert.equal(payload.notifications[0].path, "share/notifications/20260326-1103-OperationLogTracking.md");
  assert.equal(payload.events.some((item: { type: string }) => item.type === "risk_detected"), true);
});

test("GET /api/chains/:id derives mode from truth while preserving persisted work-item instructions", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 0,
        pendingChains: 1,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 0, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: 1234,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 0,
        pending: 1,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: ["EmployeePerformance"],
        nextCandidate: "EmployeePerformance",
        updatedAt: null
      },
      chains: [
        {
          id: "EmployeePerformance",
          nameZh: "员工绩效",
          stage: "PENDING",
          uiState: "pending",
          priorityWave: "P2",
          summary: "等待进一步确认",
          updatedAt: "2026-03-31 11:00",
          sessionName: "chain-EmployeePerformance",
          sessionRunning: false,
          queued: true,
          queueIndex: 1,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/EmployeePerformance.md",
          blocked: false,
          workItemMode: "hold",
          workItemTask: "保持挂起，等待恢复信号",
          workItemRecoverable: false,
          workItemUpdatedAt: "2026-03-31 09:00"
        }
      ],
      registry: [
        {
          id: "EmployeePerformance",
          nameZh: "员工绩效",
          priorityWave: "P2",
          sequence: 10,
          enabled: true
        }
      ],
      notifications: [],
      actionEvents: [],
      workItems: {
        EmployeePerformance: {
          mode: "active",
          currentTask: "继续实现绩效接口",
          recoverable: true,
          updatedAt: "2026-03-31 09:00",
          expectedOutput: "完成绩效接口开发",
          allowedActions: ["实现", "测试验证"],
          forbiddenActions: [],
          lastVerifiedAt: "2026-03-31 09:00",
          lastVerifiedBy: "worker"
        }
      },
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
        }
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/chains/EmployeePerformance" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.workItem.mode, "hold");
  assert.equal(payload.workItem.currentTask, "继续实现绩效接口");
  assert.deepEqual(payload.workItem.allowedActions, ["实现", "测试验证"]);
  assert.equal(payload.workItem.recoverable, false);
  assert.equal(payload.actions.start_chain_session.enabled, false);
  assert.equal(payload.actions.start_chain_session.reason, "当前链处于挂起，等待恢复信号，不支持启动或恢复链 session。");
  assert.equal(payload.actions.copy_attach_command.enabled, false);
  assert.equal(payload.workItem.updatedAt, "2026-03-31 09:00");
  assert.equal(payload.workItem.lastVerifiedAt, "2026-03-31 09:00");
  assert.equal(payload.workItem.lastVerifiedBy, "worker");
});

test("GET /api/chains/:id disables takeover for stopped non-recoverable sessions", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P0",
        totalChains: 1,
        completedChains: 1,
        activeChains: 0,
        pendingChains: 0,
        schedulerStatus: "paused",
        mainControlHealth: "healthy",
        concurrency: { active: 0, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "paused",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "paused",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P0",
        total: 1,
        completed: 1,
        active: 0,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S5",
          uiState: "done",
          priorityWave: "P0",
          summary: "done",
          updatedAt: "2026-03-30 10:00",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        }
      ],
      registry: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          priorityWave: "P0",
          sequence: 10,
          enabled: true
        }
      ],
      notifications: [],
      actionEvents: [],
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
        }
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/chains/ContractAddAndFee" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.actions.start_chain_session.enabled, false);
  assert.equal(payload.actions.start_chain_session.reason, "当前链已收口，仅保留只读参考，不支持启动或恢复链 session。");
  assert.equal(payload.actions.resume_chain_session.enabled, false);
  assert.equal(payload.actions.resume_chain_session.reason, "当前链已收口，仅保留只读参考，不支持启动或恢复链 session。");
  assert.equal(payload.actions.open_terminal_and_attach.enabled, false);
  assert.equal(payload.actions.copy_attach_command.enabled, false);
});

test("GET /api/chains/:id disables high-risk actions when preflight blocks them", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P0",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "abnormal",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: ["chain-newfee-ContractAddAndFee"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P0",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S3",
          uiState: "active",
          priorityWave: "P0",
          summary: "working",
          updatedAt: "2026-03-30 10:00",
          sessionName: "chain-newfee-ContractAddAndFee",
          sessionRunning: true,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/newfee/ContractAddAndFee.md",
          blocked: false
        }
      ],
      registry: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          priorityWave: "P0",
          sequence: 10,
          enabled: true
        }
      ],
      notifications: [],
      actionEvents: [],
      health: {
        ok: false,
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
        }
      },
      preflight: {
        state: "drift",
        checkedAt: "2026-04-03 12:00",
        issues: [{ code: "work_item_conflict", severity: "drift", summary: "conflict" }],
        blockingActionTypes: ["resume_chain_session", "start_chain_session", "generate_chain_test_cases"],
        recommendedActions: ["resync_queue"]
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/chains/ContractAddAndFee" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().actions.generate_chain_test_cases.enabled, false);
  assert.match(response.json().actions.generate_chain_test_cases.reason, /resync_queue/);
  assert.equal(response.json().actions.resume_chain_session.enabled, false);
  assert.equal(response.json().actions.open_terminal_and_attach.enabled, true);
});

test("GET /api/workspaces/:sourceId/chains/:id keeps queued S1 chains recoverable", async () => {
  const server = buildServer({
    loadStateForSource: async () => ({
      workspace: { sourceId: "testall", legacyRoot: false },
      overview: {
        currentWave: "P1",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 0, max: 3 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "paused",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P1",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 3,
        pendingStart: ["ContractAddAndFeeLogEnhancement"],
        nextCandidate: "ContractAddAndFeeLogEnhancement",
        updatedAt: "2026-04-07 05:50:41"
      },
      chains: [
        {
          id: "ContractAddAndFeeLogEnhancement",
          nameZh: "合同创建并收费日志补强",
          stage: "S1",
          uiState: "discovery",
          priorityWave: "P1",
          summary: "围绕 addAndFee 主流程补充关键日志，当前处于 S1 收敛阶段。",
          updatedAt: "2026-04-02",
          sessionName: "chain-testall-ContractAddAndFeeLogEnhancement",
          sessionRunning: false,
          queued: true,
          queueIndex: 1,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/testall/ContractAddAndFeeLogEnhancement.md",
          blocked: false,
          workItemMode: "active",
          workItemTask: "完成日志补强链的 S1 收敛，不进入实现",
          workItemRecoverable: true,
          workItemUpdatedAt: "2026-04-02 16:08"
        }
      ],
      registry: [
        {
          id: "ContractAddAndFeeLogEnhancement",
          nameZh: "合同创建并收费日志补强",
          priorityWave: "P1",
          sequence: 10,
          enabled: true
        }
      ],
      notifications: [],
      actionEvents: [],
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
        watcherPid: null,
        watcherAlive: null,
        activeSessions: [],
        lastActionSummary: null,
        preflight: { state: "fresh", checkedAt: "2026-04-07 05:50:41", issues: [], blockingActionTypes: [], recommendedActions: [] }
      },
      preflight: { state: "fresh", checkedAt: "2026-04-07 05:50:41", issues: [], blockingActionTypes: [], recommendedActions: [] },
      mainControlResume: null,
      chainResumePackets: {},
      workItems: {
        ContractAddAndFeeLogEnhancement: {
          mode: "active",
          currentTask: "完成日志补强链的 S1 收敛，不进入实现",
          recoverable: true,
          updatedAt: "2026-04-02 16:08",
          expectedOutput: "输出日志落点建议、最小日志点集合、风险和验证步骤",
          allowedActions: ["恢复上下文", "定位日志落点"],
          forbiddenActions: ["直接进入实现"],
          lastVerifiedAt: "2026-04-02 16:08",
          lastVerifiedBy: "main-control"
        }
      },
      defectItems: {},
      reviewPaths: [],
      mapStages: {},
      manualSessionHolds: {},
      sourceRuntimeState: { sourceId: "testall", runtimeState: "running", lastActiveAt: "2026-04-07 05:45:44", pinned: false },
      sourcePolicy: { autoSleep: true, idleSleepMinutes: 30, pinned: false, maxConcurrentChains: 3 },
      controlInboxItems: [],
      orchestrationState: null
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/testall/chains/ContractAddAndFeeLogEnhancement" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.workItem.mode, "active");
  assert.equal(payload.workItem.recoverable, true);
  assert.equal(payload.actions.start_chain_session.enabled, true);
});

test("GET /api/workspaces/:sourceId/chains/:id returns defect items for Defect chain", async () => {
  const server = buildServer({
    loadStateForSource: async () => ({
      overview: {
        currentWave: "P2",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 0, max: 1 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P2",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 1,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "Defect",
          nameZh: "缺陷处理",
          stage: "PENDING",
          uiState: "pending",
          priorityWave: "P2",
          summary: "缺陷专用容器链，默认空闲，等待缺陷进入",
          updatedAt: "2026-04-03 10:10",
          sessionName: "chain-Defect",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/Defect.md",
          blocked: false,
          workItemMode: "hold",
          workItemTask: "跟进最近 2 条缺陷",
          workItemRecoverable: false,
          workItemUpdatedAt: "2026-04-03 10:10"
        }
      ],
      registry: [
        { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
      ],
      notifications: [],
      actionEvents: [],
      chainResumePackets: {},
      workItems: {
        Defect: {
          mode: "hold",
          currentTask: "跟进最近 2 条缺陷",
          recoverable: false,
          updatedAt: "2026-04-03 10:10",
          expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
          allowedActions: ["恢复上下文"],
          forbiddenActions: ["擅自扩展为新功能"],
          lastVerifiedAt: null,
          lastVerifiedBy: "main-control-testall",
          sourceChainId: "OperationLogTracking",
          severity: "warning",
          regression: true,
          expectedBehavior: null,
          actualBehavior: null,
          verificationScope: []
        }
      },
      defectItems: {
        Defect: [
          {
            itemId: "2026-04-03-100500-OperationLogTracking",
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
          },
          {
            itemId: "2026-04-03-100700-OperationLogTracking",
            sourceChainId: "OperationLogTracking",
            reason: "第二个缺陷",
            severity: "warning",
            regression: false,
            expectedBehavior: null,
            actualBehavior: null,
            verificationScope: [],
            createdAt: "2026-04-03 10:07:00",
            createdBy: "main-control-testall",
            status: "claimed",
            claimedBy: "main-control-testall",
            claimedAt: "2026-04-03 10:08:00",
            fixedAt: null,
            verifiedAt: null
          }
        ]
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
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-03 12:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "testall",
        label: "testall",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testall.md",
        worktreePath: "/Users/zhaodongchao/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/testall/chains/Defect" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.defectItems.length, 2);
  assert.equal(payload.defectItems[0].itemId, "2026-04-03-100500-OperationLogTracking");
  assert.equal(payload.actions.start_chain_session.enabled, true);
  assert.equal(payload.actions.start_chain_session.reason, null);
  assert.equal(payload.actions.resume_chain_session.enabled, false);
  assert.equal(payload.actions.resume_chain_session.reason, "链 session 未运行，请先启动该链 session。");
});

test("GET /api/workspaces/:sourceId/chains/:id keeps Defect start disabled after all items verified", async () => {
  const server = buildServer({
    loadStateForSource: async () => ({
      overview: {
        currentWave: "P2",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 0, max: 1 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: null,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P2",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 1,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "Defect",
          nameZh: "缺陷处理",
          stage: "PENDING",
          uiState: "pending",
          priorityWave: "P2",
          summary: "缺陷专用容器链，默认空闲，等待缺陷进入",
          updatedAt: "2026-04-03 10:10",
          sessionName: "chain-Defect",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/Defect.md",
          blocked: false,
          workItemMode: "hold",
          workItemTask: "跟进最近 1 条缺陷",
          workItemRecoverable: false,
          workItemUpdatedAt: "2026-04-03 10:10"
        }
      ],
      registry: [
        { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
      ],
      notifications: [],
      actionEvents: [],
      chainResumePackets: {},
      workItems: {
        Defect: {
          mode: "hold",
          currentTask: "跟进最近 1 条缺陷",
          recoverable: false,
          updatedAt: "2026-04-03 10:10",
          expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
          allowedActions: ["恢复上下文"],
          forbiddenActions: ["擅自扩展为新功能"],
          lastVerifiedAt: null,
          lastVerifiedBy: "main-control-testall",
          sourceChainId: "OperationLogTracking",
          severity: "warning",
          regression: true,
          expectedBehavior: null,
          actualBehavior: null,
          verificationScope: []
        }
      },
      defectItems: {
        Defect: [
          {
            itemId: "2026-04-03-100500-OperationLogTracking",
            sourceChainId: "OperationLogTracking",
            reason: "分页日志缺少合同 ID",
            severity: "high",
            regression: true,
            expectedBehavior: "分页日志应包含合同 ID",
            actualBehavior: "当前响应缺少合同 ID",
            verificationScope: ["OperationLogTracking 单测"],
            createdAt: "2026-04-03 10:05:00",
            createdBy: "main-control-testall",
            status: "verified",
            claimedBy: "main-control-testall",
            claimedAt: "2026-04-03 10:08:00",
            fixedAt: "2026-04-03 10:09:00",
            verifiedAt: "2026-04-03 10:10:00"
          }
        ]
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
        }
      },
      preflight: {
        state: "fresh",
        checkedAt: "2026-04-03 12:05",
        issues: [],
        blockingActionTypes: [],
        recommendedActions: []
      }
    }),
    listWorkspaces: async () => ([
      {
        sourceId: "testall",
        label: "testall",
        kind: "single",
        enabled: true,
        sourceDocPath: "Projects/飞枢系统/testall.md",
        worktreePath: "/Users/zhaodongchao/ff-worktrees/testall",
        legacyRoot: false,
        draftIncomplete: false
      }
    ])
  });

  const response = await server.inject({ method: "GET", url: "/api/workspaces/testall/chains/Defect" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().actions.start_chain_session.enabled, false);
  assert.equal(response.json().actions.start_chain_session.reason, "Defect 当前没有待处理缺陷项，暂不需要启动链 session。");
});

test("GET /api/chains/:id returns explicit 404 for unknown chain ids", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P0",
        totalChains: 1,
        completedChains: 0,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 2 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: 1234,
        status: "running",
        activeSessions: [],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P0",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 2,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S2",
          uiState: "active",
          priorityWave: "P0",
          summary: "working",
          updatedAt: "2026-03-26",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: true,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        }
      ],
      registry: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          priorityWave: "P0",
          sequence: 10,
          enabled: true
        }
      ],
      notifications: [],
      actionEvents: [],
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
        watcherPid: 1234,
        activeSessions: [],
        lastActionSummary: null
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/chains/MissingChain" });

  assert.equal(response.statusCode, 404);
  assert.equal(response.json().message, "Unknown chain id: MissingChain");
});

test("GET /api/chains/:id resolves review path for non-current wave chains when review index is available", async () => {
  const server = buildServer({
    loadState: async () => ({
      overview: {
        currentWave: "P2",
        totalChains: 2,
        completedChains: 1,
        activeChains: 1,
        pendingChains: 0,
        schedulerStatus: "running",
        mainControlHealth: "healthy",
        concurrency: { active: 1, max: 3 },
        lastNotificationAt: null,
        lastSummaryAt: null
      },
      scheduler: {
        desiredState: "running",
        updatedAt: null,
        updatedBy: null,
        pid: 1234,
        status: "running",
        activeSessions: ["chain-EmployeePerformance"],
        lastActionSummary: null
      },
      waveSummary: {
        wave: "P2",
        total: 1,
        completed: 0,
        active: 1,
        pending: 0,
        reviewPath: null
      },
      queue: {
        maxConcurrent: 3,
        pendingStart: [],
        nextCandidate: null,
        updatedAt: null
      },
      chains: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          stage: "S5",
          uiState: "done",
          priorityWave: "P0",
          summary: "done",
          updatedAt: "2026-03-26",
          sessionName: "chain-ContractAddAndFee",
          sessionRunning: false,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/ContractAddAndFee.md",
          blocked: false
        },
        {
          id: "EmployeePerformance",
          nameZh: "员工绩效",
          stage: "S2",
          uiState: "active",
          priorityWave: "P2",
          summary: "working",
          updatedAt: "2026-03-26",
          sessionName: "chain-EmployeePerformance",
          sessionRunning: true,
          queued: false,
          queueIndex: null,
          riskCount: { critical: 0, warning: 0 },
          mapPath: "Maps/EmployeePerformance.md",
          blocked: false
        }
      ],
      registry: [
        {
          id: "ContractAddAndFee",
          nameZh: "合同创建并收费",
          priorityWave: "P0",
          sequence: 10,
          enabled: true
        },
        {
          id: "EmployeePerformance",
          nameZh: "员工绩效",
          priorityWave: "P2",
          sequence: 20,
          enabled: true
        }
      ],
      notifications: [],
      actionEvents: [],
      reviewPaths: ["Reviews/Wave1-P0.md", "Reviews/Wave3-P2.md"],
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
        watcherPid: 1234,
        activeSessions: ["chain-EmployeePerformance"],
        lastActionSummary: null
      }
    })
  });

  const response = await server.inject({ method: "GET", url: "/api/chains/ContractAddAndFee" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().documents.reviewPath, "Reviews/Wave1-P0.md");
});
