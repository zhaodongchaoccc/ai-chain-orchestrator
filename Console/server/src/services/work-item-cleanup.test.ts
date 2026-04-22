import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { cleanupLegacyWorkItemRuntimeFields } from "./work-item-cleanup";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("cleanupLegacyWorkItemRuntimeFields removes mode and recoverable from root and source work-items", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-work-item-cleanup-"));
  const rootWorkItems = path.join(projectRoot, "share", "work-items");
  const sourceWorkItems = path.join(projectRoot, "share", "sources", "newfee", "work-items");

  await Promise.all([
    mkdir(rootWorkItems, { recursive: true }),
    mkdir(sourceWorkItems, { recursive: true })
  ]);

  await Promise.all([
    writeJson(path.join(rootWorkItems, "OperationLogTracking.json"), {
      chainId: "OperationLogTracking",
      mode: "active",
      recoverable: true,
      currentTask: "继续当前唯一任务"
    }),
    writeJson(path.join(sourceWorkItems, "Defect.json"), {
      chainId: "Defect",
      mode: "hold",
      recoverable: false,
      currentTask: "处理已认领缺陷",
      expectedBehavior: "保留上下文字段"
    })
  ]);

  const result = await cleanupLegacyWorkItemRuntimeFields(projectRoot);
  const rootPayload = JSON.parse(await readFile(path.join(rootWorkItems, "OperationLogTracking.json"), "utf8"));
  const sourcePayload = JSON.parse(await readFile(path.join(sourceWorkItems, "Defect.json"), "utf8"));

  assert.equal(result.scannedFiles, 2);
  assert.equal(result.updatedFiles, 2);
  assert.deepEqual(result.updatedPaths.sort(), [
    path.join(rootWorkItems, "OperationLogTracking.json"),
    path.join(sourceWorkItems, "Defect.json")
  ].sort());
  assert.equal("mode" in rootPayload, false);
  assert.equal("recoverable" in rootPayload, false);
  assert.equal(rootPayload.currentTask, "继续当前唯一任务");
  assert.equal("mode" in sourcePayload, false);
  assert.equal("recoverable" in sourcePayload, false);
  assert.equal(sourcePayload.expectedBehavior, "保留上下文字段");
});

test("cleanupLegacyWorkItemRuntimeFields leaves semantic-only work-items untouched", async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-work-item-cleanup-"));
  const workItemsRoot = path.join(projectRoot, "share", "sources", "req-x", "work-items");

  await mkdir(workItemsRoot, { recursive: true });
  await writeJson(path.join(workItemsRoot, "ChargeStatistical.json"), {
    chainId: "ChargeStatistical",
    currentTask: "继续当前唯一任务",
    expectedOutput: "输出当前阶段"
  });

  const before = await readFile(path.join(workItemsRoot, "ChargeStatistical.json"), "utf8");
  const result = await cleanupLegacyWorkItemRuntimeFields(projectRoot);
  const after = await readFile(path.join(workItemsRoot, "ChargeStatistical.json"), "utf8");

  assert.equal(result.scannedFiles, 1);
  assert.equal(result.updatedFiles, 0);
  assert.deepEqual(result.updatedPaths, []);
  assert.equal(after, before);
});
