import { randomUUID } from "node:crypto";
import { appendFile as appendFileFs } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { buildChainSessionName, CHAIN_IDS, DEFAULT_SOURCE_ID } from "../../../shared/event-model";
import type { AiActionProposal, AiChatRequest, AiChatResponse, AiDispatchRequest, AiDispatchResponse, AiMode, AiResolvedTarget, ChainId, PersistedActionEvent } from "../../../shared/event-model";

import { serverConfig, type ffPaths } from "../config";
import { aggregateControlPlaneState } from "./aggregator";
import { buildChainDetailResponse } from "./chain-detail-service";
import { formatTimestamp } from "./scheduler-service";
import { loadControlPlaneSources } from "./state-loader";
import type { ControlPlaneState } from "../types/overview";

const execFileAsync = promisify(execFileCallback);

export class AiBridgeError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface AiBridgeDeps {
  loadState?: () => Promise<ControlPlaneState>;
  execFile?: (file: string, args: string[], options?: { cwd?: string; timeout?: number }) => Promise<{ stdout: string; stderr: string }>;
  appendEvent?: (event: PersistedActionEvent) => Promise<string>;
  now?: () => Date;
}

interface StoredDispatchProposal {
  proposalId: string;
  targetType: "main-control" | "chain";
  targetId: ChainId | null;
  sessionName: string;
  message: string;
  expiresAt: number;
}

export interface AiBridge {
  chat: (request: AiChatRequest) => Promise<AiChatResponse>;
  dispatch: (request: AiDispatchRequest) => Promise<AiDispatchResponse>;
}

const SCHEDULER_ACTION_PATTERNS = [
  { actionType: "pause_scheduler", pattern: /(暂停调度|暂停 watcher|pause scheduler)/iu },
  { actionType: "resume_scheduler", pattern: /(恢复调度|恢复 watcher|resume scheduler|启动调度)/iu },
  { actionType: "resync_queue", pattern: /(重算队列|重新同步队列|resync queue|refresh queue|同步队列)/iu },
  { actionType: "promote_queue_item", pattern: /(提到队首|提升.*队列|promote.*queue|优先启动|提到顶部)/iu },
  { actionType: "summarize_overview", pattern: /(全局汇总|总结当前全局状态|summarize global|总结主控)/iu },
  { actionType: "generate_wave_summary", pattern: /(wave 汇总|生成 wave 总结|generate wave summary|波次总结)/iu }
] as const;

function isSideEffectfulMode(mode: AiMode) {
  return mode === "scheduler" || mode === "delegate";
}

function normalizeMessage(message: string) {
  return message.replace(/\s+/gu, " ").trim();
}

function looksLikeShellCommand(message: string) {
  return /(^|\s)(git|bash|sh|zsh|fish|tmux|npm|pnpm|yarn|node|python|pip|pip3|go|cargo|java|mvn|gradle|docker|kubectl|make|curl|wget|ssh|scp|rsync|ls|cat|sed|awk|grep|find|ps|kill|chmod|chown|mv|cp|rm|touch|mkdir)\b|(^|\s)-{1,2}[A-Za-z]|&&|\|\||`|\$\(|(^|\s)>|(^|\s)<|;|\/tmp\/|https?:\/\/|(^|\s)(\.\/|\.\.\/|~\/|\/[^\s]+)/iu.test(message);
}

async function loadStateFromDisk(): Promise<ControlPlaneState> {
  const sources = await loadControlPlaneSources(serverConfig.paths);
  return aggregateControlPlaneState(sources);
}

export function createAiBridge(pathsOrDeps: typeof ffPaths | AiBridgeDeps = serverConfig.paths, maybeDeps: AiBridgeDeps = {}): AiBridge {
  const hasPaths = "projectRoot" in pathsOrDeps;
  const paths = hasPaths ? pathsOrDeps : serverConfig.paths;
  const deps = hasPaths ? maybeDeps : pathsOrDeps;
  const loadState = deps.loadState ?? loadStateFromDisk;
  const execFile = deps.execFile ?? execFileAsync;
  const now = deps.now ?? (() => new Date());
  const currentSourceId = "sourceId" in paths && typeof paths.sourceId === "string" ? paths.sourceId : DEFAULT_SOURCE_ID;
  const mainControlSessionName = "sourceId" in paths && typeof paths.sourceId === "string" ? `main-control-${paths.sourceId}` : "main-control";

  const appendEvent = deps.appendEvent ?? (async (event: PersistedActionEvent) => {
    await appendFileFs(paths.actionEventsPath, `${JSON.stringify(event)}\n`, "utf8");
    return event.id;
  });
  const dispatchProposalStore = new Map<string, StoredDispatchProposal>();

  function resolveChainId(state: ControlPlaneState, request: AiChatRequest): ChainId | null {
    const explicitChainId = request.targetChainId ?? request.context.selectedChainId;

    if (explicitChainId && !CHAIN_IDS.includes(explicitChainId)) {
      throw new AiBridgeError(400, `Unknown chain target: ${explicitChainId}`);
    }

    if (request.targetChainId) {
      return request.targetChainId;
    }

    if (request.context.selectedChainId) {
      return request.context.selectedChainId;
    }

    const matched = state.registry.find((entry) => request.message.includes(entry.id) || request.message.includes(entry.nameZh));
    return matched?.id ?? null;
  }

  function resolveTarget(state: ControlPlaneState, request: AiChatRequest, schedulerAction: string | null): AiResolvedTarget {
    const chainId = resolveChainId(state, request);

    if (schedulerAction) {
      if (schedulerAction === "generate_wave_summary") {
        return {
          targetType: "wave",
          targetId: state.waveSummary.wave,
          sessionName: null,
          reason: "scheduler action proposal"
        };
      }

      return {
        targetType: "scheduler",
        targetId: null,
        sessionName: null,
        reason: "scheduler action proposal"
      };
    }

    if (request.target === "main-control") {
      return {
        targetType: "main-control",
        targetId: null,
        sessionName: mainControlSessionName,
        reason: "explicit target"
      };
    }

    if ((request.target === "current-chain" || request.target === "specific-chain") && chainId) {
      return {
          targetType: "chain",
          targetId: chainId,
          sessionName: buildChainSessionName(currentSourceId, chainId),
          reason: request.target === "current-chain" ? "selected chain context" : "specific chain target"
        };
    }

    if (request.target === "auto") {
      if (request.mode === "delegate" && chainId) {
        return {
          targetType: "chain",
          targetId: chainId,
          sessionName: buildChainSessionName(currentSourceId, chainId),
          reason: "auto target resolved to selected chain"
        };
      }

      if (request.mode === "delegate" || /主控|总结|汇总|main-control/iu.test(request.message)) {
        return {
          targetType: "main-control",
          targetId: null,
          sessionName: mainControlSessionName,
          reason: "auto target resolved to main-control"
        };
      }
    }

    return {
      targetType: null,
      targetId: null,
      sessionName: null,
      reason: "no side-effect target required"
    };
  }

  function detectSchedulerAction(message: string) {
    return SCHEDULER_ACTION_PATTERNS.find((item) => item.pattern.test(message))?.actionType ?? null;
  }

  function buildActionProposal(state: ControlPlaneState, request: AiChatRequest, actionType: string): AiActionProposal {
    const selectedChainId = resolveChainId(state, request);

    switch (actionType) {
      case "pause_scheduler":
        return {
          proposalKind: "action",
          actionType,
          title: "暂停调度器",
          summary: "将停止 watcher 进程，并把 scheduler-state.json 切到 paused。",
          impact: "会影响新的链调度。",
          riskLevel: "controlled",
          confirmLabel: "确认暂停",
          targetType: "scheduler",
          targetId: null,
          sessionName: null
        };
      case "resume_scheduler":
        return {
          proposalKind: "action",
          actionType,
          title: "恢复调度器",
          summary: "将重新拉起 watcher 进程，并恢复自动补位。",
          impact: "会恢复新的链调度。",
          riskLevel: "controlled",
          confirmLabel: "确认恢复",
          targetType: "scheduler",
          targetId: null,
          sessionName: null
        };
      case "resync_queue":
        return {
          proposalKind: "action",
          actionType,
          title: "重新同步待启动队列",
          summary: "将按 registry / chain-status / tmux 运行态的固定算法重算 pendingStart。",
          impact: "会写回 share/dispatch-queue.json。",
          riskLevel: "controlled",
          confirmLabel: "确认同步",
          targetType: "scheduler",
          targetId: null,
          sessionName: null
        };
      case "promote_queue_item":
        return {
          proposalKind: "action",
          actionType,
          title: selectedChainId ? `提升 ${selectedChainId} 到队列顶部` : "提升队列项到顶部",
          summary: selectedChainId ? `将 ${selectedChainId} 提升为下一条候选链。` : "需要先选择一条链后才能提升。",
          impact: "会写回 share/dispatch-queue.json。",
          riskLevel: "controlled",
          confirmLabel: "确认提升",
          targetType: "chain",
          targetId: selectedChainId,
          sessionName: selectedChainId ? buildChainSessionName(currentSourceId, selectedChainId) : null
        };
      case "generate_wave_summary":
        return {
          proposalKind: "action",
          actionType,
          title: `触发 ${state.waveSummary.wave} Wave 汇总`,
          summary: `将向 ${mainControlSessionName} 发送 generate-wave-summary ${state.waveSummary.wave} 指令。`,
          impact: "会触发主控后续生成或更新 Wave Review。",
          riskLevel: "controlled",
          confirmLabel: "确认触发",
          targetType: "wave",
          targetId: state.waveSummary.wave,
          sessionName: mainControlSessionName
        };
      case "summarize_overview":
      default:
        return {
          proposalKind: "action",
          actionType: "summarize_overview",
          title: "触发主控全局汇总",
          summary: `将向 ${mainControlSessionName} 发送 summarize-global-state 指令。`,
          impact: "会在主控 session 中生成新的总结。",
          riskLevel: "controlled",
          confirmLabel: "确认触发",
          targetType: "main-control",
          targetId: null,
          sessionName: mainControlSessionName
        };
    }
  }

  function buildDispatchProposal(state: ControlPlaneState, request: AiChatRequest, resolvedTarget: AiResolvedTarget): AiActionProposal {
    if (resolvedTarget.targetType !== "chain" && resolvedTarget.targetType !== "main-control") {
      throw new AiBridgeError(400, "Dispatch proposal requires a chain or main-control target");
    }

    const contextChainId = resolvedTarget.targetType === "chain"
      ? resolvedTarget.targetId
      : request.context.selectedChainId;
    const chainDetail = contextChainId
      ? buildChainDetailResponse(state, contextChainId)
      : null;
    const chainSummary = chainDetail?.chain.summary ?? "当前链暂无额外摘要。";
    const workItemSummary = chainDetail ? formatWorkItemSummary(chainDetail) : `当前波次 ${state.overview.currentWave}，调度器 ${state.scheduler.status}。`;
    const detailContext = chainDetail ? `\n链上下文：${chainSummary}\n${workItemSummary}` : `\n${workItemSummary}`;
    const message = `[AI Dock][page=${request.context.page}][mode=${request.mode}] 用户请求：${normalizeMessage(request.message)}${detailContext}`;
    const proposalId = `ai-proposal:${randomUUID()}`;

    dispatchProposalStore.set(proposalId, {
      proposalId,
      targetType: resolvedTarget.targetType,
      targetId: (resolvedTarget.targetId as ChainId | null) ?? null,
      sessionName: resolvedTarget.sessionName ?? (resolvedTarget.targetType === "main-control" ? mainControlSessionName : buildChainSessionName(currentSourceId, resolvedTarget.targetId!)),
      message,
      expiresAt: now().getTime() + 10 * 60 * 1000
    });

    return {
      proposalKind: "dispatch",
      proposalId,
      title: resolvedTarget.targetType === "chain" ? `向 ${resolvedTarget.targetId} 派发消息` : "向 main-control 派发消息",
      summary: message,
      impact: resolvedTarget.targetType === "chain" ? "会把当前意图投递给对应 worker session。" : "会把当前意图投递给 main-control。",
      riskLevel: "controlled",
      confirmLabel: "确认派发",
      targetType: resolvedTarget.targetType === "chain" ? "chain" : "main-control",
      targetId: resolvedTarget.targetId,
      sessionName: resolvedTarget.sessionName,
      message
    };
  }

  function buildAnswer(state: ControlPlaneState, request: AiChatRequest) {
    if (request.mode === "docs") {
      if (request.context.selectedChainId) {
        const detail = buildChainDetailResponse(state, request.context.selectedChainId);
        if (detail) {
          return `当前链 ${detail.chain.nameZh}（${detail.chain.id}）可优先查看 ${detail.documents.mapPath}、${detail.documents.codeListPath}${detail.documents.reviewPath ? `、${detail.documents.reviewPath}` : ""}。${formatWorkItemSummary(detail)}`;
        }
      }

      return "文档模式下，优先查看 Maps/*.md、CodeLists/*.md 和 Reviews/*.md；如果你先选定链，我可以更精确地给出入口。";
    }

    if (request.context.selectedChainId) {
      const detail = buildChainDetailResponse(state, request.context.selectedChainId);
      if (detail) {
        return `${detail.chain.nameZh} 当前阶段 ${detail.chain.stage}，界面状态 ${detail.chain.uiState}；${detail.chain.summary || "暂无额外摘要。"} ${formatWorkItemSummary(detail)}`;
      }
    }

    return `当前波次 ${state.overview.currentWave}，已完成 ${state.overview.completedChains}/${state.overview.totalChains} 条链；调度器 ${state.scheduler.status}，并发 ${state.overview.concurrency.active}/${state.overview.concurrency.max}。`;
  }

  function formatWorkItemSummary(detail: ReturnType<typeof buildChainDetailResponse>) {
    if (!detail?.workItem) {
      return "当前 work-item 暂无额外摘要。";
    }

    return `当前 work-item：模式 ${detail.workItem.mode}；当前任务 ${detail.workItem.currentTask}；可恢复 ${detail.workItem.recoverable ? "是" : "否"}。`;
  }

  async function createDispatchEvent(request: Pick<StoredDispatchProposal, "targetType" | "targetId" | "proposalId">, sessionName: string, message: string) {
    const timestamp = formatTimestamp(now());
    const event: PersistedActionEvent = {
      id: `action:ai_dispatch:${timestamp}`,
      type: "action_executed",
      timestamp,
      chainId: request.targetType === "chain" ? request.targetId : null,
      level: "info",
      title: request.targetType === "chain" ? `已向 ${request.targetId} 派发 AI 消息` : "已向 main-control 派发 AI 消息",
      summary: message,
      source: "ai",
      relatedPath: null,
      relatedSession: sessionName as PersistedActionEvent["relatedSession"],
      actionable: false,
      actionType: "ai_dispatch_message",
      command: `tmux send-keys -t ${sessionName} <message> Enter`
    };

    return appendEvent(event);
  }

  return {
    async chat(request) {
      const state = await loadState();
      const message = normalizeMessage(request.message);

      if (!message) {
        throw new AiBridgeError(400, "AI message is required");
      }

      const schedulerAction = detectSchedulerAction(message);
      const resolvedTarget = resolveTarget(state, request, schedulerAction);

      if (isSideEffectfulMode(request.mode) && looksLikeShellCommand(message)) {
        return {
          kind: "answer",
          response: "这条请求更像终端 / 高风险命令，不会通过 AI Dock 直接派发。请继续沿用终端工作流处理。",
          resolvedTarget: {
            targetType: null,
            targetId: null,
            sessionName: null,
            reason: "shell-like delegate message rejected"
          },
          proposal: null
        };
      }

      if (schedulerAction) {
        return {
          kind: "proposal",
          response: "我识别到这是一个带副作用的调度意图，先给出提案卡供你确认。",
          resolvedTarget,
          proposal: buildActionProposal(state, request, schedulerAction)
        };
      }

      if (isSideEffectfulMode(request.mode) && resolvedTarget.targetType !== null) {
        return {
          kind: "proposal",
          response: "我识别到这是一个需要派发或接管的请求，先生成提案卡，确认后再发送到目标 session。",
          resolvedTarget,
          proposal: buildDispatchProposal(state, request, resolvedTarget)
        };
      }

      return {
        kind: "answer",
        response: buildAnswer(state, request),
        resolvedTarget,
        proposal: null
      };
    },

    async dispatch(request) {
      const proposal = dispatchProposalStore.get(request.proposalId);

      if (!proposal || proposal.expiresAt < now().getTime()) {
        dispatchProposalStore.delete(request.proposalId);
        throw new AiBridgeError(409, `Unknown or expired AI proposal: ${request.proposalId}`);
      }

      dispatchProposalStore.delete(request.proposalId);

      const { stdout, stderr } = await execFile("tmux", ["send-keys", "-t", proposal.sessionName, proposal.message, "Enter"], {
        cwd: paths.projectRoot,
        timeout: 5000
      });
      const eventId = await createDispatchEvent({
        targetType: proposal.targetType,
        targetId: proposal.targetId,
        proposalId: proposal.proposalId
      }, proposal.sessionName, proposal.message);

      return {
        success: true,
        eventId,
        targetType: proposal.targetType,
        targetId: proposal.targetId,
        sessionName: proposal.sessionName,
        message: proposal.message,
        stdout,
        stderr
      };
    }
  };
}
