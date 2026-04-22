import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DemandSourceManifestError, locateDemandSourceDoc, upsertWorkspaceManifestEntry } from "./demand-source-manifest";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-demand-source-manifest-"));
  const shareRoot = path.join(projectRoot, "share");
  const templateRoot = path.join(projectRoot, "05-需求", "templates");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(templateRoot, { recursive: true })
  ]);

  await writeJson(path.join(shareRoot, "workspaces.json"), [
    {
      sourceId: "newfee",
      label: "newfee",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/05-需求/newfee/newfee.md",
      worktreePath: "/tmp/ff-worktrees/newfee",
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);

  return { projectRoot, shareRoot, templateRoot };
}

test("locateDemandSourceDoc finds root-level demand file by demand name", async () => {
  const fixture = await makeFixture();
  await writeFile(path.join(fixture.projectRoot, "B需求.md"), "# B需求\n");

  const doc = await locateDemandSourceDoc(fixture.projectRoot, "B需求");

  assert.equal(doc.relativePath, "Projects/飞枢系统/B需求.md");
  assert.equal(doc.filePath, path.join(fixture.projectRoot, "B需求.md"));
});

test("locateDemandSourceDoc falls back to template directory when root file is absent", async () => {
  const fixture = await makeFixture();
  await writeFile(path.join(fixture.templateRoot, "B需求.md"), "# B需求\n");

  const doc = await locateDemandSourceDoc(fixture.projectRoot, "B需求");

  assert.equal(doc.relativePath, "Projects/飞枢系统/05-需求/templates/B需求.md");
});

test("locateDemandSourceDoc blocks creation when no matching demand file exists", async () => {
  const fixture = await makeFixture();

  await assert.rejects(
    () => locateDemandSourceDoc(fixture.projectRoot, "不存在的需求"),
    (error: unknown) => {
      assert.equal(error instanceof DemandSourceManifestError, true);
      assert.equal((error as DemandSourceManifestError).message, "未找到需求源文件：不存在的需求。请先创建 `Projects/飞枢系统/不存在的需求.md`（或 `Projects/飞枢系统/05-需求/templates/不存在的需求.md`），再点击“新建需求源”。");
      return true;
    }
  );

  const workspaces = JSON.parse(await readFile(path.join(fixture.shareRoot, "workspaces.json"), "utf8"));
  assert.equal(workspaces.length, 1);
});

test("upsertWorkspaceManifestEntry writes sourceDocPath and generated sourceId into workspaces.json", async () => {
  const fixture = await makeFixture();
  const worktreesRoot = path.join(fixture.projectRoot, "ff-worktrees");

  const entry = await upsertWorkspaceManifestEntry({
    projectRoot: fixture.projectRoot,
    shareRoot: fixture.shareRoot,
    worktreesRoot,
    demandName: "B需求",
    sourceDocPath: "Projects/飞枢系统/B需求.md",
    kind: "single",
    draftIncomplete: false
  });

  const workspaces = JSON.parse(await readFile(path.join(fixture.shareRoot, "workspaces.json"), "utf8"));

  assert.equal(entry.label, "B需求");
  assert.equal(entry.kind, "single");
  assert.equal(entry.sourceDocPath, "Projects/飞枢系统/B需求.md");
  assert.equal(entry.worktreePath, path.join("ff-worktrees", entry.sourceId));
  assert.equal(workspaces[1].sourceDocPath, "Projects/飞枢系统/B需求.md");
  assert.equal(workspaces[1].worktreePath, path.join("ff-worktrees", entry.sourceId));
  assert.equal(workspaces[1].enabled, true);
  assert.match(workspaces[1].sourceId, /^req-[a-f0-9]{8}$/u);
});
