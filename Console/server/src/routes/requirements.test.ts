import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Fastify from "fastify";

import { registerRequirementRoutes, registerSessionRoutes } from "./requirements";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-requirements-route-"));
  const shareRoot = path.join(projectRoot, "share");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const requirementDir = path.join(projectRoot, "05-需求", "req-demo");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(requirementDir, { recursive: true })
  ]);

  await writeFile(path.join(requirementDir, "演示需求.md"), [
    "# 演示需求",
    "",
    "背景：",
    "这是演示需求背景。",
    "",
    "期望结果：",
    "完成演示需求改造。",
    ""
  ].join("\n"), "utf8");

  await writeJson(path.join(shareRoot, "project-status.json"), {
    repos: {
      backend: { path: "~/ff", worktreesBase: "~/ff-worktrees" },
      frontend: { path: "~/ccweb/saas-cc-web-ydzee", worktreesBase: "~/ccweb-worktrees" }
    },
    requirements: [
      {
        id: "req-demo",
        title: "演示需求",
        status: "active",
        docPath: "Projects/飞枢系统/05-需求/req-demo/演示需求.md",
        kind: "single",
        chains: [
          {
            id: "DemoBackend",
            titleZh: "演示后端链",
            type: "backend",
            repoKey: "backend",
            branch: "feature/req-demo-backend",
            status: "active",
            stage: "S1",
            session: "chain-req-demo-DemoBackend",
            updatedAt: "2026-04-21T10:00:00.000Z",
            summary: "处理中"
          },
          {
            id: "Defect",
            titleZh: "缺陷处理",
            type: "backend",
            repoKey: "backend",
            branch: null,
            status: "idle",
            stage: "PENDING",
            session: "chain-req-demo-Defect",
            updatedAt: null,
            summary: "缺陷容器"
          }
        ]
      }
    ]
  });

  return {
    projectRoot,
    shareRoot,
    playbooksRoot,
    consoleRoot: path.join(projectRoot, "Console"),
    serverRoot: path.join(projectRoot, "Console", "server"),
    webRoot: path.join(projectRoot, "Console", "web"),
    workspacesIndexPath: path.join(shareRoot, "workspaces.json"),
    actionEventsPath: path.join(shareRoot, "action-events.jsonl"),
    mapsRoot: path.join(projectRoot, "03-业务链资产", "地图"),
    codeListsRoot: path.join(projectRoot, "03-业务链资产", "代码清单"),
    reviewsRoot: path.join(projectRoot, "03-业务链资产", "波次总结"),
    notificationsRoot: path.join(shareRoot, "notifications"),
    specsRoot: path.join(projectRoot, "04-控制台与方案", "设计文档"),
    plansRoot: path.join(projectRoot, "04-控制台与方案", "实施计划"),
    runtimePidPath: path.join(playbooksRoot, "console-server-runtime.pid")
  };
}

function buildServerWithRoutes(paths: Awaited<ReturnType<typeof makeFixture>>) {
  const server = Fastify();
  registerRequirementRoutes(server, paths as any);
  registerSessionRoutes(server);
  return server;
}

test("GET /api/requirements returns project-status-backed requirement summaries", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "GET", url: "/api/requirements" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.requirements.length, 1);
  assert.equal(payload.requirements[0].id, "req-demo");
  assert.equal(payload.requirements[0].chainCount, 2);
});

test("GET /api/requirements/:id returns requirement detail", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "GET", url: "/api/requirements/req-demo" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.id, "req-demo");
  assert.match(payload.background, /演示需求背景/);
  assert.equal(payload.chains.length, 2);
});

test("POST /api/requirements creates requirement doc and project-status entry", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({
    method: "POST",
    url: "/api/requirements",
    payload: {
      title: "新的收费需求",
      background: "这里是新增需求背景。"
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.requirement.title, "新的收费需求");

  const status = JSON.parse(await readFile(path.join(fixture.shareRoot, "project-status.json"), "utf8"));
  assert.equal(status.requirements.length, 2);
  const created = status.requirements.find((item: { title: string }) => item.title === "新的收费需求");
  assert.ok(created);

  const docRelative = created.docPath.replace(/^Projects\/飞枢系统\//u, "");
  const docContent = await readFile(path.join(fixture.projectRoot, docRelative), "utf8");
  assert.match(docContent, /这里是新增需求背景/);
});

test("POST /api/requirements/:id/decompose rewrites chains for empty requirements", async () => {
  const fixture = await makeFixture();
  const statusPath = path.join(fixture.shareRoot, "project-status.json");
  const status = JSON.parse(await readFile(statusPath, "utf8"));
  status.requirements[0].chains = [];
  await writeJson(statusPath, status);
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "POST", url: "/api/requirements/req-demo/decompose" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.success, true);
  assert.ok(payload.chains.length >= 1);

  const nextStatus = JSON.parse(await readFile(statusPath, "utf8"));
  assert.ok(nextStatus.requirements[0].chains.length >= 1);
});

test("POST /api/requirements/:id/interface-gen writes interface.md", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "POST", url: "/api/requirements/req-demo/interface-gen" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.success, true);
  const written = await readFile(path.join(fixture.projectRoot, "05-需求", "req-demo", "interface.md"), "utf8");
  assert.match(written, /接口约定/);
});

test("POST /api/requirements/:id/chains adds a manual chain under requirement", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({
    method: "POST",
    url: "/api/requirements/req-demo/chains",
    payload: {
      title: "演示前端链",
      type: "frontend",
      summary: "手动新增前端链"
    }
  });

  assert.equal(response.statusCode, 200);
  const nextStatus = JSON.parse(await readFile(path.join(fixture.shareRoot, "project-status.json"), "utf8"));
  assert.equal(nextStatus.requirements[0].chains.length, 3);
  assert.equal(nextStatus.requirements[0].chains.some((item: { titleZh: string }) => item.titleZh === "演示前端链"), true);
});

test("DELETE /api/requirements/:id removes requirement from project-status", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "DELETE", url: "/api/requirements/req-demo" });

  assert.equal(response.statusCode, 200);
  const payload = response.json();
  assert.equal(payload.success, true);
  assert.match(payload.archivePath, /06-归档/);
  const nextStatus = JSON.parse(await readFile(path.join(fixture.shareRoot, "project-status.json"), "utf8"));
  assert.equal(nextStatus.requirements.length, 0);

  const archiveContent = await readFile(payload.archivePath, "utf8");
  assert.match(archiveContent, /演示需求 归档总结/);
  assert.match(archiveContent, /业务交付结论/);

  await assert.rejects(() => readFile(path.join(fixture.projectRoot, "05-需求", "req-demo", "演示需求.md"), "utf8"));
});

test("GET /api/requirements/:id/chains/:chainId/attach returns attach command", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "GET", url: "/api/requirements/req-demo/chains/DemoBackend/attach" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().command, "tmux attach -t chain-req-demo-DemoBackend");
});

test("GET /api/sessions returns current tmux session projection", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);

  const response = await server.inject({ method: "GET", url: "/api/sessions" });

  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.json().sessions));
});
