import assert from "node:assert/strict";
import test from "node:test";

import { getWorkspaceChainSessions, isChainSessionRunning } from "./chain-session-utils";

test("getWorkspaceChainSessions ignores unknown source-aware chains not present in registry", () => {
  const sessions = getWorkspaceChainSessions(
    ["chain-testall-OperationLogTracking", "chain-testall-OldDeletedChain", "chain-newfee-OperationLogTracking"],
    "testall",
    ["OperationLogTracking"]
  );

  assert.deepEqual(sessions, ["chain-testall-OperationLogTracking"]);
});

test("isChainSessionRunning only treats legacy sessions as newfee fallback", () => {
  assert.equal(isChainSessionRunning(["chain-OperationLogTracking"], "newfee", "OperationLogTracking"), true);
  assert.equal(isChainSessionRunning(["chain-OperationLogTracking"], "testall", "OperationLogTracking"), false);
});
