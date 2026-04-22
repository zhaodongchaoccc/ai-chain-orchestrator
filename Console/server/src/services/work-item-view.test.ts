import assert from "node:assert/strict";
import test from "node:test";

import type { ChainState, ChainWorkItemDetail } from "../../../shared/event-model";

import { buildChainWorkItemDetail, buildChainWorkItemSummary } from "./work-item-view";

function pendingDefectChain(): ChainState {
  return {
    id: "Defect",
    nameZh: "缺陷处理",
    stage: "PENDING",
    uiState: "pending",
    priorityWave: "P2",
    summary: "缺陷专用容器链，默认空闲，等待缺陷进入",
    updatedAt: "2026-04-03 10:10",
    sessionName: "chain-testall-Defect",
    sessionRunning: false,
    queued: false,
    queueIndex: null,
    riskCount: { critical: 0, warning: 0 },
    mapPath: "Maps/Defect.md",
    blocked: false
  };
}

test("buildChainWorkItemSummary derives mode while preserving semantic task fields", () => {
  const summary = buildChainWorkItemSummary(pendingDefectChain(), {
    mode: "active",
    currentTask: "处理已认领缺陷 2026-04-03-100500-CustomerServiceStatus-001",
    recoverable: true,
    updatedAt: "2026-04-03 10:20",
    expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
    allowedActions: ["恢复上下文", "缺陷归因"],
    forbiddenActions: ["擅自扩展为新功能"],
    lastVerifiedAt: "2026-04-03 10:20",
    lastVerifiedBy: "main-control-testall"
  });

  assert.equal(summary.mode, "hold");
  assert.equal(summary.currentTask, "处理已认领缺陷 2026-04-03-100500-CustomerServiceStatus-001");
  assert.equal(summary.recoverable, false);
  assert.equal(summary.updatedAt, "2026-04-03 10:20");
});

test("buildChainWorkItemDetail ignores legacy persisted mode but keeps detailed instructions", () => {
  const persisted: ChainWorkItemDetail = {
    mode: "active",
    currentTask: "验证已修复缺陷 2026-04-03-100500-CustomerServiceStatus-001",
    recoverable: true,
    updatedAt: "2026-04-03 10:25",
    expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
    allowedActions: ["恢复上下文", "状态判断"],
    forbiddenActions: ["擅自扩展为新功能"],
    lastVerifiedAt: "2026-04-03 10:25",
    lastVerifiedBy: "main-control-testall",
    sourceChainId: "CustomerServiceStatus",
    severity: "high",
    regression: true,
    expectedBehavior: "优先关联最新记账服务状态",
    actualBehavior: "当前返回了全部项目状态",
    verificationScope: ["CustomerServiceStatus 回归"]
  };

  const detail = buildChainWorkItemDetail(pendingDefectChain(), persisted);

  assert.equal(detail.mode, "hold");
  assert.equal(detail.currentTask, persisted.currentTask);
  assert.equal(detail.expectedOutput, persisted.expectedOutput);
  assert.deepEqual(detail.allowedActions, persisted.allowedActions);
  assert.deepEqual(detail.forbiddenActions, persisted.forbiddenActions);
  assert.equal(detail.lastVerifiedAt, persisted.lastVerifiedAt);
  assert.equal(detail.lastVerifiedBy, persisted.lastVerifiedBy);
  assert.equal(detail.sourceChainId, "CustomerServiceStatus");
  assert.equal(detail.expectedBehavior, "优先关联最新记账服务状态");
  assert.equal(detail.actualBehavior, "当前返回了全部项目状态");
  assert.deepEqual(detail.verificationScope, ["CustomerServiceStatus 回归"]);
});
