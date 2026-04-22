import path from "node:path";
import { readdir } from "node:fs/promises";

import type { ChainId, ChainRegistryEntry, ChainResumePacket, ChainStageValue, ChainWorkItemDetail, ControlInboxItem, DefectItemRecord, DispatchQueueState, MainControlResumePacket, OrchestrationStateSnapshot, PersistedActionEvent, SchedulerStateFile, SourceRuntimePolicy, SourceRuntimeStateSnapshot, WorkItemMode } from "../../../shared/event-model";
import { readJsonFileSafe, readMarkdownFilesSafe, readTextFileSafe } from "../lib/fs-utils";
import { summarizeWatcherLog } from "../lib/log-parser";
import { listTmuxSessions as defaultListTmuxSessions } from "../lib/tmux-utils";
import type { HealthApiResponse } from "../types/overview";

interface ChainStatusRecord {
  stage?: string;
  updatedAt?: string | null;
  summary?: string;
  blocked?: boolean;
}

interface WorkItemRecord {
  mode?: string;
  currentTask?: string;
  expectedOutput?: string;
  allowedActions?: unknown;
  forbiddenActions?: unknown;
  lastVerifiedAt?: string | null;
  lastVerifiedBy?: string | null;
  updatedAt?: string | null;
  sourceChainId?: string | null;
  severity?: string | null;
  regression?: boolean | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  verificationScope?: unknown;
}

interface DefectItemFileRecord {
  itemId?: string;
  sourceChainId?: string;
  reason?: string;
  severity?: string | null;
  regression?: boolean | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  verificationScope?: unknown;
  createdAt?: string;
  createdBy?: string | null;
  status?: string;
  claimedBy?: string | null;
  claimedAt?: string | null;
  fixedAt?: string | null;
  verifiedAt?: string | null;
}

interface OrchestrationStateFile extends OrchestrationStateSnapshot {}

export interface ControlPlanePaths {
  projectRoot: string;
  shareRoot: string;
  actionEventsPath?: string;
  playbooksRoot: string;
  mapsRoot: string;
  reviewsRoot: string;
  notificationsRoot: string;
}

export interface LoadedNotification {
  id: string;
  timestamp: string | null;
  targetId: ChainId | null;
  title: string;
  summary: string;
}

export interface LoadedControlPlaneSources {
  workspace: {
    sourceId: string;
    legacyRoot: boolean;
  };
  registry: ChainRegistryEntry[];
  chainStatus: Record<string, ChainStatusRecord>;
  queue: DispatchQueueState;
  schedulerFile: SchedulerStateFile;
  chineseNames: Record<string, string>;
  tmuxSessions: string[];
  watcherPid: number | null;
  watcherLogSummary: string | null;
  notifications: LoadedNotification[];
  actionEvents: PersistedActionEvent[];
  mainControlResume: MainControlResumePacket | null;
  chainResumePackets: Partial<Record<string, ChainResumePacket>>;
  workItems: Record<string, ChainWorkItemDetail>;
  defectItems: Partial<Record<string, DefectItemRecord[]>>;
  mapPaths: string[];
  mapStages: Record<string, ChainStageValue | null>;
  reviewPaths: string[];
  manualSessionHolds: Record<string, string>;
  sourceRuntimeState: SourceRuntimeStateSnapshot | null;
  sourcePolicy: SourceRuntimePolicy | null;
  controlInboxItems: ControlInboxItem[];
  orchestrationState: OrchestrationStateSnapshot | null;
  healthChecks: HealthApiResponse["checks"];
  watcherAlive: boolean | null;
}

export interface StateLoaderDeps {
  listTmuxSessions?: () => Promise<string[]>;
  isProcessAlive?: (pid: number) => Promise<boolean>;
}

const DEFAULT_QUEUE: DispatchQueueState = {
  maxConcurrent: 0,
  pendingStart: [],
  nextCandidate: null,
  updatedAt: null
};

const DEFAULT_SCHEDULER_FILE: SchedulerStateFile = {
  desiredState: "paused",
  updatedAt: null,
  updatedBy: null
};

export async function loadControlPlaneSources(paths: ControlPlanePaths, deps: StateLoaderDeps = {}): Promise<LoadedControlPlaneSources> {
  const workspace = inferWorkspaceContext(paths.shareRoot);
  const scopedWorkspace = workspace.legacyRoot === false;
  const sessionsRoot = resolveSessionsRoot(paths.projectRoot, workspace, scopedWorkspace);
  const [
    registryResult,
    statusResult,
    queueResult,
    schedulerResult,
    namesResult,
    watcherPidResult,
    watcherLogResult,
    actionEventsResult,
    mainControlResumeResult,
    chainResumePacketsResult,
    workItemsResult,
    defectItemsResult,
    mapsResult,
    reviewsResult,
    notificationsResult,
    manualSessionHoldsResult,
    sourcePolicyResult,
    controlInboxResult,
    orchestrationStateResult,
    tmuxResult
  ] = await Promise.all([
    readJsonFileSafe<ChainRegistryEntry[]>(path.join(paths.shareRoot, "chain-registry.json"), []),
    readJsonFileSafe<Record<string, ChainStatusRecord>>(path.join(paths.shareRoot, "chain-status.json"), {}),
    readJsonFileSafe<DispatchQueueState>(path.join(paths.shareRoot, "dispatch-queue.json"), DEFAULT_QUEUE),
    readJsonFileSafe<SchedulerStateFile>(path.join(paths.shareRoot, "scheduler-state.json"), DEFAULT_SCHEDULER_FILE),
    readJsonFileSafe<Record<string, string>>(path.join(paths.shareRoot, "chinese-chain-names.json"), {}),
    scopedWorkspace ? Promise.resolve({ value: "", readable: true, detail: undefined }) : readTextFileSafe(path.join(paths.playbooksRoot, "dispatch-watcher.pid")),
    scopedWorkspace ? Promise.resolve({ value: "", readable: true, detail: undefined }) : readTextFileSafe(path.join(paths.playbooksRoot, "dispatch-watcher.log")),
    readTextFileSafe(paths.actionEventsPath ?? path.join(paths.shareRoot, "action-events.jsonl")),
    readJsonFileSafe<MainControlResumePacket | null>(path.join(sessionsRoot, "main-control-resume.json"), null),
    loadChainResumePacketsSafe(path.join(sessionsRoot, "chain-resume")),
    loadWorkItemsSafe(path.join(paths.shareRoot, "work-items")),
    loadDefectItemsSafe(path.join(paths.shareRoot, "defect-items")),
    readMarkdownFilesSafe(paths.mapsRoot, "Maps"),
    readMarkdownFilesSafe(paths.reviewsRoot, "Reviews"),
    readMarkdownFilesSafe(paths.notificationsRoot, "notifications"),
    readJsonFileSafe<Record<string, string>>(path.join(paths.shareRoot, "manual-session-holds.json"), {}),
    scopedWorkspace ? readJsonFileSafe<SourceRuntimePolicy | null>(path.join(paths.shareRoot, "policy.json"), null) : Promise.resolve({ value: null, readable: true, detail: undefined }),
    scopedWorkspace ? readTextFileSafe(path.join(paths.shareRoot, "control-inbox.jsonl")) : readTextFileSafe(path.join(paths.projectRoot, "share", "global", "control-inbox.jsonl")),
    readJsonFileSafe<OrchestrationStateFile | null>(path.join(paths.projectRoot, "share", "global", "orchestration-state.json"), null),
    safeListTmuxSessions(deps.listTmuxSessions ?? defaultListTmuxSessions)
  ]);

  const watcherPid = parsePid(watcherPidResult.value);
  const watcherAlive = watcherPid === null ? null : await safeIsProcessAlive(watcherPid, deps.isProcessAlive ?? defaultIsProcessAlive);

  return {
    workspace,
    registry: Array.isArray(registryResult.value) ? registryResult.value : [],
    chainStatus: statusResult.value,
    queue: normalizeQueue(queueResult.value),
    schedulerFile: normalizeSchedulerFile(schedulerResult.value),
    chineseNames: namesResult.value,
    tmuxSessions: tmuxResult.value,
    watcherPid,
    watcherAlive,
    watcherLogSummary: summarizeWatcherLog(watcherLogResult.value),
    notifications: notificationsResult.value.map((file) => parseNotification(file.name, file.content)),
    actionEvents: parseActionEvents(actionEventsResult.value),
    mainControlResume: mainControlResumeResult.value,
    chainResumePackets: chainResumePacketsResult.value,
    workItems: workItemsResult.value,
    defectItems: defectItemsResult.value,
    mapPaths: mapsResult.value.map((file) => file.relativePath),
    mapStages: parseMapStages(mapsResult.value),
    reviewPaths: reviewsResult.value.map((file) => file.relativePath),
    manualSessionHolds: manualSessionHoldsResult.value,
    sourceRuntimeState: scopedWorkspace ? (orchestrationStateResult.value?.sourceStates?.[workspace.sourceId] ?? null) : null,
    sourcePolicy: sourcePolicyResult.value,
    controlInboxItems: parseControlInbox(controlInboxResult.value),
    orchestrationState: orchestrationStateResult.value,
    healthChecks: {
      chainRegistry: { readable: registryResult.readable, detail: registryResult.detail },
      chainStatus: { readable: statusResult.readable, detail: statusResult.detail },
      dispatchQueue: { readable: queueResult.readable, detail: queueResult.detail },
      schedulerState: { readable: schedulerResult.readable, detail: schedulerResult.detail },
      chineseNames: { readable: namesResult.readable, detail: namesResult.detail },
      workItems: { readable: workItemsResult.readable, detail: workItemsResult.detail },
      notifications: { readable: notificationsResult.readable, detail: notificationsResult.detail },
      maps: { readable: mapsResult.readable, detail: mapsResult.detail },
      reviews: { readable: reviewsResult.readable, detail: reviewsResult.detail },
      tmux: { readable: tmuxResult.readable, detail: tmuxResult.detail },
      watcherPid: { readable: watcherPidResult.readable, detail: watcherPidResult.detail },
      watcherLog: { readable: watcherLogResult.readable, detail: watcherLogResult.detail }
    }
  };
}

function parseControlInbox(raw: string): ControlInboxItem[] {
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ControlInboxItem)
    .filter((item) => typeof item?.eventId === "string");
}

async function loadChainResumePacketsSafe(dirPath: string) {
  try {
    const names = (await readdir(dirPath)).filter((name) => name.endsWith(".json")).sort();
    const records = await Promise.all(
      names.map(async (name) => {
        const chainId = name.replace(/\.json$/u, "");
        const filePath = path.join(dirPath, name);
        const result = await readJsonFileSafe<ChainResumePacket | null>(filePath, null);
        return {
          chainId,
          readable: result.readable,
          detail: result.detail,
          value: result.value
        };
      })
    );
    const unreadable = records.filter((record) => !record.readable);
    const populatedRecords = records.filter((record): record is typeof record & { value: ChainResumePacket } => record.value !== null);

    return {
      readable: unreadable.length === 0,
      value: Object.fromEntries(populatedRecords.map((record) => [record.chainId, record.value])) as Partial<Record<string, ChainResumePacket>>,
      detail: unreadable[0]?.detail
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/ENOENT/u.test(detail)) {
      return { readable: true, value: {} as Partial<Record<string, ChainResumePacket>>, detail };
    }

    return { readable: false, value: {} as Partial<Record<string, ChainResumePacket>>, detail };
  }
}

async function loadWorkItemsSafe(dirPath: string) {
  try {
    const names = (await readdir(dirPath)).filter((name) => name.endsWith(".json")).sort();
    const records = await Promise.all(
      names.map(async (name) => {
        const chainId = name.replace(/\.json$/u, "");
        const filePath = path.join(dirPath, name);
        const result = await readJsonFileSafe<WorkItemRecord>(filePath, {});
        return {
          chainId,
          readable: result.readable,
          detail: result.detail,
          value: normalizeWorkItem(result.value)
        };
      })
    );
    const unreadable = records.filter((record) => !record.readable);

    return {
      readable: unreadable.length === 0,
      value: Object.fromEntries(records.map((record) => [record.chainId, record.value])),
      detail: unreadable[0]?.detail
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/ENOENT/u.test(detail)) {
      return { readable: true, value: {} as Record<string, ChainWorkItemDetail>, detail };
    }

    return { readable: false, value: {} as Record<string, ChainWorkItemDetail>, detail };
  }
}

async function loadDefectItemsSafe(dirPath: string) {
  try {
    const names = (await readdir(dirPath)).filter((name) => name.endsWith(".json")).sort();
    const records = await Promise.all(
      names.map(async (name) => {
        const filePath = path.join(dirPath, name);
        const result = await readJsonFileSafe<DefectItemFileRecord>(filePath, {});
        return {
          readable: result.readable,
          detail: result.detail,
          value: normalizeDefectItem(name.replace(/\.json$/u, ""), result.value)
        };
      })
    );
    const unreadable = records.filter((record) => !record.readable);

    return {
      readable: unreadable.length === 0,
      value: records.length > 0 ? ({ Defect: records.map((record) => record.value) } as Partial<Record<string, DefectItemRecord[]>>) : {},
      detail: unreadable[0]?.detail
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/ENOENT/u.test(detail)) {
      return { readable: true, value: {} as Partial<Record<string, DefectItemRecord[]>>, detail };
    }

    return { readable: false, value: {} as Partial<Record<string, DefectItemRecord[]>>, detail };
  }
}

function normalizeWorkItem(input: WorkItemRecord): ChainWorkItemDetail {
  const mode = normalizeWorkItemMode(input.mode);
  return {
    mode,
    currentTask: typeof input.currentTask === "string" && input.currentTask.trim() ? input.currentTask.trim() : defaultWorkItemTask(mode),
    recoverable: mode === "active",
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : null,
    expectedOutput: typeof input.expectedOutput === "string" ? input.expectedOutput : null,
    allowedActions: normalizeStringList(input.allowedActions),
    forbiddenActions: normalizeStringList(input.forbiddenActions),
    lastVerifiedAt: typeof input.lastVerifiedAt === "string" ? input.lastVerifiedAt : null,
    lastVerifiedBy: typeof input.lastVerifiedBy === "string" ? input.lastVerifiedBy : null,
    sourceChainId: typeof input.sourceChainId === "string" && input.sourceChainId.trim() ? input.sourceChainId.trim() : null,
    severity: typeof input.severity === "string" && input.severity.trim() ? input.severity.trim() : null,
    regression: typeof input.regression === "boolean" ? input.regression : null,
    expectedBehavior: typeof input.expectedBehavior === "string" && input.expectedBehavior.trim() ? input.expectedBehavior.trim() : null,
    actualBehavior: typeof input.actualBehavior === "string" && input.actualBehavior.trim() ? input.actualBehavior.trim() : null,
    verificationScope: normalizeStringList(input.verificationScope)
  };
}

function normalizeWorkItemMode(mode: string | undefined): WorkItemMode {
  if (mode === "active" || mode === "hold" || mode === "blocked" || mode === "done" || mode === "escalate") {
    return mode;
  }

  return "escalate";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizeDefectItem(itemId: string, input: DefectItemFileRecord): DefectItemRecord {
  return {
    itemId,
    sourceChainId: typeof input.sourceChainId === "string" && input.sourceChainId.trim() ? input.sourceChainId.trim() : "unknown",
    reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : "待补充缺陷描述",
    severity: typeof input.severity === "string" && input.severity.trim() ? input.severity.trim() : null,
    regression: typeof input.regression === "boolean" ? input.regression : null,
    expectedBehavior: typeof input.expectedBehavior === "string" && input.expectedBehavior.trim() ? input.expectedBehavior.trim() : null,
    actualBehavior: typeof input.actualBehavior === "string" && input.actualBehavior.trim() ? input.actualBehavior.trim() : null,
    verificationScope: normalizeStringList(input.verificationScope),
    createdAt: typeof input.createdAt === "string" && input.createdAt.trim() ? input.createdAt.trim() : "",
    createdBy: typeof input.createdBy === "string" && input.createdBy.trim() ? input.createdBy.trim() : null,
    status: input.status === "claimed" || input.status === "fixed" || input.status === "verified" ? input.status : "open",
    claimedBy: typeof input.claimedBy === "string" && input.claimedBy.trim() ? input.claimedBy.trim() : null,
    claimedAt: typeof input.claimedAt === "string" && input.claimedAt.trim() ? input.claimedAt.trim() : null,
    fixedAt: typeof input.fixedAt === "string" && input.fixedAt.trim() ? input.fixedAt.trim() : null,
    verifiedAt: typeof input.verifiedAt === "string" && input.verifiedAt.trim() ? input.verifiedAt.trim() : null
  };
}

function defaultWorkItemTask(mode: WorkItemMode) {
  return {
    active: "继续当前唯一任务",
    hold: "保持挂起，等待恢复信号",
    blocked: "确认阻塞原因与恢复条件",
    done: "保持只读参考，不重新开工",
    escalate: "交回主控裁决当前动作"
  }[mode];
}

function isScopedWorkspace(shareRoot: string) {
  return /[\\/]share[\\/]sources[\\/]/u.test(shareRoot);
}

async function safeIsProcessAlive(pid: number, isProcessAlive: (pid: number) => Promise<boolean>) {
  try {
    return await isProcessAlive(pid);
  } catch {
    return false;
  }
}

async function defaultIsProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function safeListTmuxSessions(listTmuxSessions: () => Promise<string[]>) {
  try {
    return {
      readable: true,
      value: await listTmuxSessions()
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    if (/no server running/i.test(detail)) {
      return {
        readable: true,
        value: [] as string[],
        detail
      };
    }

    return {
      readable: false,
      value: [] as string[],
      detail
    };
  }
}

function normalizeQueue(queue: DispatchQueueState): DispatchQueueState {
  return {
    maxConcurrent: typeof queue?.maxConcurrent === "number" ? queue.maxConcurrent : 0,
    pendingStart: Array.isArray(queue?.pendingStart) ? queue.pendingStart : [],
    nextCandidate: queue?.nextCandidate ?? null,
    updatedAt: queue?.updatedAt ?? null
  };
}

function normalizeSchedulerFile(state: SchedulerStateFile): SchedulerStateFile {
  return {
    desiredState: state?.desiredState === "running" ? "running" : "paused",
    updatedAt: state?.updatedAt ?? null,
    updatedBy: state?.updatedBy ?? null
  };
}

function inferWorkspaceContext(shareRoot: string) {
  if (isScopedWorkspace(shareRoot)) {
    return {
      sourceId: path.basename(shareRoot),
      legacyRoot: false
    };
  }

  return {
    sourceId: "newfee",
    legacyRoot: true
  };
}

function resolveSessionsRoot(projectRoot: string, workspace: LoadedControlPlaneSources["workspace"], scopedWorkspace: boolean) {
  if (scopedWorkspace || workspace.sourceId === "newfee") {
    return path.join(projectRoot, "Sessions", "sources", workspace.sourceId);
  }

  return path.join(projectRoot, "Sessions");
}

function parsePid(rawPid: string): number | null {
  const trimmed = rawPid.trim();
  if (!trimmed) {
    return null;
  }

  const pid = Number.parseInt(trimmed, 10);
  return Number.isFinite(pid) ? pid : null;
}

function parseNotification(fileName: string, content: string): LoadedNotification {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/u);
  const frontmatter = parseFrontmatter(frontmatterMatch?.[1] ?? "");
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/u, "").trim();
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const fileStem = fileName.replace(/\.md$/u, "");
  const fallbackMatch = fileStem.match(/^(\d{8})-(\d{4})-(.+)$/u);
  const fallbackTimestamp = fallbackMatch
    ? `${fallbackMatch[1].slice(0, 4)}-${fallbackMatch[1].slice(4, 6)}-${fallbackMatch[1].slice(6, 8)} ${fallbackMatch[2].slice(0, 2)}:${fallbackMatch[2].slice(2, 4)}`
    : null;
  const targetId = (frontmatter.chain as ChainId | undefined) ?? ((fallbackMatch?.[3] as ChainId | undefined) ?? null);
  const title = firstLine?.replace(/^#\s*/u, "") || frontmatter.summary || fileStem;
  const summary = frontmatter.summary || body || fileStem;

  return {
    id: fileStem,
    timestamp: frontmatter.updatedAt || fallbackTimestamp,
    targetId,
    title,
    summary
  };
}

function parseMapStages(files: Array<{ name: string; content: string }>) {
  return files.reduce<Record<string, ChainStageValue | null>>((result, file) => {
    const chainId = file.name.replace(/\.md$/u, "");
    const stageMatch = file.content.match(/^-\s*(S[1-5]|PENDING)\s*阶段/imu);
    result[chainId] = stageMatch?.[1] as ChainStageValue | undefined ?? null;
    return result;
  }, {});
}

function parseFrontmatter(frontmatter: string) {
  const result: Record<string, string> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function parseActionEvents(rawText: string): PersistedActionEvent[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as PersistedActionEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is PersistedActionEvent => event !== null)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id));
}
