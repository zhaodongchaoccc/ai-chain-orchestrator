import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { appendFile as appendFileFs, mkdir as mkdirFs, readFile as readFileFs, writeFile as writeFileFs } from "node:fs/promises";
import { promisify } from "node:util";

import type { ChainDetailResponse, ChainId, DispatchQueueState, PersistedActionEvent, PreflightSummary, SchedulerStateFile, SourceRuntimePolicy, SourceRuntimeStateSnapshot } from "../../../shared/event-model";
import type { ffPaths } from "../config";
import { aggregateControlPlaneState } from "./aggregator";
import { buildChainDetailResponse } from "./chain-detail-service";
import { appendControlInboxItem, buildControlInboxItem, canResolveControlInboxItem, updateControlInboxItem } from "./control-inbox";
import { listTmuxSessions as defaultListTmuxSessions } from "../lib/tmux-utils";
import { formatTimestamp, promoteQueueItem, resyncQueue } from "./scheduler-service";
import { loadControlPlaneSources } from "./state-loader";
import { normalizeSourceRuntimePolicy, selectEvictionCandidate } from "./source-runtime-policy";

const execFileAsync = promisify(execFileCallback);
const ROTATE_MAIN_CONTROL_TIMEOUT_MS = 10 * 60 * 1000;

export const ACTION_WHITELIST = {
  generate_fee_api_docs: {
    confirmationRequired: false,
    targetType: "system"
  },
  generate_chain_test_cases: {
    confirmationRequired: false,
    targetType: "chain"
  },
  open_session: {
    confirmationRequired: false,
    targetType: "chain"
  },
  start_chain_session: {
    confirmationRequired: false,
    targetType: "chain"
  },
  resume_chain_session: {
    confirmationRequired: false,
    targetType: "chain"
  },
  open_terminal_and_attach: {
    confirmationRequired: false,
    targetType: "chain"
  },
  copy_attach_command: {
    confirmationRequired: false,
    targetType: "chain"
  },
  copy_review_path: {
    confirmationRequired: false,
    targetType: "chain"
  },
  send_to_defect: {
    confirmationRequired: false,
    targetType: "chain"
  },
  claim_defect_item: {
    confirmationRequired: false,
    targetType: "chain"
  },
  mark_defect_fixed: {
    confirmationRequired: false,
    targetType: "chain"
  },
  verify_defect_item: {
    confirmationRequired: false,
    targetType: "chain"
  },
  escalate_to_source_control: {
    confirmationRequired: false,
    targetType: "chain"
  },
  escalate_to_global_control: {
    confirmationRequired: false,
    targetType: "main-control"
  },
  claim_control_item: {
    confirmationRequired: false,
    targetType: "main-control"
  },
  resolve_control_item: {
    confirmationRequired: false,
    targetType: "main-control"
  },
  pause_scheduler: {
    confirmationRequired: true,
    targetType: "scheduler"
  },
  resume_scheduler: {
    confirmationRequired: true,
    targetType: "scheduler"
  },
  promote_queue_item: {
    confirmationRequired: true,
    targetType: "chain"
  },
  resync_queue: {
    confirmationRequired: true,
    targetType: "scheduler"
  },
  sleep_source_main_control: {
    confirmationRequired: true,
    targetType: "main-control"
  },
  wake_source_main_control: {
    confirmationRequired: true,
    targetType: "main-control"
  },
  summarize_overview: {
    confirmationRequired: true,
    targetType: "main-control"
  },
  handoff_main_control: {
    confirmationRequired: true,
    targetType: "main-control"
  },
  rotate_main_control_session: {
    confirmationRequired: true,
    targetType: "main-control"
  },
  open_main_control_terminal: {
    confirmationRequired: false,
    targetType: "main-control"
  },
  generate_wave_summary: {
    confirmationRequired: true,
    targetType: "wave"
  }
} as const;

export type ActionType = keyof typeof ACTION_WHITELIST;

export interface ActionRequest {
  actionType: ActionType;
  targetId?: string | null;
  payload?: Record<string, unknown>;
  confirmed?: boolean;
  mode?: "proposal" | "execute";
  timeoutMs?: number;
}

export interface ActionResult {
  success: boolean;
  actionType: ActionType;
  eventId: string | null;
  message: string;
  stdout?: string | null;
  stderr?: string | null;
  outputDir?: string;
  generatedFiles?: string[];
  includedChainIds?: string[];
  command?: string;
  path?: string;
  queue?: DispatchQueueState;
  schedulerState?: SchedulerStateFile;
}

export class ActionRunnerError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface ActionRunnerDeps {
  execFile?: (file: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<{ stdout: string; stderr: string }>;
  appendFile?: typeof appendFileFs;
  readFile?: typeof readFileFs;
  writeFile?: typeof writeFileFs;
  listTmuxSessions?: () => Promise<string[]>;
  now?: () => Date;
}

interface OrchestrationStateFile {
  maxRunningSources: number;
  runningSources: string[];
  sourceStates?: Record<string, SourceRuntimeStateSnapshot>;
  updatedAt: string | null;
}

export function isSupportedAction(actionType: string): actionType is ActionType {
  return Object.prototype.hasOwnProperty.call(ACTION_WHITELIST, actionType);
}

export function requiresConfirmation(actionType: ActionType) {
  return ACTION_WHITELIST[actionType].confirmationRequired;
}

export function createActionRunner(paths: typeof ffPaths, deps: ActionRunnerDeps = {}) {
  const execFile = deps.execFile ?? execFileAsync;
  const appendFile = deps.appendFile ?? appendFileFs;
  const mkdir = mkdirFs;
  const readFile = deps.readFile ?? readFileFs;
  const writeFile = deps.writeFile ?? writeFileFs;
  const now = deps.now ?? (() => new Date());
  const scopedSourceId = "sourceId" in paths && typeof paths.sourceId === "string" && !("legacyRoot" in paths && paths.legacyRoot === true)
    ? paths.sourceId
    : null;
  const mainControlSessionName = scopedSourceId ? `main-control-${scopedSourceId}` : "main-control";

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function extractSectionBullets(text: string, heading: string) {
    const match = text.match(new RegExp(`##\\s+${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "u"));
    if (!match) {
      return [] as string[];
    }

    return match[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-"))
      .map((line) => line.replace(/^-\s*/, "").trim());
  }

  function firstAvailableBullet(text: string, headings: string[]) {
    for (const heading of headings) {
      const bullets = extractSectionBullets(text, heading);
      if (bullets.length > 0) {
        return bullets[0];
      }
    }
    return null;
  }

  function uniqueLines(lines: string[]) {
    return [...new Set(lines.filter(Boolean))];
  }

  function extractReviewExcerpt(reviewDoc: string, chainId: string) {
    const match = reviewDoc.match(new RegExp(`###\\s+.*${escapeRegExp(chainId)}[\\s\\S]*?(?=\\n###\\s|\\n##\\s|$)`, "u"));
    return match ? match[0].trim() : reviewDoc.slice(0, 300).trim();
  }

  async function generateChainTestCasesDoc(detail: ChainDetailResponse) {
    const outputDir = path.join(paths.projectRoot, "03-业务链资产", "测试用例");
    await mkdir(outputDir, { recursive: true });

    const outputFilename = `${detail.chain.id}-test-cases.md`;
    const outputPath = path.join(outputDir, outputFilename);
    const mapPath = path.join(paths.projectRoot, detail.documents.mapPath);
    const codeListPath = path.join(paths.projectRoot, detail.documents.codeListPath);
    const reviewPath = detail.documents.reviewPath ? path.join(paths.projectRoot, detail.documents.reviewPath) : null;

    const [mapDoc, codeListDoc, reviewDoc] = await Promise.all([
      readFile(mapPath, "utf8").catch(() => ""),
      readFile(codeListPath, "utf8").catch(() => ""),
      reviewPath ? readFile(reviewPath, "utf8").catch(() => "") : Promise.resolve("")
    ]);

    const scopeLine = firstAvailableBullet(mapDoc, ["当前目标", "范围", "当前进展摘要"]);
    const positiveCases = uniqueLines([
      ...extractSectionBullets(mapDoc, "当前目标"),
      ...extractSectionBullets(mapDoc, "业务逻辑"),
      ...extractSectionBullets(mapDoc, "范围")
    ]).slice(0, 4);
    const boundaryCases = uniqueLines([
      ...extractSectionBullets(mapDoc, "当前边界").filter((line) => /不做|仅|禁止|不处理/u.test(line)),
      ...extractSectionBullets(mapDoc, "当前阻塞 / 风险"),
      ...extractSectionBullets(mapDoc, "需求来源").filter((line) => /失败|回滚|异常/u.test(line))
    ]).slice(0, 4);
    const exceptionCases = uniqueLines([
      ...extractSectionBullets(mapDoc, "需求来源").filter((line) => /失败|回滚|异常/u.test(line)),
      ...extractSectionBullets(mapDoc, "需求详情").filter((line) => /失败|回滚|异常/u.test(line)),
      "不破坏当前 CodeList 中已记录的验证结论"
    ]).slice(0, 4);
    const verificationCommands = extractSectionBullets(codeListDoc, "验证");
    const reviewExcerpt = reviewDoc ? extractReviewExcerpt(reviewDoc, detail.chain.id) : "暂无可读内容";

    const content = [
      `# ${detail.chain.id} 测试用例草案`,
      "",
      `- 链路：${detail.chain.nameZh}（${detail.chain.id}）`,
      `- 当前阶段：${detail.chain.stage}`,
      `- Map：${detail.documents.mapPath}`,
      `- CodeList：${detail.documents.codeListPath}`,
      detail.documents.reviewPath ? `- Review：${detail.documents.reviewPath}` : "- Review：暂无",
      "",
      "## 用例范围",
      scopeLine ? `- 当前任务：${scopeLine}` : (detail.workItem?.currentTask ? `- 当前任务：${detail.workItem.currentTask}` : "- 当前任务：以当前链边界与实现为准"),
      detail.chain.summary ? `- 摘要：${detail.chain.summary}` : "- 摘要：暂无额外摘要",
      "",
      "## 正向场景",
      ...(positiveCases.length > 0 ? positiveCases.map((item) => `- ${item}`) : ["- 主流程在符合边界的输入下可以完成预期输出", "- 状态、返回值或产物与当前链约定一致"]),
      "",
      "## 边界场景",
      ...(boundaryCases.length > 0 ? boundaryCases.map((item) => `- ${item}`) : ["- 缺关键参数、空结果或非法状态时返回明确失败"]),
      "",
      "## 异常场景",
      ...(exceptionCases.length > 0 ? exceptionCases.map((item) => `- ${item}`) : ["- 下游依赖异常时不中断错误传播链路", "- 不破坏当前 CodeList 中已记录的验证结论"]),
      "",
      "## 建议验证命令",
      ...(verificationCommands.length > 0 ? verificationCommands.map((item) => `- ${item}`) : ["- 先运行与当前链最相关的定向测试", "- 再运行对应模块编译或局部构建", "- 最后回写 CodeList 验证结果"]),
      "",
      "## 参考摘录",
      mapDoc ? `### Map 摘录\n\n${mapDoc.slice(0, 400).trim()}` : "### Map 摘录\n\n暂无可读内容",
      "",
      codeListDoc ? `### CodeList 摘录\n\n${codeListDoc.slice(0, 400).trim()}` : "### CodeList 摘录\n\n暂无可读内容",
      "",
      reviewDoc ? `### Review 摘录\n\n${reviewExcerpt}` : "### Review 摘录\n\n暂无可读内容",
      ""
    ].join("\n");

    await writeFile(outputPath, content, "utf8");

    return {
      outputDir,
      outputFilename,
      outputPath
    };
  }

  async function loadState() {
    const sources = await loadControlPlaneSources(paths, {
      listTmuxSessions: deps.listTmuxSessions
    });

    return {
      sources,
      state: aggregateControlPlaneState(sources)
    };
  }

  function ensurePreflightAllowsAction(actionType: ActionType, preflight: PreflightSummary) {
    if (preflight.state !== "drift") {
      return;
    }

    if (!preflight.blockingActionTypes.includes(actionType)) {
      return;
    }

    const issueSummary = preflight.issues[0]?.summary ?? "当前环境存在 DRIFT。";
    const recommended = preflight.recommendedActions.length > 0
      ? `建议先执行：${preflight.recommendedActions.join("、")}`
      : "请先处理环境漂移。";
    throw new ActionRunnerError(409, `当前环境存在 DRIFT：${issueSummary} ${recommended}`);
  }

  async function persistActionEvent(input: {
    actionType: ActionType;
    title: string;
    summary: string;
    chainId?: ChainId | null;
    relatedPath?: string | null;
    relatedSession?: string | null;
    outputDir?: string;
    generatedFiles?: string[];
    includedChainIds?: ChainId[];
    command?: string;
    path?: string;
  }) {
    const timestamp = formatTimestamp(now());
    const eventId = `action:${input.actionType}:${timestamp}`;
    const event: PersistedActionEvent = {
      id: eventId,
      type: "action_executed",
      timestamp,
      chainId: input.chainId ?? null,
      level: "info",
      title: input.title,
      summary: input.summary,
      source: "action",
      relatedPath: input.relatedPath ?? null,
      relatedSession: (input.relatedSession as PersistedActionEvent["relatedSession"]) ?? null,
      actionable: false,
      actionType: input.actionType,
      outputDir: input.outputDir,
      generatedFiles: input.generatedFiles,
      includedChainIds: input.includedChainIds,
      command: input.command,
      path: input.path
    };

    await appendFile(paths.actionEventsPath, `${JSON.stringify(event)}\n`, "utf8");
    return eventId;
  }

  async function readSchedulerState(): Promise<SchedulerStateFile> {
    return JSON.parse(await readFile(path.join(paths.shareRoot, "scheduler-state.json"), "utf8")) as SchedulerStateFile;
  }

  function stripLegacyWorkItemRuntimeFields<T extends Record<string, unknown>>(value: T) {
    const { mode: _mode, recoverable: _recoverable, ...rest } = value;
    return rest;
  }

  function buildDefaultDefectWorkItem(sourceChainId: string, payload: Record<string, unknown> | undefined) {
    const reason = String(payload?.reason ?? "待补充缺陷描述").trim();
    const currentTask = String(payload?.currentTask ?? `处理来自 ${sourceChainId} 的缺陷：${reason}`).trim();
    return {
      chainId: "Defect",
      currentTask,
      expectedOutput: "输出缺陷归因、影响范围、修复结论和验证范围",
      allowedActions: ["恢复上下文", "缺陷归因", "状态判断", "最小修复方案"],
      forbiddenActions: ["擅自扩展为新功能", "无来源链直接进入大改"],
      resumeSignal: {
        type: "manual-or-inbox",
        description: "当主控派发缺陷或 control-inbox 收到缺陷处理指令时恢复"
      },
      sourceChainId,
      severity: typeof payload?.severity === "string" ? payload.severity : null,
      regression: typeof payload?.regression === "boolean" ? payload.regression : null,
      expectedBehavior: typeof payload?.expectedBehavior === "string" ? payload.expectedBehavior : null,
      actualBehavior: typeof payload?.actualBehavior === "string" ? payload.actualBehavior : null,
      verificationScope: Array.isArray(payload?.verificationScope)
        ? payload.verificationScope.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [],
      lastVerifiedAt: formatTimestamp(now()),
      lastVerifiedBy: mainControlSessionName,
      updatedAt: formatTimestamp(now())
    };
  }

  function buildClaimedDefectWorkItem(itemId: string, defectItem: Record<string, unknown>) {
    const sourceChainId = String(defectItem.sourceChainId ?? "unknown").trim() || "unknown";
    const reason = String(defectItem.reason ?? "待补充缺陷描述").trim();

    return buildDefaultDefectWorkItem(
      sourceChainId,
      {
        ...defectItem,
        currentTask: `处理已认领缺陷 ${itemId}（来源链 ${sourceChainId}）：${reason}`
      }
    );
  }

  function buildFixedDefectWorkItem(itemId: string, defectItem: Record<string, unknown>) {
    const sourceChainId = String(defectItem.sourceChainId ?? "unknown").trim() || "unknown";
    const reason = String(defectItem.reason ?? "待补充缺陷描述").trim();

    return buildDefaultDefectWorkItem(
      sourceChainId,
      {
        ...defectItem,
        currentTask: `验证已修复缺陷 ${itemId}（来源链 ${sourceChainId}）：${reason}`
      }
    );
  }

  function buildDefectItemId(sourceChainId: string, sequence: number) {
    return `${formatTimestamp(now()).replace(/[\s:]/g, "").replace(/-/g, "-")}-${sourceChainId}-${String(sequence).padStart(3, "0")}`;
  }

  function buildDefectItemRecord(itemId: string, sourceChainId: string, payload: Record<string, unknown> | undefined) {
    return {
      itemId,
      sourceChainId,
      reason: String(payload?.reason ?? "待补充缺陷描述").trim(),
      severity: typeof payload?.severity === "string" ? payload.severity : null,
      regression: typeof payload?.regression === "boolean" ? payload.regression : null,
      expectedBehavior: typeof payload?.expectedBehavior === "string" ? payload.expectedBehavior : null,
      actualBehavior: typeof payload?.actualBehavior === "string" ? payload.actualBehavior : null,
      verificationScope: Array.isArray(payload?.verificationScope)
        ? payload.verificationScope.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [],
      createdAt: formatTimestamp(now()),
      createdBy: mainControlSessionName,
      status: "open",
      claimedBy: null,
      claimedAt: null,
      fixedAt: null,
      verifiedAt: null
    };
  }

  async function listDefectItemIds(defectItemsDir: string) {
    try {
      return (await import("node:fs/promises")).readdir(defectItemsDir)
        .then((names) => names.filter((name) => name.endsWith(".json")).sort());
    } catch {
      return [] as string[];
    }
  }

  async function updateDefectItem(defectItemsDir: string, itemId: string, patch: Record<string, unknown>) {
    const itemPath = path.join(defectItemsDir, `${itemId}.json`);
    const current = await readJsonOrDefault<Record<string, unknown> | null>(itemPath, null);
    if (!current) {
      throw new ActionRunnerError(404, `Unknown defect item: ${itemId}`);
    }
    const next = { ...current, ...patch };
    await writeFile(itemPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  async function syncDefectContext(
    nextDefectWorkItem: Record<string, unknown>,
    contextLabel: string,
    timeoutMs: number | undefined
  ) {
    const defectWorkItemPath = path.join(paths.shareRoot, "work-items", "Defect.json");
    const defectSessionName = `chain-${scopedSourceId}-Defect`;
    const runningSessions = await (deps.listTmuxSessions ?? defaultListTmuxSessions)().catch(() => [] as string[]);
    const defectSessionRunning = runningSessions.includes(defectSessionName);
    const workItemToPersist = stripLegacyWorkItemRuntimeFields(nextDefectWorkItem);
    await writeFile(defectWorkItemPath, `${JSON.stringify(workItemToPersist, null, 2)}\n`, "utf8");

    let contextMessage = `${contextLabel}`;
    if (defectSessionRunning) {
      try {
        const scriptPath = path.join(paths.playbooksRoot, "resume-chain-session.sh");
        await execFile("bash", [scriptPath, "Defect", scopedSourceId!], {
          cwd: paths.projectRoot,
          timeout: timeoutMs ?? 5000
        });
        contextMessage = `${contextMessage}，并已刷新当前 Defect session`;
      } catch {
        contextMessage = `${contextMessage}，但当前 Defect session 刷新失败，请手动点“恢复上下文”`;
      }
    } else {
      contextMessage = `${contextMessage}；下次恢复 Defect session 时会使用该上下文`;
    }

    return { contextMessage, workItemToPersist };
  }

  async function writeQueue(queue: DispatchQueueState) {
    await writeFile(path.join(paths.shareRoot, "dispatch-queue.json"), `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  }

  function buildControlInboxPath(scope: "source" | "global") {
    return scope === "source" ? path.join(paths.shareRoot, "control-inbox.jsonl") : path.join(paths.projectRoot, "share", "global", "control-inbox.jsonl");
  }

  async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  function buildGlobalOrchestrationPath() {
    return path.join(paths.projectRoot, "share", "global", "orchestration-state.json");
  }

  function buildSourcePolicyPath(sourceId: string) {
    return path.join(paths.projectRoot, "share", "sources", sourceId, "policy.json");
  }

  async function readSourcePolicy(sourceId: string): Promise<SourceRuntimePolicy> {
    return normalizeSourceRuntimePolicy(await readJsonOrDefault<Partial<SourceRuntimePolicy>>(buildSourcePolicyPath(sourceId), {}));
  }

  async function readOrchestrationState(): Promise<OrchestrationStateFile> {
    return readJsonOrDefault<OrchestrationStateFile>(buildGlobalOrchestrationPath(), {
      maxRunningSources: 5,
      runningSources: [],
      sourceStates: {},
      updatedAt: null
    });
  }

  async function writeOrchestrationState(state: OrchestrationStateFile) {
    const filePath = buildGlobalOrchestrationPath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  async function updateSourceRuntimeState(sourceId: string, patch: Partial<SourceRuntimeStateSnapshot>) {
    const orchestrationState = await readOrchestrationState();
    const policy = await readSourcePolicy(sourceId);
    const current = orchestrationState.sourceStates?.[sourceId] ?? {
      sourceId,
      runtimeState: policy.pinned ? "pinned" : "sleeping",
      lastActiveAt: null,
      pinned: policy.pinned
    };
    const nextState: SourceRuntimeStateSnapshot = {
      ...current,
      ...patch,
      sourceId,
      pinned: patch.pinned ?? policy.pinned
    };
    const nextRunningSources = [...new Set(
      nextState.runtimeState === "sleeping"
        ? orchestrationState.runningSources.filter((item) => item !== sourceId)
        : [...orchestrationState.runningSources.filter((item) => item !== sourceId), sourceId]
    )];
    await writeOrchestrationState({
      ...orchestrationState,
      runningSources: nextRunningSources,
      sourceStates: {
        ...(orchestrationState.sourceStates ?? {}),
        [sourceId]: nextState
      },
      updatedAt: formatTimestamp(now())
    });
  }

  async function ensureSourceCapacityForWake(sourceId: string) {
    const sessions = await (deps.listTmuxSessions ?? defaultListTmuxSessions)();
    const runningSourceIds = sessions
      .filter((session) => session.startsWith("main-control-"))
      .map((session) => session.replace(/^main-control-/u, ""))
      .filter((id) => id !== sourceId);
    const orchestrationState = await readOrchestrationState();
    const maxRunningSources = Math.max(1, Number(orchestrationState.maxRunningSources || 5));
    const snapshots: SourceRuntimeStateSnapshot[] = [];
    for (const runningSourceId of runningSourceIds) {
      const policy = await readSourcePolicy(runningSourceId);
      snapshots.push({
        sourceId: runningSourceId,
        runtimeState: policy.pinned ? "pinned" : "running",
        lastActiveAt: orchestrationState.sourceStates?.[runningSourceId]?.lastActiveAt ?? null,
        pinned: policy.pinned
      });
    }
    const candidate = selectEvictionCandidate(snapshots, maxRunningSources);
    if (runningSourceIds.length >= maxRunningSources) {
      if (!candidate) {
        throw new ActionRunnerError(409, "当前没有可自动淘汰的需求子主控，请先手动解除 pinned 或降低运行数量。");
      }
      const sleepScriptPath = path.join(paths.playbooksRoot, "sleep-source-main-control.sh");
      await execFile("bash", [sleepScriptPath, candidate.sourceId], {
        cwd: paths.projectRoot,
        timeout: 10000
      });
      await updateSourceRuntimeState(candidate.sourceId, {
        runtimeState: "sleeping"
      });
    }
  }

  async function ensureSourceMainControlRunning() {
    if (!scopedSourceId) {
      return;
    }

    const sourceSessionName = `main-control-${scopedSourceId}`;

    try {
      const sessions = await (deps.listTmuxSessions ?? defaultListTmuxSessions)();
      if (sessions.includes(sourceSessionName)) {
        await updateSourceRuntimeState(scopedSourceId, {
          runtimeState: (await readSourcePolicy(scopedSourceId)).pinned ? "pinned" : "running",
          lastActiveAt: formatTimestamp(now())
        });
        return;
      }
    } catch {
      // Fall through and try to start the source main-control session.
    }

    await ensureSourceCapacityForWake(scopedSourceId);
    const scriptPath = path.join(paths.playbooksRoot, "start-source-main-control.sh");
    await execFile("bash", [scriptPath, scopedSourceId], {
      cwd: paths.projectRoot,
      timeout: 10000
    });
    await updateSourceRuntimeState(scopedSourceId, {
      runtimeState: (await readSourcePolicy(scopedSourceId)).pinned ? "pinned" : "running",
      lastActiveAt: formatTimestamp(now())
    });
  }

  async function resolveChainContext(targetId: string | null | undefined) {
    if (!targetId) {
      throw new ActionRunnerError(400, "Chain target is required");
    }

    const { state } = await loadState();
    const detail = buildChainDetailResponse(state, targetId);

    if (!detail) {
      throw new ActionRunnerError(404, `Unknown chain id: ${targetId}`);
    }

    return detail;
  }

  function ensureRunningChainSession(detail: ChainDetailResponse, actionType: "resume_chain_session" | "open_terminal_and_attach") {
    if (detail.session.sessionRunning) {
      return;
    }

    const message = actionType === "resume_chain_session"
      ? `链 session 未运行，请先启动该链后再恢复上下文：${detail.chain.id}`
      : `链 session 未运行，请先启动该链后再进入终端：${detail.chain.id}`;

    throw new ActionRunnerError(409, message);
  }

  function ensureStoppedChainSession(detail: ChainDetailResponse) {
    if (!detail.session.sessionRunning) {
      return;
    }

    throw new ActionRunnerError(409, `链 session 已在运行，请直接恢复上下文或 attach 进入：${detail.chain.id}`);
  }

  return async function runAction(request: ActionRequest): Promise<ActionResult> {
    if (requiresConfirmation(request.actionType) && request.confirmed !== true) {
      throw new ActionRunnerError(409, `Confirmation required for action: ${request.actionType}`);
    }

    const stateSnapshot = await loadState();
    ensurePreflightAllowsAction(request.actionType, stateSnapshot.state.preflight);

    switch (request.actionType) {
      case "generate_fee_api_docs": {
        const scriptPath = path.join(paths.playbooksRoot, "generate-fee-api-docs.sh");
        const outputDir = path.join(paths.projectRoot, "03-业务链资产/接口文档");
        const { stdout } = await execFile("bash", [scriptPath], { cwd: paths.projectRoot, timeout: request.timeoutMs ?? 5000 });
        const payload = JSON.parse(stdout.trim()) as { generated_files?: string[]; included_chain_ids?: string[] };
        const generatedFiles = payload.generated_files ?? [];
        const includedChainIds = (payload.included_chain_ids ?? []) as ChainId[];
        const outputDirRelative = path.relative(paths.projectRoot, outputDir) || "03-业务链资产/接口文档";
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: "已生成收费联调接口文档",
          summary: `已生成 ${generatedFiles.length} 个接口文档，纳入 ${includedChainIds.length} 条链。`,
          relatedPath: outputDirRelative,
          outputDir: outputDirRelative,
          generatedFiles,
          includedChainIds
        });

        const overviewFile = generatedFiles[0] ?? "收费业务链联调总览.md";

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: `收费业务链联调接口文档已生成，请前往 ${outputDirRelative}/${overviewFile} 查看。`,
          outputDir: outputDirRelative,
          generatedFiles,
          includedChainIds
        };
      }
      case "generate_chain_test_cases": {
        const detail = await resolveChainContext(request.targetId);
        const generated = await generateChainTestCasesDoc(detail);
        const outputDirRelative = path.relative(paths.projectRoot, generated.outputDir) || "03-业务链资产/测试用例";
        const outputPathRelative = path.relative(paths.projectRoot, generated.outputPath) || `${outputDirRelative}/${generated.outputFilename}`;
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} 测试用例已生成`,
          summary: `已为 ${detail.chain.id} 生成测试用例草案。`,
          chainId: detail.chain.id,
          relatedPath: outputPathRelative,
          path: outputPathRelative,
          outputDir: outputDirRelative,
          generatedFiles: [generated.outputFilename]
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: `${detail.chain.id} 测试用例已生成，请前往 ${outputPathRelative} 查看。`,
          path: outputPathRelative,
          outputDir: outputDirRelative,
          generatedFiles: [generated.outputFilename]
        };
      }
      case "open_session":
      case "copy_attach_command": {
        const detail = await resolveChainContext(request.targetId);
        const command = detail.session.attachCommand ?? undefined;

        if (!command) {
          throw new ActionRunnerError(409, `Chain ${detail.chain.id} has no attach command`);
        }

        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} attach 命令已就绪`,
          summary: command,
          chainId: detail.chain.id,
          relatedSession: detail.session.sessionName,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: request.actionType === "open_session" ? "请在终端执行 attach 命令进入该链 session。" : "Attach 命令已准备好，可直接复制。",
          command
        };
      }
      case "escalate_to_source_control": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内升级给当前需求子主控");
        }
        const detail = await resolveChainContext(request.targetId);
        const inboxPath = buildControlInboxPath("source");
        await mkdir(path.dirname(inboxPath), { recursive: true });
        const eventId = `control:${formatTimestamp(now())}:${detail.chain.id}`;
        await appendControlInboxItem(inboxPath, buildControlInboxItem({
          eventId,
          scopeFrom: "chain",
          scopeTo: "source",
          sourceId: scopedSourceId,
          chainId: detail.chain.id,
          severity: (request.payload?.severity as any) ?? "warning",
          reason: String(request.payload?.reason ?? `${detail.chain.id} 需要子主控裁决`),
          requestedAction: String(request.payload?.requestedAction ?? "确认下一步"),
          createdAt: formatTimestamp(now())
        }));
        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: `已升级到 ${mainControlSessionName}`
        };
      }
      case "send_to_defect": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内把缺陷归入 Defect");
        }
        const detail = await resolveChainContext(request.targetId);
        if (detail.chain.id === "Defect") {
          throw new ActionRunnerError(409, "Defect 链不能再次归入 Defect");
        }
        const defectPath = path.join(paths.shareRoot, "work-items", "Defect.json");
        const defectItemsDir = path.join(paths.shareRoot, "defect-items");
        await mkdir(path.dirname(defectPath), { recursive: true });
        await mkdir(defectItemsDir, { recursive: true });
        const current = await readJsonOrDefault<Record<string, unknown>>(defectPath, {});
        const existingDefectItemNames = await listDefectItemIds(defectItemsDir);
        const itemId = buildDefectItemId(detail.chain.id, existingDefectItemNames.length + 1);
        const defectItem = buildDefectItemRecord(itemId, detail.chain.id, request.payload);
        await writeFile(path.join(defectItemsDir, `${itemId}.json`), `${JSON.stringify(defectItem, null, 2)}\n`, "utf8");
        const defectItemNames = await listDefectItemIds(defectItemsDir);
        const next = {
          ...stripLegacyWorkItemRuntimeFields(current),
          ...buildDefaultDefectWorkItem(detail.chain.id, request.payload),
          currentTask: `跟进最近 ${defectItemNames.length} 条缺陷，最近来源链 ${detail.chain.id}`,
          updatedAt: formatTimestamp(now())
        };
        await writeFile(defectPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} 已归入 Defect`,
          summary: `缺陷已记录到 Defect，来源链 ${detail.chain.id}，累计 ${defectItemNames.length} 条`,
          chainId: detail.chain.id,
          relatedPath: path.relative(paths.projectRoot, defectPath) || defectPath,
          path: path.relative(paths.projectRoot, defectPath) || defectPath
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: `已将 ${detail.chain.id} 的缺陷归入 Defect`,
          path: path.relative(paths.projectRoot, defectPath) || defectPath
        };
      }
      case "claim_defect_item": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内处理缺陷项");
        }
        const itemId = String(request.payload?.itemId ?? "").trim();
        if (!itemId) {
          throw new ActionRunnerError(400, "Defect item id is required");
        }
        const defectItemsDir = path.join(paths.shareRoot, "defect-items");
        await mkdir(defectItemsDir, { recursive: true });
        const claimed = await updateDefectItem(defectItemsDir, itemId, {
          status: "claimed",
          claimedBy: String(request.payload?.claimedBy ?? mainControlSessionName),
          claimedAt: formatTimestamp(now())
        });
        const { contextMessage } = await syncDefectContext(
          buildClaimedDefectWorkItem(itemId, claimed),
          `Defect 上下文已切换到 ${String(claimed.sourceChainId ?? "unknown").trim() || "unknown"} 的认领处理视角`,
          request.timeoutMs
        );

        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `缺陷项已认领`,
          summary: `${itemId} 已由 ${claimed.claimedBy ?? mainControlSessionName} 认领；${contextMessage}`,
          chainId: "Defect"
        });
        return { success: true, actionType: request.actionType, eventId, message: `已认领缺陷项 ${itemId}；${contextMessage}` };
      }
      case "mark_defect_fixed": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内处理缺陷项");
        }
        const itemId = String(request.payload?.itemId ?? "").trim();
        if (!itemId) {
          throw new ActionRunnerError(400, "Defect item id is required");
        }
        const defectItemsDir = path.join(paths.shareRoot, "defect-items");
        await mkdir(defectItemsDir, { recursive: true });
        const fixed = await updateDefectItem(defectItemsDir, itemId, {
          status: "fixed",
          fixedAt: formatTimestamp(now())
        });
        const { contextMessage } = await syncDefectContext(
          buildFixedDefectWorkItem(itemId, fixed),
          `Defect 上下文已切换到 ${String(fixed.sourceChainId ?? "unknown").trim() || "unknown"} 的待验证视角`,
          request.timeoutMs
        );
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `缺陷项已标记修复`,
          summary: `${itemId} 已标记为 fixed；${contextMessage}`,
          chainId: "Defect"
        });
        return { success: true, actionType: request.actionType, eventId, message: `已标记缺陷项为 fixed: ${itemId}；${contextMessage}` };
      }
      case "verify_defect_item": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内处理缺陷项");
        }
        const itemId = String(request.payload?.itemId ?? "").trim();
        if (!itemId) {
          throw new ActionRunnerError(400, "Defect item id is required");
        }
        const defectItemsDir = path.join(paths.shareRoot, "defect-items");
        await mkdir(defectItemsDir, { recursive: true });
        await updateDefectItem(defectItemsDir, itemId, {
          status: "verified",
          verifiedAt: formatTimestamp(now())
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `缺陷项已验证`,
          summary: `${itemId} 已标记为 verified`,
          chainId: "Defect"
        });
        return { success: true, actionType: request.actionType, eventId, message: `已验证缺陷项 ${itemId}` };
      }
      case "escalate_to_global_control": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内升级给全局主控");
        }
        const inboxPath = buildControlInboxPath("global");
        await mkdir(path.dirname(inboxPath), { recursive: true });
        const eventId = `control:${formatTimestamp(now())}:global`;
        await appendControlInboxItem(inboxPath, buildControlInboxItem({
          eventId,
          scopeFrom: "source",
          scopeTo: "global",
          sourceId: scopedSourceId,
          chainId: request.targetId ?? null,
          severity: (request.payload?.severity as any) ?? "warning",
          reason: String(request.payload?.reason ?? `${scopedSourceId} 需要全局主控裁决`),
          requestedAction: String(request.payload?.requestedAction ?? "确认需求级动作"),
          createdAt: formatTimestamp(now())
        }));
        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已升级到全局主控"
        };
      }
      case "claim_control_item": {
        const scope = request.payload?.scope === "global" ? "global" : "source";
        const inboxPath = buildControlInboxPath(scope);
        await mkdir(path.dirname(inboxPath), { recursive: true });
        const eventId = String(request.payload?.eventId ?? "").trim();
        if (!eventId) {
          throw new ActionRunnerError(400, "Control inbox event id is required");
        }
        const claimed = await updateControlInboxItem(inboxPath, eventId, {
          status: "claimed",
          claimedBy: String(request.payload?.claimedBy ?? mainControlSessionName)
        });
        return {
          success: true,
          actionType: request.actionType,
          eventId: claimed.eventId,
          message: `已认领 control item: ${claimed.eventId}`
        };
      }
      case "resolve_control_item": {
        const scope = request.payload?.scope === "global" ? "global" : "source";
        const inboxPath = buildControlInboxPath(scope);
        await mkdir(path.dirname(inboxPath), { recursive: true });
        const eventId = String(request.payload?.eventId ?? "").trim();
        if (!eventId) {
          throw new ActionRunnerError(400, "Control inbox event id is required");
        }
        const current = await updateControlInboxItem(inboxPath, eventId, {});
        if (!canResolveControlInboxItem(current.status)) {
          throw new ActionRunnerError(409, `当前 control item 不可收口: ${eventId}`);
        }
        const resolved = await updateControlInboxItem(inboxPath, eventId, {
          status: "resolved",
          resolvedAt: formatTimestamp(now())
        });
        return {
          success: true,
          actionType: request.actionType,
          eventId: resolved.eventId,
          message: `已收口 control item: ${resolved.eventId}`
        };
      }
      case "start_chain_session": {
        const detail = await resolveChainContext(request.targetId);
        ensureStoppedChainSession(detail);
        await ensureSourceMainControlRunning();
        const scriptPath = path.join(paths.playbooksRoot, "start-chain-session.sh");
        const scriptArgs = scopedSourceId ? [scriptPath, detail.chain.id, scopedSourceId] : [scriptPath, detail.chain.id];
        const { stdout, stderr } = await execFile("bash", scriptArgs, {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 10000
        });
        const command = detail.session.attachCommand ?? undefined;
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} 已启动链 session`,
          summary: stdout.trim() || `已启动 ${detail.chain.id} session 并注入初始上下文。`,
          chainId: detail.chain.id,
          relatedSession: detail.session.sessionName,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已启动该链 session 并注入初始上下文，可继续 attach 进入编码。",
          stdout,
          stderr,
          command
        };
      }
      case "resume_chain_session": {
        const detail = await resolveChainContext(request.targetId);
        ensureRunningChainSession(detail, request.actionType);
        await ensureSourceMainControlRunning();
        const scriptPath = path.join(paths.playbooksRoot, "resume-chain-session.sh");
        const scriptArgs = scopedSourceId ? [scriptPath, detail.chain.id, scopedSourceId] : [scriptPath, detail.chain.id];
        const { stdout, stderr } = await execFile("bash", scriptArgs, {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 5000
        });
        const command = detail.session.attachCommand ?? undefined;
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} 已恢复链上下文`,
          summary: stdout.trim() || `已向 ${detail.chain.id} 发送恢复提示。`,
          chainId: detail.chain.id,
          relatedSession: detail.session.sessionName,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已向该链 session 注入恢复上下文，可继续 attach 进入编码。",
          stdout,
          stderr,
          command
        };
      }
      case "open_terminal_and_attach": {
        const detail = await resolveChainContext(request.targetId);
        ensureRunningChainSession(detail, request.actionType);
        const command = detail.session.attachCommand ?? undefined;

        if (!command) {
          throw new ActionRunnerError(409, `Chain ${detail.chain.id} has no attach command`);
        }

        const { stdout, stderr } = await execFile("osascript", [
          "-e",
          'tell application "Terminal" to activate',
          "-e",
          `tell application "Terminal" to do script "${command}"`
        ], {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 5000
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} 已尝试打开终端并 attach`,
          summary: command,
          chainId: detail.chain.id,
          relatedSession: detail.session.sessionName,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已尝试打开 Terminal 并进入该链 session。",
          stdout,
          stderr,
          command
        };
      }
      case "copy_review_path": {
        const detail = await resolveChainContext(request.targetId);
        const reviewPath = detail.documents.reviewPath;

        if (!reviewPath) {
          throw new ActionRunnerError(404, `No review path available for chain: ${detail.chain.id}`);
        }

        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `${detail.chain.nameZh} Review 路径已就绪`,
          summary: reviewPath,
          chainId: detail.chain.id,
          relatedPath: reviewPath,
          path: reviewPath
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "Review 路径已准备好，可直接打开或复制。",
          path: reviewPath
        };
      }
      case "pause_scheduler":
      case "resume_scheduler": {
        const scriptName = request.actionType === "pause_scheduler" ? "pause-scheduler.sh" : "resume-scheduler.sh";
        const scriptPath = path.join(paths.playbooksRoot, scriptName);
        const { stdout, stderr } = await execFile("bash", [scriptPath], { cwd: paths.projectRoot, timeout: request.timeoutMs ?? 5000 });
        const schedulerState = await readSchedulerState();
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: request.actionType === "pause_scheduler" ? "已暂停调度器" : "已恢复调度器",
          summary: stdout.trim() || (request.actionType === "pause_scheduler" ? "调度器已暂停。" : "调度器已恢复。"),
          relatedPath: "share/scheduler-state.json"
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: request.actionType === "pause_scheduler" ? "调度器已暂停" : "调度器已恢复",
          stdout,
          stderr,
          schedulerState
        };
      }
      case "promote_queue_item": {
        if (!request.targetId) {
          throw new ActionRunnerError(400, "Queue promotion requires a target chain id");
        }

        const { sources } = stateSnapshot;
        if (!sources.queue.pendingStart.includes(request.targetId as ChainId)) {
          throw new ActionRunnerError(409, `Chain is not currently in dispatch queue: ${request.targetId}`);
        }

        const queue = promoteQueueItem(sources.queue, request.targetId as ChainId, now);
        await writeQueue(queue);
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `已提升 ${request.targetId} 到队列顶部`,
          summary: `当前队列下一候选链为 ${queue.nextCandidate ?? "无"}。`,
          chainId: request.targetId as ChainId,
          relatedPath: "share/dispatch-queue.json"
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已将链提升到队列顶部",
          queue
        };
      }
      case "resync_queue": {
        const { sources } = stateSnapshot;
        const queue = resyncQueue({
          registry: sources.registry,
          chainStatus: sources.chainStatus,
          currentQueue: sources.queue,
          activeSessions: sources.tmuxSessions,
          sourceId: scopedSourceId ?? "newfee",
          now
        });
        await writeQueue(queue);
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: "已重新同步待启动队列",
          summary: `当前队列共 ${queue.pendingStart.length} 条，下一候选链为 ${queue.nextCandidate ?? "无"}。`,
          relatedPath: "share/dispatch-queue.json"
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "待启动队列已按真值重新同步",
          queue
        };
      }
      case "sleep_source_main_control": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内休眠需求子主控");
        }
        const scriptPath = path.join(paths.playbooksRoot, "sleep-source-main-control.sh");
        const { stdout, stderr } = await execFile("bash", [scriptPath, scopedSourceId], {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 10000
        });
        await updateSourceRuntimeState(scopedSourceId, {
          runtimeState: "sleeping"
        });
        return {
          success: true,
          actionType: request.actionType,
          eventId: null,
          message: `已休眠 ${mainControlSessionName}`,
          stdout,
          stderr
        };
      }
      case "wake_source_main_control": {
        if (!scopedSourceId) {
          throw new ActionRunnerError(409, "只能在需求工作区内唤醒需求子主控");
        }
        await ensureSourceCapacityForWake(scopedSourceId);
        const scriptPath = path.join(paths.playbooksRoot, "wake-source-main-control.sh");
        const { stdout, stderr } = await execFile("bash", [scriptPath, scopedSourceId], {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 10000
        });
        await updateSourceRuntimeState(scopedSourceId, {
          runtimeState: (await readSourcePolicy(scopedSourceId)).pinned ? "pinned" : "running",
          lastActiveAt: formatTimestamp(now())
        });
        return {
          success: true,
          actionType: request.actionType,
          eventId: null,
          message: `已唤醒 ${mainControlSessionName}`,
          stdout,
          stderr
        };
      }
      case "summarize_overview": {
        const command = "[panel-action] summarize-global-state";
        const { stdout, stderr } = await execFile("tmux", ["send-keys", "-t", mainControlSessionName, command, "Enter"], {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 5000
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: "已触发主控全局汇总",
          summary: command,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: `已向 ${mainControlSessionName} 派发全局汇总指令`,
          stdout,
          stderr,
          command
        };
      }
      case "handoff_main_control": {
        const scriptPath = path.join(paths.playbooksRoot, scopedSourceId ? "handoff-source-main-control.sh" : "handoff-main-control.sh");
        const scriptArgs = scopedSourceId ? [scriptPath, scopedSourceId] : [scriptPath];
        const { stdout, stderr } = await execFile("bash", scriptArgs, {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 5000
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: "已生成主控交接",
          summary: stdout.trim() || "已生成主控交接页并更新 LATEST。",
          relatedSession: mainControlSessionName
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已生成主控交接并更新 LATEST。",
          stdout,
          stderr
        };
      }
      case "rotate_main_control_session": {
        const scriptPath = path.join(paths.playbooksRoot, scopedSourceId ? "rotate-source-main-control.sh" : "rotate-main-control-session.sh");
        const scriptArgs = scopedSourceId ? [scriptPath, scopedSourceId] : [scriptPath];
        const { stdout, stderr } = await execFile("bash", scriptArgs, {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? ROTATE_MAIN_CONTROL_TIMEOUT_MS
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: "已轮换主控上下文",
          summary: stdout.trim() || "已在 main-control 内轮换新的主控上下文。",
          relatedSession: mainControlSessionName
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已在 main-control 内轮换新的主控上下文。",
          stdout,
          stderr
        };
      }
      case "open_main_control_terminal": {
        const command = `tmux attach -t ${mainControlSessionName}`;
        const { stdout, stderr } = await execFile("osascript", [
          "-e",
          'tell application "Terminal" to activate',
          "-e",
          `tell application "Terminal" to do script "${command}"`
        ], {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 5000
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: "已尝试打开 Terminal 并进入主控",
          summary: command,
          relatedSession: mainControlSessionName,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: "已尝试打开 Terminal 并进入 main-control。",
          stdout,
          stderr,
          command
        };
      }
      case "generate_wave_summary": {
        const wave = String(request.targetId ?? request.payload?.wave ?? "").trim();

        if (!wave) {
          throw new ActionRunnerError(400, "Wave target is required");
        }

        if (!["P0", "P1", "P2"].includes(wave)) {
          throw new ActionRunnerError(400, `Unsupported wave target: ${wave}`);
        }

        const { state } = stateSnapshot;
        const waveChains = state.chains.filter((chain) => chain.priorityWave === wave);
        if (waveChains.length === 0 || waveChains.some((chain) => chain.stage !== "S5")) {
          throw new ActionRunnerError(409, `当前波次 ${wave} 尚未全部收口到 S5，不能触发 Wave 汇总`);
        }

        const command = `[panel-action] generate-wave-summary ${wave}`;
        const { stdout, stderr } = await execFile("tmux", ["send-keys", "-t", mainControlSessionName, command, "Enter"], {
          cwd: paths.projectRoot,
          timeout: request.timeoutMs ?? 5000
        });
        const eventId = await persistActionEvent({
          actionType: request.actionType,
          title: `已触发 ${wave} Wave 汇总`,
          summary: command,
          command
        });

        return {
          success: true,
          actionType: request.actionType,
          eventId,
          message: `已向 ${mainControlSessionName} 派发 ${wave} Wave 汇总指令`,
          stdout,
          stderr,
          command
        };
      }
      default:
        throw new ActionRunnerError(400, `Unsupported action: ${request.actionType}`);
    }
  };
}
