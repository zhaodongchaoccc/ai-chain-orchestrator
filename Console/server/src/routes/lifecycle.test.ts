import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Fastify from "fastify";

import { registerLifecycleRoutes } from "./lifecycle";

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents, "utf8");
  await chmod(filePath, 0o755);
}

async function makeFixture() {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "ff-lifecycle-route-"));
  const playbooksRoot = path.join(projectRoot, "Playbooks");
  const startRoot = path.join(playbooksRoot, "start");
  const binRoot = path.join(projectRoot, "bin");
  const callsPath = path.join(projectRoot, "calls.log");

  await Promise.all([
    mkdir(startRoot, { recursive: true }),
    mkdir(binRoot, { recursive: true })
  ]);

  const bashScript = (name: string) => `#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' '${name}' "$*" >> "${callsPath}"
printf '[OK] ${name}\n'
`;

  await Promise.all([
    writeExecutable(path.join(startRoot, "start-main-control-session.sh"), bashScript("start-main-control-session.sh")),
    writeExecutable(path.join(startRoot, "start-system-iteration-session.sh"), bashScript("start-system-iteration-session.sh")),
    writeExecutable(path.join(playbooksRoot, "resume-main-control-session.sh"), bashScript("resume-main-control-session.sh")),
    writeExecutable(path.join(playbooksRoot, "rotate-main-control-session.sh"), bashScript("rotate-main-control-session.sh")),
    writeExecutable(path.join(playbooksRoot, "resume-system-iteration-session.sh"), bashScript("resume-system-iteration-session.sh")),
    writeExecutable(path.join(playbooksRoot, "rotate-system-iteration-session.sh"), bashScript("rotate-system-iteration-session.sh")),
    writeExecutable(path.join(playbooksRoot, "start-source-main-control.sh"), bashScript("start-source-main-control.sh")),
    writeExecutable(path.join(playbooksRoot, "resume-source-main-control.sh"), bashScript("resume-source-main-control.sh")),
    writeExecutable(path.join(playbooksRoot, "rotate-source-main-control.sh"), bashScript("rotate-source-main-control.sh")),
    writeExecutable(path.join(playbooksRoot, "resume-chain-session.sh"), bashScript("resume-chain-session.sh")),
    writeExecutable(path.join(playbooksRoot, "rotate-chain-session.sh"), bashScript("rotate-chain-session.sh")),
    writeExecutable(path.join(binRoot, "osascript"), `#!/usr/bin/env bash
set -euo pipefail
printf 'osascript %s\n' "$*" >> "${callsPath}"
printf 'ok\n'
`)
  ]);

  return {
    projectRoot,
    playbooksRoot,
    shareRoot: path.join(projectRoot, "share"),
    consoleRoot: path.join(projectRoot, "Console"),
    serverRoot: path.join(projectRoot, "Console", "server"),
    webRoot: path.join(projectRoot, "Console", "web"),
    workspacesIndexPath: path.join(projectRoot, "share", "workspaces.json"),
    actionEventsPath: path.join(projectRoot, "share", "action-events.jsonl"),
    mapsRoot: path.join(projectRoot, "chain-assets", "地图"),
    codeListsRoot: path.join(projectRoot, "chain-assets", "代码清单"),
    reviewsRoot: path.join(projectRoot, "chain-assets", "波次总结"),
    notificationsRoot: path.join(projectRoot, "share", "notifications"),
    specsRoot: path.join(projectRoot, "04-控制台与方案", "设计文档"),
    plansRoot: path.join(projectRoot, "04-控制台与方案", "实施计划"),
    runtimePidPath: path.join(playbooksRoot, "console-server-runtime.pid"),
    binRoot,
    callsPath
  };
}

function buildServerWithRoutes(paths: Awaited<ReturnType<typeof makeFixture>>) {
  const server = Fastify();
  registerLifecycleRoutes(server, paths as any);
  return server;
}

test("main-control lifecycle routes call expected scripts", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);
  const previousPath = process.env.PATH;
  process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;

  try {
    const resume = await server.inject({ method: "POST", url: "/api/lifecycle/main-control/resume" });
    const rotate = await server.inject({ method: "POST", url: "/api/lifecycle/main-control/rotate" });
    const attach = await server.inject({ method: "POST", url: "/api/lifecycle/main-control/attach/open" });

    assert.equal(resume.statusCode, 200);
    assert.equal(rotate.statusCode, 200);
    assert.equal(attach.statusCode, 200);

    const calls = await readFile(fixture.callsPath, "utf8");
    assert.match(calls, /resume-main-control-session\.sh/);
    assert.match(calls, /rotate-main-control-session\.sh/);
    assert.match(calls, /osascript/);
    assert.match(attach.json().command, /tmux attach -t main-control/);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("source and chain lifecycle routes pass requirement and chain ids", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);
  const previousPath = process.env.PATH;
  process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;

  try {
    const sourceResume = await server.inject({ method: "POST", url: "/api/requirements/req-demo/main-control/resume" });
    const chainRotate = await server.inject({ method: "POST", url: "/api/requirements/req-demo/chains/DemoBackend/rotate" });

    assert.equal(sourceResume.statusCode, 200);
    assert.equal(chainRotate.statusCode, 200);

    const calls = await readFile(fixture.callsPath, "utf8");
    assert.match(calls, /resume-source-main-control\.sh req-demo/);
    assert.match(calls, /rotate-chain-session\.sh DemoBackend req-demo/);
  } finally {
    process.env.PATH = previousPath;
  }
});

test("system-iteration lifecycle routes use dedicated scripts", async () => {
  const fixture = await makeFixture();
  const server = buildServerWithRoutes(fixture);
  const previousPath = process.env.PATH;
  process.env.PATH = `${fixture.binRoot}:${previousPath ?? ""}`;

  try {
    const resume = await server.inject({ method: "POST", url: "/api/lifecycle/system-iteration/resume" });
    const rotate = await server.inject({ method: "POST", url: "/api/lifecycle/system-iteration/rotate" });

    assert.equal(resume.statusCode, 200);
    assert.equal(rotate.statusCode, 200);

    const calls = await readFile(fixture.callsPath, "utf8");
    assert.match(calls, /resume-system-iteration-session\.sh/);
    assert.match(calls, /rotate-system-iteration-session\.sh/);
  } finally {
    process.env.PATH = previousPath;
  }
});
