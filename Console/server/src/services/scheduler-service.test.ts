import assert from "node:assert/strict";
import test from "node:test";

import type { ChainRegistryEntry, DispatchQueueState } from "../../../shared/event-model";

import { promoteQueueItem, resyncQueue } from "./scheduler-service";

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
  },
  {
    id: "OldDataUpgrade",
    nameZh: "旧版数据升级",
    priorityWave: "P2",
    sequence: 20,
    enabled: true
  },
  {
    id: "EmployeePerformance",
    nameZh: "员工绩效",
    priorityWave: "P2",
    sequence: 40,
    enabled: false
  }
];

const currentQueue: DispatchQueueState = {
  maxConcurrent: 3,
  pendingStart: ["HomepageReminder", "OperationLogTracking"],
  nextCandidate: "HomepageReminder",
  updatedAt: "2026-03-28 11:00:00"
};

test("resyncQueue filters enabled non-S5 non-running chains and sorts deterministically", () => {
  const nextQueue = resyncQueue({
    registry,
    currentQueue,
    chainStatus: {
      ContractAddAndFee: { stage: "S5" },
      OperationLogTracking: { stage: "S2" },
      HomepageReminder: { stage: "S1" },
      OldDataUpgrade: { stage: "S5" },
      EmployeePerformance: { stage: "S1" }
    },
    activeSessions: ["chain-OperationLogTracking"],
    now: () => new Date("2026-03-28T11:15:00Z")
  });

  assert.deepEqual(nextQueue, {
    maxConcurrent: 3,
    pendingStart: ["HomepageReminder"],
    nextCandidate: "HomepageReminder",
    updatedAt: "2026-03-28 11:15:00"
  });
});

test("promoteQueueItem moves target chain to the front and preserves others", () => {
  const nextQueue = promoteQueueItem(currentQueue, "OperationLogTracking", () => new Date("2026-03-28T11:20:00Z"));

  assert.deepEqual(nextQueue, {
    maxConcurrent: 3,
    pendingStart: ["OperationLogTracking", "HomepageReminder"],
    nextCandidate: "OperationLogTracking",
    updatedAt: "2026-03-28 11:20:00"
  });
});

test("promoteQueueItem keeps queue unchanged when target chain is absent", () => {
  const nextQueue = promoteQueueItem(currentQueue, "ContractAddAndFee", () => new Date("2026-03-28T11:20:00Z"));

  assert.deepEqual(nextQueue, {
    maxConcurrent: 3,
    pendingStart: ["HomepageReminder", "OperationLogTracking"],
    nextCandidate: "HomepageReminder",
    updatedAt: "2026-03-28 11:20:00"
  });
});

test("resyncQueue orders candidates by wave then sequence deterministically", () => {
  const nextQueue = resyncQueue({
    registry,
    currentQueue,
    chainStatus: {
      ContractAddAndFee: { stage: "S1" },
      OperationLogTracking: { stage: "S2" },
      HomepageReminder: { stage: "S1" },
      OldDataUpgrade: { stage: "S1" },
      EmployeePerformance: { stage: "S1" }
    },
    activeSessions: [],
    now: () => new Date("2026-03-28T11:25:00Z")
  });

  assert.deepEqual(nextQueue.pendingStart, [
    "ContractAddAndFee",
    "OperationLogTracking",
    "HomepageReminder",
    "OldDataUpgrade"
  ]);
});

test("resyncQueue uses chain id as final deterministic tiebreaker", () => {
  const nextQueue = resyncQueue({
    registry: [
      { id: "WavePeerB", nameZh: "B", priorityWave: "P1", sequence: 10, enabled: true },
      { id: "WavePeerA", nameZh: "A", priorityWave: "P1", sequence: 10, enabled: true }
    ],
    currentQueue,
    chainStatus: {
      WavePeerA: { stage: "S1" },
      WavePeerB: { stage: "S1" }
    },
    activeSessions: [],
    now: () => new Date("2026-03-28T11:30:00Z")
  });

  assert.deepEqual(nextQueue.pendingStart, ["WavePeerA", "WavePeerB"]);
});

test("resyncQueue filters blocked and pending chains from queue truth", () => {
  const nextQueue = resyncQueue({
    registry,
    currentQueue,
    chainStatus: {
      ContractAddAndFee: { stage: "S1" },
      OperationLogTracking: { stage: "PENDING" },
      HomepageReminder: { stage: "S1", blocked: true },
      OldDataUpgrade: { stage: "S1" },
      EmployeePerformance: { stage: "S1" }
    },
    activeSessions: [],
    now: () => new Date("2026-03-28T11:35:00Z")
  });

  assert.deepEqual(nextQueue.pendingStart, ["ContractAddAndFee", "OldDataUpgrade"]);
});

test("resyncQueue filters source-aware running chains for the current workspace", () => {
  const nextQueue = resyncQueue({
    registry,
    currentQueue,
    chainStatus: {
      ContractAddAndFee: { stage: "S1" },
      OperationLogTracking: { stage: "S1" },
      HomepageReminder: { stage: "S1" },
      OldDataUpgrade: { stage: "S1" },
      EmployeePerformance: { stage: "S1" }
    },
    activeSessions: ["chain-testall-OperationLogTracking"],
    sourceId: "testall",
    now: () => new Date("2026-03-28T11:35:00Z")
  });

  assert.deepEqual(nextQueue.pendingStart, ["ContractAddAndFee", "HomepageReminder", "OldDataUpgrade"]);
});

test("resyncQueue filters rollback chains from queue truth", () => {
  const nextQueue = resyncQueue({
    registry,
    currentQueue,
    chainStatus: {
      ContractAddAndFee: { stage: "S1" },
      OperationLogTracking: { stage: "ROLLBACK" },
      HomepageReminder: { stage: "S1" },
      OldDataUpgrade: { stage: "S1" },
      EmployeePerformance: { stage: "S1" }
    },
    activeSessions: [],
    now: () => new Date("2026-03-28T11:36:00Z")
  });

  assert.deepEqual(nextQueue.pendingStart, ["ContractAddAndFee", "HomepageReminder", "OldDataUpgrade"]);
});
