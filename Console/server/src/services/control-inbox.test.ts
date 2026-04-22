import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { appendControlInboxItem, buildControlInboxItem, canResolveControlInboxItem, readControlInbox, updateControlInboxItem } from "./control-inbox";

test("control inbox appends and reads structured escalation items", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ff-control-inbox-"));
  const inboxPath = path.join(root, "control-inbox.jsonl");

  await mkdir(root, { recursive: true });
  await appendControlInboxItem(
    inboxPath,
    buildControlInboxItem({
      eventId: "control:1",
      scopeFrom: "chain",
      scopeTo: "source",
      sourceId: "testall",
      chainId: "OperationLogTracking",
      severity: "warning",
      reason: "需要主控裁决",
      requestedAction: "确认下一步",
      createdAt: "2026-04-03 10:00:00"
    })
  );

  const items = await readControlInbox(inboxPath);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.status, "open");
  assert.equal(items[0]?.scopeTo, "source");
});

test("control inbox claim and resolve rewrite item status", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ff-control-inbox-update-"));
  const inboxPath = path.join(root, "control-inbox.jsonl");

  await appendControlInboxItem(
    inboxPath,
    buildControlInboxItem({
      eventId: "control:2",
      scopeFrom: "source",
      scopeTo: "global",
      sourceId: "testall",
      chainId: null,
      severity: "critical",
      reason: "需要全局裁决",
      requestedAction: "暂停需求",
      createdAt: "2026-04-03 10:05:00"
    })
  );

  const claimed = await updateControlInboxItem(inboxPath, "control:2", {
    status: "claimed",
    claimedBy: "main-control-testall"
  });
  const resolved = await updateControlInboxItem(inboxPath, "control:2", {
    status: "resolved",
    resolvedAt: "2026-04-03 10:10:00"
  });

  const raw = await readFile(inboxPath, "utf8");
  assert.equal(claimed.status, "claimed");
  assert.equal(resolved.status, "resolved");
  assert.match(raw, /"claimedBy":"main-control-testall"/);
  assert.match(raw, /"resolvedAt":"2026-04-03 10:10:00"/);
});

test("control inbox resolve guard only allows open claimed and escalated items", () => {
  assert.equal(canResolveControlInboxItem("open"), true);
  assert.equal(canResolveControlInboxItem("claimed"), true);
  assert.equal(canResolveControlInboxItem("escalated"), true);
  assert.equal(canResolveControlInboxItem("rejected"), false);
  assert.equal(canResolveControlInboxItem("resolved"), false);
});
