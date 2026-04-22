import path from "node:path";
import { existsSync } from "node:fs";

function looksLikeProjectRoot(candidate: string) {
  const required = ["share", "Playbooks"];
  return required.every((segment) => existsSync(path.join(candidate, segment)));
}

export function resolveProjectRoot(fromDir: string) {
  const candidates = [
    path.resolve(fromDir, "../../.."),
    path.resolve(fromDir, "../../../.."),
    path.resolve(fromDir, "../../../../..")
  ];

  for (const candidate of candidates) {
    if (looksLikeProjectRoot(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

const projectRoot = resolveProjectRoot(__dirname);

export const ffPaths = {
  projectRoot,
  consoleRoot: path.join(projectRoot, "Console"),
  serverRoot: path.join(projectRoot, "Console", "server"),
  webRoot: path.join(projectRoot, "Console", "web"),
  playbooksRoot: path.join(projectRoot, "Playbooks"),
  shareRoot: path.join(projectRoot, "share"),
  workspacesIndexPath: path.join(projectRoot, "share", "workspaces.json"),
  actionEventsPath: path.join(projectRoot, "share", "action-events.jsonl"),
  mapsRoot: path.join(projectRoot, "03-业务链资产", "地图"),
  codeListsRoot: path.join(projectRoot, "03-业务链资产", "代码清单"),
  reviewsRoot: path.join(projectRoot, "03-业务链资产", "波次总结"),
  notificationsRoot: path.join(projectRoot, "share", "notifications"),
  specsRoot: path.join(projectRoot, "04-控制台与方案", "设计文档"),
  plansRoot: path.join(projectRoot, "04-控制台与方案", "实施计划"),
  runtimePidPath: path.join(projectRoot, "Playbooks", "console-server-runtime.pid")
} as const;

export const serverConfig = {
  apiVersion: "ff-console-api-v2",
  serverVersion: "0.1.0",
  startedAt: new Date().toISOString(),
  host: process.env.FF_CONSOLE_HOST ?? "127.0.0.1",
  port: Number(process.env.FF_CONSOLE_PORT ?? 8787),
  paths: ffPaths
} as const;
