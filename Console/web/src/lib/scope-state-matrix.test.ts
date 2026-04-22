import assert from "node:assert/strict";
import test from "node:test";

import { buildGlobalStatusMatrix, buildSourceStatusMatrix } from "./scope-state-matrix";

test("buildGlobalStatusMatrix maps fresh running state into healthy and running tones", () => {
  const cards = buildGlobalStatusMatrix({
    preflightState: "fresh",
    schedulerStatus: "running",
    workspacesCount: 3,
    activeChains: 2,
    pendingChains: 1,
    risks: [],
    notifications: []
  });

  assert.deepEqual(cards.map((card) => [card.key, card.tone]), [
    ["freshness", "healthy"],
    ["runtime", "running"],
    ["workflow", "running"],
    ["attention", "healthy"]
  ]);
});

test("buildGlobalStatusMatrix escalates drift and critical attention", () => {
  const cards = buildGlobalStatusMatrix({
    preflightState: "drift",
    schedulerStatus: "abnormal",
    workspacesCount: 3,
    activeChains: 0,
    pendingChains: 2,
    risks: [{ id: "risk:1", level: "critical", type: "session-orphan", title: "risk", summary: "risk", chainId: null, recommendedAction: "fix" }],
    notifications: [{ id: "n1", eventId: "n1", timestamp: "2026-04-03 10:00", level: "warning", title: "warn", summary: "warn", targetType: "chain", targetId: "x", status: "derived-unread", recommendedAction: null, canAiHandle: false }]
  });

  assert.equal(cards[0]?.tone, "critical");
  assert.equal(cards[1]?.tone, "critical");
  assert.equal(cards[2]?.tone, "pending");
  assert.equal(cards[3]?.tone, "critical");
});

test("buildSourceStatusMatrix reflects queue backlog and notifications", () => {
  const cards = buildSourceStatusMatrix({
    preflightState: "needs_resync",
    schedulerStatus: "paused",
    activeChains: 0,
    pendingStartCount: 2,
    notifications: [{ id: "n1", eventId: "n1", timestamp: "2026-04-03 10:00", level: "warning", title: "warn", summary: "warn", targetType: "chain", targetId: "x", status: "derived-unread", recommendedAction: null, canAiHandle: false }]
  });

  assert.equal(cards[0]?.tone, "warning");
  assert.equal(cards[1]?.tone, "paused");
  assert.equal(cards[2]?.tone, "pending");
  assert.equal(cards[3]?.tone, "warning");
});
