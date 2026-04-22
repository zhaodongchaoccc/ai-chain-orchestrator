import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getRequirementDetail, listRequirementSummaries, updateChainStatus, writeInterfaceDoc } from "./project-status";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-project-status-"));
  const shareRoot = path.join(projectRoot, "share");
  const requirementDir = path.join(projectRoot, "demands", "req-demo");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(requirementDir, { recursive: true })
  ]);

  await writeFile(path.join(requirementDir, "演示需求.md"), [
    "# 演示需求",
    "",
    "背景：",
    "这是需求背景。",
    "",
    "期望结果：",
    "完成改造。",
    ""
  ].join("\n"), "utf8");

  await writeJson(path.join(shareRoot, "project-status.json"), {
    repos: {
      backend: { path: "~/ff", worktreesBase: "~/ff-worktrees" }
    },
    requirements: [
      {
        id: "req-demo",
        title: "演示需求",
        status: "active",
        createdAt: "2026-04-21T10:00:00.000Z",
        updatedAt: "2026-04-21T10:00:00.000Z",
        docPath: "Projects/飞枢系统/demands/req-demo/演示需求.md",
        chains: [
          {
            id: "DemoBackend",
            titleZh: "演示后端链",
            type: "backend",
            repoKey: "backend",
            status: "active",
            stage: "S1",
            session: "chain-req-demo-DemoBackend",
            updatedAt: "2026-04-21T10:00:00.000Z",
            summary: "处理中"
          }
        ]
      }
    ]
  });

  return { projectRoot, shareRoot, requirementDir };
}

test("listRequirementSummaries builds progress counters", async () => {
  const fixture = await makeFixture();
  const raw = JSON.parse(await readFile(path.join(fixture.shareRoot, "project-status.json"), "utf8"));

  const summaries = listRequirementSummaries(raw, ["chain-req-demo-DemoBackend"]);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.chainCount, 1);
  assert.equal(summaries[0]?.activeChainCount, 1);
  assert.equal(summaries[0]?.progressPercent, 0);
});

test("getRequirementDetail reads background and interface excerpt", async () => {
  const fixture = await makeFixture();
  await writeFile(path.join(fixture.requirementDir, "interface.md"), "# 接口约定\n\n- 请求字段：demo\n", "utf8");

  const detail = await getRequirementDetail(fixture.projectRoot, fixture.shareRoot, "req-demo", ["chain-req-demo-DemoBackend"]);

  assert.ok(detail);
  assert.match(detail?.background ?? "", /这是需求背景/);
  assert.match(detail?.interfaceExcerpt ?? "", /请求字段/);
  assert.equal(detail?.chains[0]?.sessionRunning, true);
});

test("updateChainStatus rewrites chain status in project-status.json", async () => {
  const fixture = await makeFixture();

  await updateChainStatus(fixture.shareRoot, "req-demo", "DemoBackend", {
    status: "done",
    stage: "S5",
    updatedAt: "2026-04-21T11:00:00.000Z",
    summary: "已完成"
  });

  const updated = JSON.parse(await readFile(path.join(fixture.shareRoot, "project-status.json"), "utf8"));
  const chain = updated.requirements[0].chains[0];
  assert.equal(chain.status, "done");
  assert.equal(chain.stage, "S5");
  assert.equal(chain.summary, "已完成");
});

test("writeInterfaceDoc writes interface.md beside requirement doc", async () => {
  const fixture = await makeFixture();

  const outputPath = await writeInterfaceDoc(fixture.projectRoot, "Projects/飞枢系统/demands/req-demo/演示需求.md", "# 接口约定\n\n- demo");

  assert.equal(outputPath, path.join(fixture.projectRoot, "demands", "req-demo", "interface.md"));
  const written = await readFile(outputPath, "utf8");
  assert.match(written, /接口约定/);
});
