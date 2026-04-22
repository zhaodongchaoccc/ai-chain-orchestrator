import assert from "node:assert/strict";
import test from "node:test";

import { parseTmuxSessionNames } from "./tmux-utils";

test("parseTmuxSessionNames returns session names from tmux ls output", () => {
  const output = [
    "chain-ContractAddAndFee: 1 windows (created Wed Mar 25 10:00:00 2026)",
    "chain-OldDataUpgrade: 1 windows (created Wed Mar 25 10:10:00 2026) (attached)",
    "notes: 1 windows (created Wed Mar 25 10:20:00 2026)"
  ].join("\n");

  assert.deepEqual(parseTmuxSessionNames(output), [
    "chain-ContractAddAndFee",
    "chain-OldDataUpgrade",
    "notes"
  ]);
});

test("parseTmuxSessionNames ignores blank and malformed lines", () => {
  const output = ["", "no-colon-here", "chain-ReceiptPrinting: 1 windows"].join("\n");

  assert.deepEqual(parseTmuxSessionNames(output), ["chain-ReceiptPrinting"]);
});

test("parseTmuxSessionNames trims padded session names", () => {
  const output = ["  chain-HomepageReminder : 1 windows (created Wed Mar 25 10:20:00 2026)  "].join("\n");

  assert.deepEqual(parseTmuxSessionNames(output), ["chain-HomepageReminder"]);
});
