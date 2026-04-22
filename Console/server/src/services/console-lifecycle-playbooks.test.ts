import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const START_CONSOLE_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "start-console.sh");
const STOP_CONSOLE_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "stop-console.sh");
const RESTART_CONSOLE_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "restart-console.sh");
const RUN_CONSOLE_SERVER_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "run-console-server.sh");
const RUN_CONSOLE_SERVICE_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "run-console-service.sh");
const RUN_CONSOLE_WEB_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "run-console-web.sh");
const STATUS_CONSOLE_PATH = path.resolve(process.cwd(), "..", "..", "Playbooks", "status-console.sh");
const PLAYBOOK_TIMEOUT_MS = 30000;

async function writeExecutable(filePath: string, contents: string) {
  await writeFile(filePath, contents);
  await chmod(filePath, 0o755);
}

async function waitForFile(filePath: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await stat(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

async function waitForValueChange(readValue: () => Promise<string>, previous: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await readValue().catch(() => "");
    if (current && current !== previous) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for value to change from ${previous}`);
}

async function waitForListenerOnPort(port: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await execFile("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
      if (/LISTEN/.test(result.stdout)) {
        return result.stdout;
      }
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for listener on port ${port}`);
}

async function reservePort(): Promise<string> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to determine reserved port")));
        return;
      }
      const port = String(address.port);
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

test("console lifecycle playbooks write listener pids and restart replaces them", async () => {
  const homeRoot = await mkdtemp(path.join(os.tmpdir(), "ff-console-lifecycle-"));
  const projectRoot = path.join(homeRoot, "PasObsidian", "Projects", "ff");
  const serverBinDir = path.join(projectRoot, "Console", "server", "node_modules", ".bin");
  const webBinDir = path.join(projectRoot, "Console", "web", "node_modules", ".bin");
  const playbooksDir = path.join(projectRoot, "Playbooks");
  const sandboxStartPath = path.join(playbooksDir, "start-console.sh");
  const sandboxStopPath = path.join(playbooksDir, "stop-console.sh");
  const sandboxRestartPath = path.join(playbooksDir, "restart-console.sh");
  const sandboxRunServerPath = path.join(playbooksDir, "run-console-server.sh");
  const sandboxRunServicePath = path.join(playbooksDir, "run-console-service.sh");
  const sandboxRunWebPath = path.join(playbooksDir, "run-console-web.sh");
  const sandboxStatusPath = path.join(playbooksDir, "status-console.sh");
  const pidFileServer = path.join(playbooksDir, "console-server.pid");
  const pidFileWeb = path.join(playbooksDir, "console-web.pid");
  const runtimePidFile = path.join(playbooksDir, "console-server-runtime.pid");
  const webRuntimePidFile = path.join(playbooksDir, "console-web-runtime.pid");
  const serverPort = await reservePort();
  const webPort = await reservePort();

  await Promise.all([
    mkdir(serverBinDir, { recursive: true }),
    mkdir(webBinDir, { recursive: true }),
    mkdir(playbooksDir, { recursive: true })
  ]);

  await writeExecutable(sandboxStartPath, await readFile(START_CONSOLE_PATH, "utf8"));
  await writeExecutable(sandboxStopPath, await readFile(STOP_CONSOLE_PATH, "utf8"));
  await writeExecutable(sandboxRestartPath, await readFile(RESTART_CONSOLE_PATH, "utf8"));
  await writeExecutable(sandboxRunServerPath, await readFile(RUN_CONSOLE_SERVER_PATH, "utf8"));
  await writeExecutable(sandboxRunServicePath, await readFile(RUN_CONSOLE_SERVICE_PATH, "utf8"));
  await writeExecutable(sandboxRunWebPath, await readFile(RUN_CONSOLE_WEB_PATH, "utf8"));
  await writeExecutable(sandboxStatusPath, await readFile(STATUS_CONSOLE_PATH, "utf8"));

  await writeExecutable(
    path.join(serverBinDir, "tsx"),
    `#!/usr/bin/env bash
set -euo pipefail
        RUNTIME_PID_FILE="\${FF_CONSOLE_RUNTIME_PID_FILE:?FF_CONSOLE_RUNTIME_PID_FILE is required}"
printf '%s\n' "$$" > "$RUNTIME_PID_FILE"
exec python3 -m http.server "$FF_CONSOLE_PORT" --bind "\${FF_CONSOLE_HOST:-127.0.0.1}"
`
  );
  await writeExecutable(
    path.join(webBinDir, "vite"),
    `#!/usr/bin/env bash
set -euo pipefail
port="\${FF_CONSOLE_WEB_PORT:-4173}"
exec python3 -m http.server "$port" --bind "\${FF_CONSOLE_HOST:-127.0.0.1}"
`
  );

  const env = {
    ...process.env,
    HOME: homeRoot,
    FF_CONSOLE_HOST: "127.0.0.1",
    FF_CONSOLE_PORT: serverPort,
    FF_CONSOLE_WEB_PORT: webPort,
  };

  try {
    await execFile("bash", [sandboxStartPath], { env, cwd: projectRoot, timeout: PLAYBOOK_TIMEOUT_MS });
    await waitForFile(pidFileServer, 5000);
    await waitForFile(pidFileWeb, 5000);
    await waitForFile(runtimePidFile, 5000);
    await waitForFile(webRuntimePidFile, 5000);

    const firstServerPid = (await readFile(pidFileServer, "utf8")).trim();
    const firstWebPid = (await readFile(pidFileWeb, "utf8")).trim();
    const firstRuntimePid = (await readFile(runtimePidFile, "utf8")).trim();
    const firstWebRuntimePid = (await readFile(webRuntimePidFile, "utf8")).trim();

    assert.match(firstServerPid, /^\d+$/);
    assert.match(firstWebPid, /^\d+$/);
    assert.match(firstRuntimePid, /^\d+$/);
    assert.match(firstWebRuntimePid, /^\d+$/);
    assert.match(firstWebRuntimePid, /^\d+$/);

    const firstLsof = await execFile("lsof", ["-nP", `-iTCP:${serverPort}`, "-sTCP:LISTEN"]);
    assert.match(firstLsof.stdout, /LISTEN/);

    const firstWebLsof = await execFile("lsof", ["-nP", `-iTCP:${webPort}`, "-sTCP:LISTEN"]);
    assert.match(firstWebLsof.stdout, /LISTEN/);

    process.kill(Number(firstRuntimePid), "SIGTERM");
    process.kill(Number(firstWebRuntimePid), "SIGTERM");

    const restartedRuntimePid = await waitForValueChange(
      async () => (await readFile(runtimePidFile, "utf8")).trim(),
      firstRuntimePid,
      5000
    );
    const restartedWebRuntimePid = await waitForValueChange(
      async () => (await readFile(webRuntimePidFile, "utf8")).trim(),
      firstWebRuntimePid,
      5000
    );

    assert.notEqual(restartedRuntimePid, firstRuntimePid);
    assert.notEqual(restartedWebRuntimePid, firstWebRuntimePid);

    const restartedLsof = await waitForListenerOnPort(serverPort, 5000);
    assert.doesNotMatch(restartedLsof, new RegExp(`\\b${firstServerPid}\\b`));
    assert.match(restartedLsof, /LISTEN/);

    const restartedWebLsof = await waitForListenerOnPort(webPort, 5000);
    assert.doesNotMatch(restartedWebLsof, new RegExp(`\\b${firstWebPid}\\b`));
    assert.match(restartedWebLsof, /LISTEN/);

    const statusOutput = await execFile("bash", [sandboxStatusPath], { env, cwd: projectRoot, timeout: PLAYBOOK_TIMEOUT_MS });
    assert.match(statusOutput.stdout, /Console server: 运行中/);
    assert.match(statusOutput.stdout, /supervisor PID: \d+/);
    assert.match(statusOutput.stdout, new RegExp(`runtime PID: ${restartedRuntimePid}`));
    assert.match(statusOutput.stdout, new RegExp(`port: ${serverPort}`));
    assert.match(statusOutput.stdout, /Console web: 运行中/);
    assert.match(statusOutput.stdout, /supervisor PID: \d+/);
    assert.match(statusOutput.stdout, new RegExp(`runtime PID: ${restartedWebRuntimePid}`));
    assert.match(statusOutput.stdout, new RegExp(`port: ${webPort}`));

    await execFile("bash", [sandboxRestartPath], { env, cwd: projectRoot, timeout: PLAYBOOK_TIMEOUT_MS });

    const secondServerPid = (await readFile(pidFileServer, "utf8")).trim();
    const secondWebPid = (await readFile(pidFileWeb, "utf8")).trim();

    assert.notEqual(secondServerPid, firstServerPid);
    assert.notEqual(secondWebPid, firstWebPid);

    await execFile("bash", [sandboxStopPath], { env, cwd: projectRoot, timeout: PLAYBOOK_TIMEOUT_MS });

    await assert.rejects(() => stat(webRuntimePidFile), /ENOENT/);

    await assert.rejects(
      () => execFile("lsof", ["-nP", `-iTCP:${serverPort}`, "-sTCP:LISTEN"]),
      /Command failed/
    );
    await assert.rejects(
      () => execFile("lsof", ["-nP", `-iTCP:${webPort}`, "-sTCP:LISTEN"]),
      /Command failed/
    );
  } finally {
    await execFile("bash", [sandboxStopPath], { env, cwd: projectRoot, timeout: PLAYBOOK_TIMEOUT_MS }).catch(() => undefined);
    await rm(homeRoot, { recursive: true, force: true });
  }
});
