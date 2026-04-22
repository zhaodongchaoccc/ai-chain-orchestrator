import assert from "node:assert/strict";
import test from "node:test";

import { getControlInboxActionState } from "./control-inbox-actions";

test("getControlInboxActionState allows claim and resolve for open items", () => {
  assert.deepEqual(getControlInboxActionState({
    eventId: "e1",
    scopeFrom: "chain",
    scopeTo: "source",
    sourceId: "testall",
    chainId: "HomepageReminder",
    severity: "warning",
    reason: "need",
    requestedAction: "confirm",
    status: "open",
    createdAt: "2026-04-03 10:00:00",
    claimedBy: null,
    resolvedAt: null
  }), { canClaim: true, canResolve: true });
});

test("getControlInboxActionState blocks claim after item is already claimed", () => {
  assert.deepEqual(getControlInboxActionState({
    eventId: "e2",
    scopeFrom: "source",
    scopeTo: "global",
    sourceId: "testall",
    chainId: null,
    severity: "critical",
    reason: "need",
    requestedAction: "pause",
    status: "claimed",
    createdAt: "2026-04-03 10:00:00",
    claimedBy: "main-control",
    resolvedAt: null
  }), { canClaim: false, canResolve: true });
});

test("getControlInboxActionState blocks all actions for resolved items", () => {
  assert.deepEqual(getControlInboxActionState({
    eventId: "e3",
    scopeFrom: "chain",
    scopeTo: "source",
    sourceId: "testall",
    chainId: "HomepageReminder",
    severity: "warning",
    reason: "done",
    requestedAction: "none",
    status: "resolved",
    createdAt: "2026-04-03 10:00:00",
    claimedBy: "main-control-testall",
    resolvedAt: "2026-04-03 10:05:00"
  }), { canClaim: false, canResolve: false });
});
