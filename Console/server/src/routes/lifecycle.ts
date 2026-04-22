import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { FastifyInstance } from "fastify";

import type { ffPaths } from "../config";

const execFileAsync = promisify(execFile);

function detectPlatform(): "macos" | "wsl2" | "linux" {
  if (process.platform === "darwin") {
    return "macos";
  }
  if (process.platform === "linux") {
    try {
      const version = readFileSync("/proc/version", "utf8").toLowerCase();
      if (version.includes("microsoft")) {
        return "wsl2";
      }
    } catch {
      // ignore
    }
  }
  return "linux";
}

export function registerLifecycleRoutes(server: FastifyInstance, paths: typeof ffPaths) {
  server.post("/api/lifecycle/main-control/start", async () => runBash(paths, path.join(paths.projectRoot, "Playbooks", "start", "start-main-control-session.sh"), ["--resume"]));
  server.post("/api/lifecycle/main-control/resume", async () => runBash(paths, path.join(paths.projectRoot, "Playbooks", "resume-main-control-session.sh")));
  server.post("/api/lifecycle/main-control/rotate", async () => runBash(paths, path.join(paths.projectRoot, "Playbooks", "rotate-main-control-session.sh")));
  server.post("/api/lifecycle/main-control/attach/open", async () => openTerminal("main-control", paths));

  server.post("/api/lifecycle/system-iteration/start", async () => runBash(paths, path.join(paths.projectRoot, "Playbooks", "start", "start-system-iteration-session.sh")));
  server.post("/api/lifecycle/system-iteration/resume", async () => runBash(paths, path.join(paths.projectRoot, "Playbooks", "resume-system-iteration-session.sh")));
  server.post("/api/lifecycle/system-iteration/rotate", async () => runBash(paths, path.join(paths.projectRoot, "Playbooks", "rotate-system-iteration-session.sh")));
  server.post("/api/lifecycle/system-iteration/attach/open", async () => openTerminal("system-iteration", paths));

  server.post<{ Params: { id: string } }>("/api/requirements/:id/main-control/start", async (request) => runBash(paths, path.join(paths.projectRoot, "Playbooks", "start-source-main-control.sh"), [request.params.id]));
  server.post<{ Params: { id: string } }>("/api/requirements/:id/main-control/resume", async (request) => runBash(paths, path.join(paths.projectRoot, "Playbooks", "resume-source-main-control.sh"), [request.params.id]));
  server.post<{ Params: { id: string } }>("/api/requirements/:id/main-control/rotate", async (request) => runBash(paths, path.join(paths.projectRoot, "Playbooks", "rotate-source-main-control.sh"), [request.params.id]));
  server.post<{ Params: { id: string } }>("/api/requirements/:id/main-control/attach/open", async (request) => openTerminal(`main-control-${request.params.id}`, paths));

  server.post<{ Params: { id: string; chainId: string } }>("/api/requirements/:id/chains/:chainId/resume", async (request) => runBash(paths, path.join(paths.projectRoot, "Playbooks", "resume-chain-session.sh"), [request.params.chainId, request.params.id]));
  server.post<{ Params: { id: string; chainId: string } }>("/api/requirements/:id/chains/:chainId/rotate", async (request) => runBash(paths, path.join(paths.projectRoot, "Playbooks", "rotate-chain-session.sh"), [request.params.chainId, request.params.id]));
}

async function runBash(paths: typeof ffPaths, scriptPath: string, args: string[] = []) {
  const { stdout, stderr } = await execFileAsync("bash", [scriptPath, ...args], { cwd: paths.projectRoot, env: process.env });
  return { success: true, stdout, stderr };
}

async function openTerminal(sessionName: string, paths: typeof ffPaths) {
  const command = `tmux attach -t ${sessionName}`;
  const platform = detectPlatform();
  if (platform === "macos") {
    const { stdout, stderr } = await execFileAsync("osascript", ["-e", 'tell application "Terminal" to activate', "-e", `tell application "Terminal" to do script "${command}"`], { cwd: paths.projectRoot, env: process.env });
    return { success: true, command, stdout, stderr };
  }
  // WSL2 / Linux: return command for manual copy-paste instead of auto-launch
  return { success: true, command, stdout: "", stderr: "" };
}
