import assert from "node:assert/strict";
import test from "node:test";

import type { ControlPlaneState } from "../types/overview";
import { detectRisks } from "./risk-detector";

function makeState(): ControlPlaneState {
  return {
    overview: {
      currentWave: "P1",
      totalChains: 3,
      completedChains: 2,
      activeChains: 1,
      pendingChains: 0,
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
      activeSessions: ["chain-ContractAddAndFee"],
      lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 1/3"
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
        updatedAt: "2026-03-28 09:00:00",
        sessionName: "chain-ContractAddAndFee",
        sessionRunning: true,
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
        updatedAt: "2026-03-28 09:00:00",
        sessionName: "chain-ContractDetailFields",
        sessionRunning: false,
        queued: true,
        queueIndex: 1,
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
        updatedAt: "2026-03-28 09:00:00",
        sessionName: "chain-HomepageReminder",
        sessionRunning: false,
        queued: true,
        queueIndex: 2,
        riskCount: { critical: 0, warning: 1 },
        mapPath: "Maps/HomepageReminder.md",
        blocked: true
      }
    ],
    registry: [
      { id: "ContractAddAndFee", nameZh: "合同创建并收费", priorityWave: "P0", sequence: 10, enabled: true },
      { id: "ContractDetailFields", nameZh: "合同明细扩展字段", priorityWave: "P0", sequence: 20, enabled: true },
      { id: "HomepageReminder", nameZh: "首页合同到期提醒", priorityWave: "P1", sequence: 10, enabled: true }
    ],
    queue: {
      maxConcurrent: 3,
      pendingStart: ["ContractDetailFields", "HomepageReminder"],
      nextCandidate: "ContractDetailFields",
      updatedAt: "2026-03-28 09:59:00"
    },
    notifications: [],
    actionEvents: [],
    reviewPaths: [],
    mapStages: {
      ContractAddAndFee: "S4",
      ContractDetailFields: "S5",
      HomepageReminder: "S1"
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
      schedulerStatus: "running",
      watcherPid: 1234,
      watcherAlive: false,
      activeSessions: ["chain-ContractAddAndFee"],
      lastActionSummary: "2026-03-28 10:00:00 当前有效并发: 1/3"
    }
  };
}

test("detectRisks returns the first-wave risk rules", () => {
  const risks = detectRisks(makeState(), {
    now: () => new Date("2026-03-28T10:01:00Z")
  });

  assert.equal(risks.some((risk) => risk.title.includes("已完成链仍保留 session")), true);
  assert.equal(risks.some((risk) => risk.title.includes("待启动队列包含已完成链")), true);
  assert.equal(risks.some((risk) => risk.title.includes("watcher pid 存在但进程不可用")), true);
  assert.equal(risks.some((risk) => risk.title.includes("并发未满但未补位")), true);
  assert.equal(risks.some((risk) => risk.title.includes("地图阶段与真值不一致")), true);
  assert.equal(risks.some((risk) => risk.title.includes("P0 Wave 已完成但缺少回顾")), true);
});

test("detectRisks only flags queue stall after the 30-second threshold", () => {
  const state = makeState();
  state.queue.updatedAt = "2026-03-28 10:00:00";
  const beforeThreshold = detectRisks(state, { now: () => new Date("2026-03-28T10:00:29") });
  const afterThreshold = detectRisks(state, { now: () => new Date("2026-03-28T10:00:31") });

  assert.equal(beforeThreshold.some((risk) => risk.id === "risk:queue-stalled"), false);
  assert.equal(afterThreshold.some((risk) => risk.id === "risk:queue-stalled"), true);
});

test("detectRisks suppresses missing review risk when the wave review already exists", () => {
  const state = makeState();
  state.reviewPaths = ["Reviews/Wave1-P0.md"];

  const risks = detectRisks(state, {
    now: () => new Date("2026-03-28T10:01:00Z")
  });

  assert.equal(risks.some((risk) => risk.id === "risk:wave-summary-missing:P0"), false);
});
