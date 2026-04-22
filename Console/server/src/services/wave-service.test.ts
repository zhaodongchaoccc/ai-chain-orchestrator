import assert from "node:assert/strict";
import test from "node:test";

import type { ControlPlaneState } from "../types/overview";
import { buildWaveResponse } from "./wave-service";

function makeState(): ControlPlaneState {
  return {
    overview: {
      currentWave: "P1",
      totalChains: 4,
      completedChains: 2,
      activeChains: 1,
      pendingChains: 1,
      schedulerStatus: "running",
      mainControlHealth: "healthy",
      concurrency: { active: 1, max: 3 },
      lastNotificationAt: "2026-03-28 10:00:00",
      lastSummaryAt: "2026-03-28 10:00:00"
    },
    scheduler: {
      desiredState: "running",
      updatedAt: "2026-03-28 10:00:00",
      updatedBy: "resume-scheduler.sh",
      pid: 1234,
      status: "running",
      activeSessions: ["chain-HomepageReminder"],
      lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 1/3"
    },
    waveSummary: {
      wave: "P1",
      total: 2,
      completed: 1,
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
        updatedAt: "2026-03-28 09:00:00",
        sessionName: "chain-ContractAddAndFee",
        sessionRunning: false,
        queued: false,
        queueIndex: null,
        riskCount: { critical: 0, warning: 0 },
        mapPath: "Maps/ContractAddAndFee.md",
        blocked: false
      },
      {
        id: "ContractDetailFields",
        nameZh: "合同明细扩展字段",
        stage: "S5",
        uiState: "done",
        priorityWave: "P0",
        summary: "done",
        updatedAt: "2026-03-28 09:30:00",
        sessionName: "chain-ContractDetailFields",
        sessionRunning: false,
        queued: false,
        queueIndex: null,
        riskCount: { critical: 0, warning: 0 },
        mapPath: "Maps/ContractDetailFields.md",
        blocked: false
      },
      {
        id: "HomepageReminder",
        nameZh: "首页合同到期提醒",
        stage: "S1",
        uiState: "blocked",
        priorityWave: "P1",
        summary: "blocked",
        updatedAt: "2026-03-28 10:00:00",
        sessionName: "chain-HomepageReminder",
        sessionRunning: true,
        queued: false,
        queueIndex: null,
        riskCount: { critical: 0, warning: 1 },
        mapPath: "Maps/HomepageReminder.md",
        blocked: true
      },
      {
        id: "PaymentPermissionAdjustment",
        nameZh: "收费记录权限调整",
        stage: "PENDING",
        uiState: "pending",
        priorityWave: "P1",
        summary: "pending",
        updatedAt: "2026-03-28 08:00:00",
        sessionName: "chain-PaymentPermissionAdjustment",
        sessionRunning: false,
        queued: true,
        queueIndex: 1,
        riskCount: { critical: 0, warning: 0 },
        mapPath: "Maps/PaymentPermissionAdjustment.md",
        blocked: false
      }
    ],
    registry: [],
    queue: {
      maxConcurrent: 3,
      pendingStart: ["PaymentPermissionAdjustment"],
      nextCandidate: "PaymentPermissionAdjustment",
      updatedAt: "2026-03-28 10:00:00"
    },
    notifications: [],
    actionEvents: [],
    reviewPaths: ["Reviews/Wave1-P0.md", "Reviews/Wave3-P2.md"],
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
      lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 1/3"
    }
  };
}

test("buildWaveResponse returns current wave progress and historical reviews", () => {
  const payload = buildWaveResponse(makeState());

  assert.equal(payload.waveSummary.wave, "P1");
  assert.equal(payload.waveSummary.total, 2);
  assert.equal(payload.waveSummary.reviewPath, null);
  assert.equal(payload.canTriggerSummary, false);
  assert.deepEqual(payload.reviews.map((review) => review.path), ["Reviews/Wave3-P2.md", "Reviews/Wave1-P0.md"]);
  assert.deepEqual(payload.chains.map((chain) => chain.id), ["HomepageReminder", "PaymentPermissionAdjustment"]);
});

test("buildWaveResponse allows summary only when current wave is fully completed", () => {
  const state = makeState();
  state.chains = state.chains.map((chain) => chain.priorityWave === "P1"
    ? { ...chain, stage: "S5", uiState: "done", blocked: false }
    : chain);
  state.waveSummary = {
    wave: "P1",
    total: 2,
    completed: 2,
    active: 0,
    pending: 0,
    reviewPath: "Reviews/Wave2-P1.md"
  };

  const payload = buildWaveResponse(state);

  assert.equal(payload.canTriggerSummary, true);
});
