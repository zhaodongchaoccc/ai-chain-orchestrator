import assert from "node:assert/strict";
import test from "node:test";

import { shouldEnforceRuntimePidGuard } from "./index";

test("shouldEnforceRuntimePidGuard disables runtime pid lock under supervisor mode", () => {
  assert.equal(shouldEnforceRuntimePidGuard({ FF_CONSOLE_SUPERVISED: "1" }), false);
  assert.equal(shouldEnforceRuntimePidGuard({}), true);
});
