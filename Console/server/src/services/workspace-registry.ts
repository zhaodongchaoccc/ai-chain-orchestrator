import path from "node:path";

import type { WorkspaceRegistryEntry } from "../../../shared/event-model";
import { readJsonFileSafe } from "../lib/fs-utils";
import { hasProjectStatusData, loadProjectStatus, projectStatusToWorkspaceEntries } from "./project-status";
import type { ControlPlanePaths } from "./state-loader";

export interface WorkspacePaths extends ControlPlanePaths {
  actionEventsPath: string;
  codeListsRoot: string;
  consoleRoot: string;
  serverRoot: string;
  webRoot: string;
  workspacesIndexPath: string;
  specsRoot: string;
  plansRoot: string;
  runtimePidPath: string;
  sourceId: string;
  label: string;
  sourceDocPath: string;
  worktreePath: string | null;
  kind: WorkspaceRegistryEntry["kind"];
  legacyRoot: boolean;
  draftIncomplete: boolean;
}

const DEFAULT_WORKSPACE: WorkspaceRegistryEntry = {
  sourceId: "demo",
  label: "Demo Project",
  kind: "single",
  enabled: true,
  sourceDocPath: "README.md",
  worktreePath: null,
  legacyRoot: false,
  draftIncomplete: false
};

interface RegistryBasePaths extends ControlPlanePaths {
  consoleRoot?: string;
  serverRoot?: string;
  webRoot?: string;
  workspacesIndexPath?: string;
  specsRoot?: string;
  plansRoot?: string;
  runtimePidPath?: string;
}

function getVaultRoot(projectRoot: string) {
  const resolved = path.resolve(projectRoot);
  const expectedSuffix = path.sep + "Projects" + path.sep + "飞枢系统";
  if (resolved.endsWith(expectedSuffix)) {
    return path.resolve(resolved, "../..");
  }
  return resolved;
}

export function resolveWorkspaceWorktreePath(projectRoot: string, worktreePath: string | null | undefined) {
  if (!worktreePath) {
    return null;
  }
  const trimmed = worktreePath.trim();
  if (!trimmed) {
    return null;
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return path.resolve(getVaultRoot(projectRoot), trimmed);
}

export function toWorkspaceRelativeWorktreePath(projectRoot: string, worktreePath: string | null | undefined) {
  if (!worktreePath) {
    return null;
  }
  const trimmed = worktreePath.trim();
  if (!trimmed) {
    return null;
  }
  const absolute = path.isAbsolute(trimmed) ? trimmed : path.resolve(getVaultRoot(projectRoot), trimmed);
  const relative = path.relative(getVaultRoot(projectRoot), absolute);
  return relative.split(path.sep).join("/");
}

export async function loadWorkspaceRegistry(paths: RegistryBasePaths): Promise<WorkspaceRegistryEntry[]> {
  const projectStatusResult = await loadProjectStatus(paths.shareRoot);
  if (projectStatusResult.readable && hasProjectStatusData(projectStatusResult.value)) {
    const workspaces = projectStatusToWorkspaceEntries(projectStatusResult.value);
    if (workspaces.length > 0) {
      return workspaces;
    }
  }

  const filePath = path.join(paths.shareRoot, "workspaces.json");
  const result = await readJsonFileSafe<WorkspaceRegistryEntry[]>(filePath, [DEFAULT_WORKSPACE]);

  if (!Array.isArray(result.value) || result.value.length === 0) {
    return [DEFAULT_WORKSPACE];
  }

  const normalized = result.value
    .filter((entry) => typeof entry?.sourceId === "string" && entry.sourceId.trim().length > 0)
    .map((entry) => normalizeWorkspaceEntry(entry));

  return normalized.length > 0 ? normalized : [DEFAULT_WORKSPACE];
}

export function getWorkspacePaths(paths: RegistryBasePaths, workspace: WorkspaceRegistryEntry): WorkspacePaths {
  const scopedShareRoot = path.join(paths.shareRoot, "sources", workspace.sourceId);

  return {
    projectRoot: paths.projectRoot,
    consoleRoot: paths.consoleRoot ?? path.join(paths.projectRoot, "Console"),
    serverRoot: paths.serverRoot ?? path.join(paths.projectRoot, "Console", "server"),
    webRoot: paths.webRoot ?? path.join(paths.projectRoot, "Console", "web"),
    shareRoot: scopedShareRoot,
    workspacesIndexPath: paths.workspacesIndexPath ?? path.join(paths.shareRoot, "workspaces.json"),
    actionEventsPath: path.join(scopedShareRoot, "action-events.jsonl"),
    playbooksRoot: paths.playbooksRoot,
    mapsRoot: path.join(paths.mapsRoot, workspace.sourceId),
    codeListsRoot: path.join(paths.projectRoot, "03-业务链资产", "代码清单", workspace.sourceId),
    reviewsRoot: path.join(paths.reviewsRoot, workspace.sourceId),
    notificationsRoot: path.join(scopedShareRoot, "notifications"),
    specsRoot: paths.specsRoot ?? path.join(paths.projectRoot, "Specs"),
    plansRoot: paths.plansRoot ?? path.join(paths.projectRoot, "Plans"),
    runtimePidPath: paths.runtimePidPath ?? path.join(paths.playbooksRoot, "console-server-runtime.pid"),
    sourceId: workspace.sourceId,
    label: workspace.label,
    sourceDocPath: workspace.sourceDocPath,
    worktreePath: resolveWorkspaceWorktreePath(paths.projectRoot, workspace.worktreePath),
    kind: workspace.kind,
    legacyRoot: false,
    draftIncomplete: workspace.draftIncomplete
  };
}

function normalizeWorkspaceEntry(entry: Partial<WorkspaceRegistryEntry>): WorkspaceRegistryEntry {
  return {
    sourceId: entry.sourceId?.trim() || DEFAULT_WORKSPACE.sourceId,
    label: entry.label?.trim() || entry.sourceId?.trim() || DEFAULT_WORKSPACE.label,
    kind: entry.kind === "single" ? "single" : "combined",
    enabled: entry.enabled !== false,
    sourceDocPath: entry.sourceDocPath?.trim() || DEFAULT_WORKSPACE.sourceDocPath,
    worktreePath: typeof entry.worktreePath === "string" && entry.worktreePath.trim().length > 0 ? entry.worktreePath.trim() : null,
    legacyRoot: false,
    draftIncomplete: entry.draftIncomplete === true
  };
}
