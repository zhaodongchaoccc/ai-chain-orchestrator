import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getWorkspacePaths, loadWorkspaceRegistry } from "./workspace-registry";

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-workspace-registry-"));
  const shareRoot = path.join(projectRoot, "share");
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const mapsRoot = path.join(projectRoot, "Maps");
  const reviewsRoot = path.join(projectRoot, "Reviews");
  const consoleRoot = path.join(projectRoot, "Console");

  await Promise.all([
    mkdir(shareRoot, { recursive: true }),
    mkdir(playbooksRoot, { recursive: true }),
    mkdir(mapsRoot, { recursive: true }),
    mkdir(reviewsRoot, { recursive: true }),
    mkdir(consoleRoot, { recursive: true })
  ]);

  return {
    projectRoot,
    consoleRoot,
    serverRoot: path.join(consoleRoot, "server"),
    webRoot: path.join(consoleRoot, "web"),
    shareRoot,
    actionEventsPath: path.join(shareRoot, "action-events.jsonl"),
    playbooksRoot,
    mapsRoot,
    reviewsRoot,
    notificationsRoot: path.join(shareRoot, "notifications"),
    specsRoot: path.join(projectRoot, "Specs"),
    plansRoot: path.join(projectRoot, "Plans")
  };
}

test("loadWorkspaceRegistry falls back to source-scoped newfee when workspaces.json is missing", async () => {
  const paths = await makeFixture();

  const workspaces = await loadWorkspaceRegistry(paths);

  assert.deepEqual(workspaces, [
    {
      sourceId: "newfee",
      label: "newfee",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/newfee.md",
      worktreePath: null,
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);
});

test("loadWorkspaceRegistry prefers project-status.json over workspaces.json", async () => {
  const paths = await makeFixture();

  await writeJson(path.join(paths.shareRoot, "project-status.json"), {
    repos: {
      backend: {
        path: "~/ff",
        worktreesBase: "~/ff-worktrees"
      }
    },
    requirements: [
      {
        id: "req-a3136763",
        title: "风险预警已欠费状态数据",
        status: "active",
        docPath: "Projects/飞枢系统/05-需求/req-a3136763/风险预警已欠费状态数据.md",
        kind: "single",
        worktreePath: "/tmp/req-a3136763"
      }
    ]
  });

  await writeJson(path.join(paths.shareRoot, "workspaces.json"), [
    {
      sourceId: "legacy",
      label: "legacy",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/legacy.md",
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);

  const workspaces = await loadWorkspaceRegistry(paths);

  assert.deepEqual(workspaces, [
    {
      sourceId: "req-a3136763",
      label: "风险预警已欠费状态数据",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/05-需求/req-a3136763/风险预警已欠费状态数据.md",
      worktreePath: "/tmp/req-a3136763",
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);
});

test("loadWorkspaceRegistry ignores legacyRoot and parses sourceDocPath", async () => {
  const paths = await makeFixture();

  await writeJson(path.join(paths.shareRoot, "workspaces.json"), [
    {
      sourceId: "newfee",
      label: "newfee",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/newfee.md",
      legacyRoot: true
    },
    {
      sourceId: "req-b",
      label: "B需求",
      kind: "single",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/B需求.md",
      legacyRoot: false,
      draftIncomplete: true
    }
  ]);

  const workspaces = await loadWorkspaceRegistry(paths);

  assert.equal(workspaces[0]?.sourceId, "newfee");
  assert.equal(workspaces[0]?.legacyRoot, false);
  assert.equal(workspaces[1]?.sourceId, "req-b");
  assert.equal(workspaces[1]?.sourceDocPath, "Projects/飞枢系统/B需求.md");
  assert.equal(workspaces[1]?.legacyRoot, false);
  assert.equal(workspaces[1]?.draftIncomplete, true);
});

test("loadWorkspaceRegistry falls back to default workspace when all rows are invalid", async () => {
  const paths = await makeFixture();

  await writeJson(path.join(paths.shareRoot, "workspaces.json"), [
    { sourceId: "   ", label: "broken" },
    { label: "still broken" }
  ]);

  const workspaces = await loadWorkspaceRegistry(paths);

  assert.deepEqual(workspaces, [
    {
      sourceId: "newfee",
      label: "newfee",
      kind: "combined",
      enabled: true,
      sourceDocPath: "Projects/飞枢系统/newfee.md",
      worktreePath: null,
      legacyRoot: false,
      draftIncomplete: false
    }
  ]);
});

test("getWorkspacePaths maps every workspace into source-scoped roots and keeps index global", async () => {
  const paths = await makeFixture();

  const newfeePaths = getWorkspacePaths(paths, {
    sourceId: "newfee",
    label: "newfee",
    kind: "combined",
    enabled: true,
    sourceDocPath: "Projects/飞枢系统/newfee.md",
    legacyRoot: false,
    draftIncomplete: false
  });

  const reqBPaths = getWorkspacePaths(paths, {
    sourceId: "req-b",
    label: "B需求",
    kind: "single",
    enabled: true,
    sourceDocPath: "Projects/飞枢系统/B需求.md",
    legacyRoot: false,
    draftIncomplete: false
  });

  assert.equal(newfeePaths.shareRoot, path.join(paths.shareRoot, "sources", "newfee"));
  assert.equal(newfeePaths.actionEventsPath, path.join(paths.shareRoot, "sources", "newfee", "action-events.jsonl"));
  assert.equal(newfeePaths.mapsRoot, path.join(paths.mapsRoot, "newfee"));
  assert.equal(newfeePaths.reviewsRoot, path.join(paths.reviewsRoot, "newfee"));
  assert.equal(newfeePaths.notificationsRoot, path.join(paths.shareRoot, "sources", "newfee", "notifications"));
  assert.equal(newfeePaths.workspacesIndexPath, path.join(paths.shareRoot, "workspaces.json"));
  assert.equal(reqBPaths.shareRoot, path.join(paths.shareRoot, "sources", "req-b"));
  assert.equal(reqBPaths.actionEventsPath, path.join(paths.shareRoot, "sources", "req-b", "action-events.jsonl"));
  assert.equal(reqBPaths.mapsRoot, path.join(paths.mapsRoot, "req-b"));
  assert.equal(reqBPaths.reviewsRoot, path.join(paths.reviewsRoot, "req-b"));
  assert.equal(reqBPaths.notificationsRoot, path.join(paths.shareRoot, "sources", "req-b", "notifications"));
  assert.equal(reqBPaths.workspacesIndexPath, path.join(paths.shareRoot, "workspaces.json"));
});
