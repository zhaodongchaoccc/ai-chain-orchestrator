import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ParsedDemandSourceDoc } from "./demand-source-parser";
import { ensureDefectChainForSource, generateDemandSourceSkeleton } from "./demand-source-generator";

async function writeJson(filePath: string, value: unknown) {
  await import("node:fs/promises").then(({ writeFile }) => writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-demand-source-generator-"));
  const shareRoot = path.join(projectRoot, "share");
  const mapsRoot = path.join(projectRoot, "chain-assets", "地图");
  const reviewsRoot = path.join(projectRoot, "chain-assets", "波次总结");
  const codeListsRoot = path.join(projectRoot, "chain-assets", "代码清单");
  const demandTemplatesRoot = path.join(projectRoot, "demands", "templates");
  const worktreesRoot = path.join(projectRoot, "ff-worktrees");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(mapsRoot, { recursive: true }),
    mkdir(reviewsRoot, { recursive: true }),
    mkdir(codeListsRoot, { recursive: true }),
    mkdir(demandTemplatesRoot, { recursive: true }),
    mkdir(worktreesRoot, { recursive: true })
  ]);

  await writeJson(path.join(shareRoot, "workspaces.json"), [
    {
      sourceId: "newfee",
      label: "newfee",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/demands/newfee/newfee.md",
      worktreePath: path.join(worktreesRoot, "newfee"),
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);

  return { projectRoot, shareRoot, mapsRoot, reviewsRoot, codeListsRoot, demandTemplatesRoot, worktreesRoot };
}

function makeParsedDoc(overrides: Partial<ParsedDemandSourceDoc> = {}): ParsedDemandSourceDoc {
  return {
    demandName: "B需求",
    relativePath: "Projects/飞枢系统/B需求.md",
    title: "升级 B 流程",
    background: "当前 B 流程拆分不清晰。",
    expectedResult: "主控可快速拆链。",
    constraints: "先不要动 newfee 真值。",
    kind: "single",
    missingFields: [],
    draftIncomplete: false,
    ...overrides
  };
}

test("generateDemandSourceSkeleton creates scoped truth files and directories", async () => {
  const fixture = await makeFixture();

  const result = await generateDemandSourceSkeleton({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    mapsRoot: fixture.mapsRoot,
    reviewsRoot: fixture.reviewsRoot,
    codeListsRoot: fixture.codeListsRoot,
    demandTemplatesRoot: fixture.demandTemplatesRoot,
    worktreesRoot: fixture.worktreesRoot,
    parsedDoc: makeParsedDoc()
  });

  assert.match(result.workspace.sourceId, /^req-[a-f0-9]{8}$/u);
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "chain-registry.json"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "chain-status.json"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "dispatch-queue.json"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "scheduler-state.json"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "policy.json"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "control-inbox.jsonl"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "chinese-chain-names.json"));
  await stat(path.join(fixture.shareRoot, "sources", result.workspace.sourceId, "notifications"));
  await stat(path.join(fixture.projectRoot, "Sessions", "sources", result.workspace.sourceId));
  await stat(path.join(fixture.projectRoot, "Sessions", "sources", result.workspace.sourceId, "chain-resume"));
  await stat(path.join(fixture.worktreesRoot, result.workspace.sourceId));
  assert.equal(result.workspace.worktreePath, path.join("ff-worktrees", result.workspace.sourceId));
  await stat(path.join(fixture.mapsRoot, result.workspace.sourceId));
  await stat(path.join(fixture.reviewsRoot, result.workspace.sourceId));
  await stat(path.join(fixture.codeListsRoot, result.workspace.sourceId));
});

test("generateDemandSourceSkeleton creates an entry doc and registers draftIncomplete workspaces", async () => {
  const fixture = await makeFixture();

  const result = await generateDemandSourceSkeleton({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    mapsRoot: fixture.mapsRoot,
    reviewsRoot: fixture.reviewsRoot,
    codeListsRoot: fixture.codeListsRoot,
    demandTemplatesRoot: fixture.demandTemplatesRoot,
    worktreesRoot: fixture.worktreesRoot,
    parsedDoc: makeParsedDoc({
      missingFields: ["constraints"],
      draftIncomplete: true
    })
  });

  const entryDoc = await readFile(result.entryDocPath, "utf8");
  const workspaces = JSON.parse(await readFile(path.join(fixture.shareRoot, "workspaces.json"), "utf8"));

  assert.match(entryDoc, /B需求/u);
  assert.match(entryDoc, /Projects\/飞枢系统\/B需求\.md/u);
  assert.match(result.entryDocPath, /demands\/.+\/README\.md$/u);
  assert.equal(workspaces[1].draftIncomplete, true);
});

test("generateDemandSourceSkeleton preserves existing scoped truth files when rerun for same demand", async () => {
  const fixture = await makeFixture();

  const first = await generateDemandSourceSkeleton({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    mapsRoot: fixture.mapsRoot,
    reviewsRoot: fixture.reviewsRoot,
    codeListsRoot: fixture.codeListsRoot,
    demandTemplatesRoot: fixture.demandTemplatesRoot,
    worktreesRoot: fixture.worktreesRoot,
    parsedDoc: makeParsedDoc()
  });

  const chainStatusPath = path.join(fixture.shareRoot, "sources", first.workspace.sourceId, "chain-status.json");
  await writeJson(chainStatusPath, {
    HomepageReminder: { stage: "S2", updatedAt: "2026-04-03 10:00:00", summary: "preserve me" }
  });

  const second = await generateDemandSourceSkeleton({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    mapsRoot: fixture.mapsRoot,
    reviewsRoot: fixture.reviewsRoot,
    codeListsRoot: fixture.codeListsRoot,
    demandTemplatesRoot: fixture.demandTemplatesRoot,
    worktreesRoot: fixture.worktreesRoot,
    parsedDoc: makeParsedDoc()
  });

  assert.equal(second.workspace.sourceId, first.workspace.sourceId);
  assert.deepEqual(JSON.parse(await readFile(chainStatusPath, "utf8")), {
    HomepageReminder: { stage: "S2", updatedAt: "2026-04-03 10:00:00", summary: "preserve me" }
  });
});

test("ensureDefectChainForSource backfills missing Defect chain into existing source", async () => {
  const fixture = await makeFixture();
  const sourceId = "testall";
  const sourceShareRoot = path.join(fixture.shareRoot, "sources", sourceId);

  await mkdir(path.join(sourceShareRoot, "work-items"), { recursive: true });
  await writeJson(path.join(fixture.shareRoot, "workspaces.json"), [
    {
      sourceId: "newfee",
      label: "newfee",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/demands/newfee/newfee.md",
      worktreePath: path.join(fixture.worktreesRoot, "newfee"),
      legacyRoot: false,
      draftIncomplete: false
    },
    {
      sourceId,
      label: "testall",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/demands/templates/testall.md",
      worktreePath: path.join(fixture.worktreesRoot, sourceId),
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);
  await writeJson(path.join(sourceShareRoot, "chain-registry.json"), [
    { id: "OperationLogTracking", nameZh: "操作日志记录", priorityWave: "P1", sequence: 20, enabled: true }
  ]);
  await writeJson(path.join(sourceShareRoot, "chain-status.json"), {
    OperationLogTracking: { stage: "S1", updatedAt: "2026-04-03 10:00:00", summary: "active" }
  });
  await writeJson(path.join(sourceShareRoot, "chinese-chain-names.json"), {
    OperationLogTracking: "操作日志记录"
  });

  const changed = await ensureDefectChainForSource({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    sourceId
  });

  assert.equal(changed, true);
  assert.deepEqual(JSON.parse(await readFile(path.join(sourceShareRoot, "chain-registry.json"), "utf8")), [
    { id: "OperationLogTracking", nameZh: "操作日志记录", priorityWave: "P1", sequence: 20, enabled: true },
    { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
  ]);
  assert.deepEqual(JSON.parse(await readFile(path.join(sourceShareRoot, "chinese-chain-names.json"), "utf8")), {
    OperationLogTracking: "操作日志记录",
    Defect: "缺陷处理"
  });
  assert.deepEqual(JSON.parse(await readFile(path.join(sourceShareRoot, "work-items", "Defect.json"), "utf8")).chainId, "Defect");
});

test("ensureDefectChainForSource is no-op when Defect already exists", async () => {
  const fixture = await makeFixture();
  const sourceId = "testall";
  const sourceShareRoot = path.join(fixture.shareRoot, "sources", sourceId);

  await mkdir(path.join(sourceShareRoot, "work-items"), { recursive: true });
  await writeJson(path.join(sourceShareRoot, "chain-registry.json"), [
    { id: "Defect", nameZh: "缺陷处理", priorityWave: "P2", sequence: 999, enabled: true }
  ]);
  await writeJson(path.join(sourceShareRoot, "chain-status.json"), {
    Defect: { stage: "PENDING", updatedAt: null, summary: "缺陷专用容器链，默认空闲，等待缺陷进入" }
  });
  await writeJson(path.join(sourceShareRoot, "chinese-chain-names.json"), {
    Defect: "缺陷处理"
  });
  await writeJson(path.join(sourceShareRoot, "work-items", "Defect.json"), {
    chainId: "Defect",
    mode: "hold"
  });

  const changed = await ensureDefectChainForSource({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    sourceId
  });

  assert.equal(changed, false);
});
