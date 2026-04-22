import assert from "node:assert/strict";
import test from "node:test";

import type { ChainDetailResponse, ChainState, MainControlResumePacket } from "../../../shared/event-model";

import { getChainResumeStaleness, getMainControlResumeStaleness } from "./resume-packet-staleness.ts";

function makeChain(id: ChainState["id"], overrides: Partial<ChainState> = {}): ChainState {
  return {
    id,
    nameZh: "收费记录权限调整",
    stage: "PENDING",
    uiState: "pending",
    priorityWave: "P1",
    summary: "待定",
    updatedAt: "2026-04-01 12:00:00",
    sessionName: `chain-${id}` as ChainState["sessionName"],
    sessionRunning: false,
    queued: false,
    queueIndex: null,
    riskCount: { critical: 0, warning: 0 },
    mapPath: `Maps/${id}.md` as ChainState["mapPath"],
    blocked: false,
    workItemMode: "hold",
    workItemTask: "保持挂起，等待恢复信号",
    workItemRecoverable: false,
    workItemUpdatedAt: "2026-04-01 12:00:00",
    ...overrides
  };
}

test("getMainControlResumeStaleness returns stale when queue timestamp is newer than packet", () => {
  const packet: MainControlResumePacket = {
    generatedAt: "2026-04-01-1150",
    handoffPath: "Projects/飞枢系统/Sessions/foo.md",
    running: [],
    pending: ["PaymentPermissionAdjustment"],
    blocked: [],
    rollback: [],
    completedKept: [],
    queue: { pendingStart: [], nextCandidate: null, updatedAt: "2026-04-01 11:50:00" },
    trackedChains: {},
    workItems: {},
    delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
  };

  const result = getMainControlResumeStaleness(packet, [makeChain("PaymentPermissionAdjustment")], {
    maxConcurrent: 2,
    pendingStart: [],
    nextCandidate: null,
    updatedAt: "2026-04-01 12:05:00"
  });

  assert.equal(result.stale, true);
  assert.match(result.reasons[0] ?? "", /队列更新时间更新/u);
});

test("getMainControlResumeStaleness returns stale when tracked chain mode differs from truth", () => {
  const packet: MainControlResumePacket = {
    generatedAt: "2026-04-01-1200",
    handoffPath: "Projects/飞枢系统/Sessions/foo.md",
    running: [],
    pending: ["PaymentPermissionAdjustment"],
    blocked: [],
    rollback: [],
    completedKept: [],
    queue: { pendingStart: [], nextCandidate: null, updatedAt: "2026-04-01 12:00:00" },
    trackedChains: {
      PaymentPermissionAdjustment: {
        chainId: "PaymentPermissionAdjustment",
        stage: "PENDING",
        summary: "待定",
        mode: "active",
        currentTask: "继续当前唯一任务",
        recoverable: true,
        queued: false,
        sessionRunning: false,
        blocked: false,
        rollback: false
      }
    },
    workItems: {},
    delta: { changedChains: [], queueAdded: [], queueRemoved: [], modeChanged: [], taskChanged: [] }
  };

  const result = getMainControlResumeStaleness(packet, [makeChain("PaymentPermissionAdjustment")], {
    maxConcurrent: 2,
    pendingStart: [],
    nextCandidate: null,
    updatedAt: "2026-04-01 12:00:00"
  });

  assert.equal(result.stale, true);
  assert.match(result.reasons[0] ?? "", /模式已变化/u);
});

test("getChainResumeStaleness returns stale when chain or work-item is newer than packet", () => {
  const detail = {
    chain: makeChain("PaymentPermissionAdjustment", {
      updatedAt: "2026-04-01 12:10:00",
      workItemUpdatedAt: "2026-04-01 12:12:00"
    }),
    chainResume: {
      generatedAt: "2026-04-01-1200",
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
    },
    workItem: {
      mode: "hold",
      currentTask: "保持挂起，等待恢复信号",
      recoverable: false,
      updatedAt: "2026-04-01 12:12:00",
      expectedOutput: null,
      allowedActions: [],
      forbiddenActions: [],
      lastVerifiedAt: null,
      lastVerifiedBy: null
    }
  } as ChainDetailResponse;

  const result = getChainResumeStaleness(detail);

  assert.equal(result.stale, true);
  assert.match(result.reasons.join(" "), /链状态|work-item/u);
});

test("getChainResumeStaleness returns fresh when packet aligns with truth", () => {
  const detail = {
    chain: makeChain("PaymentPermissionAdjustment", {
      updatedAt: "2026-04-01 12:00:00",
      workItemUpdatedAt: "2026-04-01 12:00:00"
    }),
    chainResume: {
      generatedAt: "2026-04-01-1200",
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
    },
    workItem: {
      mode: "hold",
      currentTask: "保持挂起，等待恢复信号",
      recoverable: false,
      updatedAt: "2026-04-01 12:00:00",
      expectedOutput: null,
      allowedActions: [],
      forbiddenActions: [],
      lastVerifiedAt: null,
      lastVerifiedBy: null
    }
  } as ChainDetailResponse;

  const result = getChainResumeStaleness(detail);

  assert.equal(result.stale, false);
  assert.deepEqual(result.reasons, []);
});
