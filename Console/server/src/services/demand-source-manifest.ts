import { createHash } from "node:crypto";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import type { WorkspaceRegistryEntry } from "../../../shared/event-model";
import { toWorkspaceRelativeWorktreePath } from "./workspace-registry";

export class DemandSourceManifestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface LocatedDemandSourceDoc {
  filePath: string;
  relativePath: string;
}

interface UpsertDemandSourceManifestOptions {
  projectRoot: string;
  shareRoot: string;
  worktreesRoot: string;
  demandName: string;
  sourceDocPath: string;
  kind: WorkspaceRegistryEntry["kind"];
  draftIncomplete: boolean;
}

const ROOT_LEVEL_LOCATOR = (projectRoot: string, demandName: string) => ({
  filePath: path.join(projectRoot, `${demandName}.md`),
  relativePath: `Projects/飞枢系统/${demandName}.md`
});

const TEMPLATE_LEVEL_LOCATOR = (projectRoot: string, demandName: string) => ({
  filePath: path.join(projectRoot, "05-需求", "templates", `${demandName}.md`),
  relativePath: `Projects/飞枢系统/05-需求/templates/${demandName}.md`
});

export async function locateDemandSourceDoc(projectRoot: string, demandName: string): Promise<LocatedDemandSourceDoc> {
  for (const candidate of [ROOT_LEVEL_LOCATOR(projectRoot, demandName), TEMPLATE_LEVEL_LOCATOR(projectRoot, demandName)]) {
    try {
      await readFile(candidate.filePath, "utf8");
      return candidate;
    } catch {
      // continue
    }
  }

  throw new DemandSourceManifestError(404, buildMissingDemandSourceDocMessage(demandName));
}

function buildMissingDemandSourceDocMessage(demandName: string) {
  return `未找到需求源文件：${demandName}。请先创建 \`Projects/飞枢系统/${demandName}.md\`（或 \`Projects/飞枢系统/05-需求/templates/${demandName}.md\`），再点击“新建需求源”。`;
}

export async function upsertWorkspaceManifestEntry(options: UpsertDemandSourceManifestOptions): Promise<WorkspaceRegistryEntry> {
  const filePath = path.join(options.shareRoot, "workspaces.json");
  const currentEntries = await readWorkspaceEntries(filePath);
  const sourceId = buildSourceId(options.demandName);
  const nextEntry: WorkspaceRegistryEntry = {
    sourceId,
    label: options.demandName,
    kind: options.kind,
    enabled: true,
    sourceDocPath: options.sourceDocPath,
    worktreePath: toWorkspaceRelativeWorktreePath(options.projectRoot, path.join(options.worktreesRoot, sourceId)),
    legacyRoot: false,
    draftIncomplete: options.draftIncomplete
  };

  const filtered = currentEntries.filter((entry) => entry.sourceDocPath !== options.sourceDocPath && entry.label !== options.demandName);
  const nextEntries = [...filtered, nextEntry];
  await writeFile(filePath, `${JSON.stringify(nextEntries, null, 2)}\n`, "utf8");
  return nextEntry;
}

async function readWorkspaceEntries(filePath: string): Promise<WorkspaceRegistryEntry[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as WorkspaceRegistryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSourceId(demandName: string) {
  if (/^[A-Za-z0-9_-]+$/u.test(demandName)) {
    return demandName.toLowerCase();
  }

  return `req-${createHash("sha1").update(demandName).digest("hex").slice(0, 8)}`;
}
