import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSourceRuntimePolicy, selectEvictionCandidate, shouldSleepSourceMainControl } from "./source-runtime-policy";

test("normalizeSourceRuntimePolicy applies batch-three defaults", () => {
  assert.deepEqual(normalizeSourceRuntimePolicy(undefined), {
    autoSleep: true,
    idleSleepMinutes: 30,
    pinned: false,
    maxConcurrentChains: 3
  });
});

test("shouldSleepSourceMainControl only sleeps after idle threshold with no blockers", () => {
  const policy = normalizeSourceRuntimePolicy(undefined);
  assert.equal(shouldSleepSourceMainControl({
    policy,
    lastActiveAt: "2026-04-03T10:00:00Z",
    now: new Date("2026-04-03T10:29:00Z"),
    hasRunningChains: false,
    hasCriticalInbox: false,
    hasPendingDispatch: false
  }), false);
  assert.equal(shouldSleepSourceMainControl({
    policy,
    lastActiveAt: "2026-04-03T10:00:00Z",
    now: new Date("2026-04-03T10:31:00Z"),
    hasRunningChains: false,
    hasCriticalInbox: false,
    hasPendingDispatch: false
  }), true);
});

test("selectEvictionCandidate chooses oldest unpinned running source when capacity is full", () => {
  const candidate = selectEvictionCandidate([
    { sourceId: "a", runtimeState: "running", lastActiveAt: "2026-04-03 10:05:00", pinned: false },
    { sourceId: "b", runtimeState: "running", lastActiveAt: "2026-04-03 10:01:00", pinned: false },
    { sourceId: "c", runtimeState: "pinned", lastActiveAt: "2026-04-03 09:50:00", pinned: true },
    { sourceId: "d", runtimeState: "running", lastActiveAt: "2026-04-03 10:09:00", pinned: false },
    { sourceId: "e", runtimeState: "running", lastActiveAt: "2026-04-03 10:07:00", pinned: false }
  ], 5);

  assert.equal(candidate?.sourceId, "b");
});
