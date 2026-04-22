import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDemandSourceByName } from "./create-demand-source";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-create-demand-source-"));
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

test("createDemandSourceByName creates a new workspace from a matching demand doc", async () => {
  const fixture = await makeFixture();
  await writeFile(path.join(fixture.projectRoot, "B需求.md"), `# B需求

需求标题：
升级 B 流程

背景：
当前 B 流程拆分不清晰。

期望结果：
主控可快速拆链。

约束：
先不要动 newfee 真值。
`, "utf8");

  const result = await createDemandSourceByName({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    mapsRoot: fixture.mapsRoot,
    reviewsRoot: fixture.reviewsRoot,
    codeListsRoot: fixture.codeListsRoot,
    demandTemplatesRoot: fixture.demandTemplatesRoot,
    worktreesRoot: fixture.worktreesRoot,
    demandName: "B需求"
  });

  assert.equal(result.workspace.label, "B需求");
  assert.equal(result.parsed.kind, "single");
  assert.equal(result.parsed.draftIncomplete, false);
  assert.equal(result.workspace.worktreePath, path.join("ff-worktrees", result.workspace.sourceId));

  const workspaces = JSON.parse(await readFile(path.join(fixture.shareRoot, "workspaces.json"), "utf8"));
  assert.equal(workspaces.length, 2);

  const sourceShareRoot = path.join(fixture.shareRoot, "sources", result.workspace.sourceId);
  const chainRegistry = JSON.parse(await readFile(path.join(sourceShareRoot, "chain-registry.json"), "utf8"));
  const chainStatus = JSON.parse(await readFile(path.join(sourceShareRoot, "chain-status.json"), "utf8"));
  const chineseNames = JSON.parse(await readFile(path.join(sourceShareRoot, "chinese-chain-names.json"), "utf8"));
  const defectWorkItem = JSON.parse(await readFile(path.join(sourceShareRoot, "work-items", "Defect.json"), "utf8"));

  assert.deepEqual(chainRegistry, [
    {
      id: "Defect",
      nameZh: "缺陷处理",
      priorityWave: "P2",
      sequence: 999,
      enabled: true
    }
  ]);
  assert.deepEqual(chainStatus, {
    Defect: {
      stage: "PENDING",
      updatedAt: null,
      summary: "缺陷专用容器链，默认空闲，等待缺陷进入"
    }
  });
  assert.deepEqual(chineseNames, {
    Defect: "缺陷处理"
  });
  assert.equal(defectWorkItem.chainId, "Defect");
  assert.equal(defectWorkItem.mode, "hold");
  assert.equal(defectWorkItem.currentTask, "等待缺陷进入并由主控派发当前唯一缺陷任务");
  assert.equal(defectWorkItem.sourceChainId, null);
  assert.deepEqual(defectWorkItem.verificationScope, []);
});

test("createDemandSourceByName blocks when matching demand doc does not exist", async () => {
  const fixture = await makeFixture();

  await assert.rejects(
    () => createDemandSourceByName({
      projectRoot: fixture.projectRoot,
      shareRoot: fixture.shareRoot,
      mapsRoot: fixture.mapsRoot,
      reviewsRoot: fixture.reviewsRoot,
      codeListsRoot: fixture.codeListsRoot,
      demandTemplatesRoot: fixture.demandTemplatesRoot,
      worktreesRoot: fixture.worktreesRoot,
      demandName: "不存在的需求"
    }),
    { message: "未找到需求源文件：不存在的需求。请先创建 `Projects/飞枢系统/不存在的需求.md`（或 `Projects/飞枢系统/demands/templates/不存在的需求.md`），再点击“新建需求源”。" }
  );
});
