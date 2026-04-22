import assert from "node:assert/strict";
import test from "node:test";

import { summarizeWatcherLog } from "./log-parser";

test("summarizeWatcherLog returns the latest scheduler line", () => {
  const log = [
    "[2026-03-25 10:57] 当前有效并发: 1/2",
    "[2026-03-25 10:58] 保留已完成链 session: OldDataUpgrade (attached=1)",
    "[2026-03-25 10:59] 当前有效并发: 2/2"
  ].join("\n");

  assert.equal(summarizeWatcherLog(log), "2026-03-25 10:59 当前有效并发: 2/2");
});

test("summarizeWatcherLog returns null for empty logs", () => {
  assert.equal(summarizeWatcherLog("\n\n"), null);
});

test("summarizeWatcherLog returns raw trailing line when no timestamp prefix exists", () => {
  const log = ["[2026-03-25 10:57] 当前有效并发: 1/2", "watcher restarted manually"].join("\n");

  assert.equal(summarizeWatcherLog(log), "watcher restarted manually");
});
