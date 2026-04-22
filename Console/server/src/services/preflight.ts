import type { ChainId, ConsoleActionType, PreflightIssue, PreflightSummary, WorkItemMode } from "../../../shared/event-model";

import type { LoadedControlPlaneSources } from "./state-loader";
import { formatTimestamp, resyncQueue } from "./scheduler-service";
import { getWorkspaceChainSessions, isChainSessionRunning } from "./chain-session-utils";

const DRIFT_BLOCKING_ACTIONS: ConsoleActionType[] = [
  "start_chain_session",
  "resume_chain_session",
  "pause_scheduler",
  "resume_scheduler",
  "promote_queue_item",
  "resync_queue",
  "handoff_main_control",
  "rotate_main_control_session"
];

interface BuildPreflightOptions {
  now?: () => Date;
}

export function buildPreflightSummary(
  sources: LoadedControlPlaneSources,
  options: BuildPreflightOptions = {}
): PreflightSummary {
  const now = options.now ?? (() => new Date());
  const issues: PreflightIssue[] = [];
  const activeChainSessions = getWorkspaceChainSessions(sources.tmuxSessions, sources.workspace.sourceId, sources.registry.map((entry) => entry.id));
  const trackedChainIds = new Set(sources.registry.map((entry) => entry.id));

  if (sources.schedulerFile.desiredState === "running" && sources.watcherAlive === false) {
    issues.push({
      code: "watcher_runtime_stale",
      severity: "stale",
      summary: "scheduler-state 仍标记为 running，但 watcher 进程当前不存活。"
    });
  }

  if (sources.schedulerFile.desiredState === "running" && !sources.healthChecks.tmux.readable) {
    issues.push({
      code: "tmux_runtime_stale",
      severity: "stale",
      summary: "当前无法读取 tmux 运行态，session 视图可能不是最新。"
    });
  }

  const expectedQueue = resyncQueue({
    registry: sources.registry,
    chainStatus: sources.chainStatus,
    currentQueue: sources.queue,
    activeSessions: activeChainSessions,
    sourceId: sources.workspace.sourceId,
    now
  });

  if (!sameQueue(expectedQueue.pendingStart, sources.queue.pendingStart) || expectedQueue.nextCandidate !== sources.queue.nextCandidate) {
    issues.push({
      code: "queue_out_of_sync",
      severity: "needs_resync",
      summary: "dispatch-queue.json 与按当前 registry / chain-status / tmux 推导的队列结果不一致。"
    });
  }

  if (isMainControlResumeStale(sources)) {
    issues.push({
      code: "main_control_resume_stale",
      severity: "stale",
      summary: "main-control-resume.json 已落后于当前链状态或队列真值。"
    });
  }

  for (const [chainId, packet] of Object.entries(sources.chainResumePackets)) {
    if (!trackedChainIds.has(chainId as ChainId)) {
      continue;
    }

    if (isChainResumeStale(chainId as ChainId, sources, packet)) {
      issues.push({
        code: "chain_resume_stale",
        severity: "stale",
        chainId: chainId as ChainId,
        summary: `${chainId} 的链级恢复包已落后于当前真值。`
      });
    }
  }

  const state = derivePreflightState(issues);
  return {
    state,
    checkedAt: formatTimestamp(now()),
    issues,
    blockingActionTypes: state === "drift" ? DRIFT_BLOCKING_ACTIONS : [],
    recommendedActions: collectRecommendedActions(issues)
  };
}

function derivePreflightState(issues: PreflightIssue[]): PreflightSummary["state"] {
  if (issues.some((issue) => issue.severity === "drift")) {
    return "drift";
  }

  if (issues.some((issue) => issue.severity === "needs_resync")) {
    return "needs_resync";
  }

  if (issues.some((issue) => issue.severity === "stale")) {
    return "stale";
  }

  return "fresh";
}

function collectRecommendedActions(issues: PreflightIssue[]) {
  const actions = new Set<string>();

  for (const issue of issues) {
    switch (issue.code) {
      case "queue_out_of_sync":
        actions.add("resync_queue");
        break;
      case "work_item_mode_conflict":
        actions.add("reconcile_work_items");
        break;
      case "watcher_runtime_stale":
        actions.add("resume_scheduler");
        break;
      case "tmux_runtime_stale":
        actions.add("refresh_console");
        break;
      case "main_control_resume_stale":
      case "chain_resume_stale":
        actions.add("handoff_main_control");
        break;
      default:
        break;
    }
  }

  return [...actions];
}

function sameQueue(left: ChainId[], right: ChainId[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolveTruthMode(chainId: ChainId, sources: LoadedControlPlaneSources, activeChainSessions: string[]): WorkItemMode {
  const record = sources.chainStatus[chainId];
  if (record) {
    if (record.blocked === true) {
      return "blocked";
    }

    if (record.stage === "S5") {
      return "done";
    }

    if (isChainSessionRunning(activeChainSessions, sources.workspace.sourceId, chainId)) {
      return "active";
    }

    if (record.stage === "PENDING") {
      return "hold";
    }

    if (record.stage === "ROLLBACK") {
      return "escalate";
    }

    if (record.stage === "S1" || record.stage === "S2" || record.stage === "S3" || record.stage === "S4") {
      return "active";
    }
  }

  if (sources.queue.pendingStart.includes(chainId)) {
    return "hold";
  }

  return "escalate";
}

function parsePacketTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const compact = value.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/u);
  if (compact) {
    const [, year, month, day, hour, minute] = compact;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0).getTime();
  }

  const standard = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/u);
  if (standard) {
    const [, year, month, day, hour, minute, second = "0"] = standard;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
  }

  const shortDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (shortDate) {
    const [, year, month, day] = shortDate;
    return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0).getTime();
  }

  return null;
}

function isMainControlResumeStale(sources: LoadedControlPlaneSources) {
  const packet = sources.mainControlResume;
  if (!packet) {
    return false;
  }

  const packetTime = parsePacketTimestamp(packet.generatedAt);
  if (packetTime === null) {
    return true;
  }

  const queueTime = parsePacketTimestamp(sources.queue.updatedAt);
  if (queueTime !== null && queueTime > packetTime) {
    return true;
  }

  for (const [chainId, record] of Object.entries(sources.chainStatus)) {
    const chainTime = parsePacketTimestamp(record.updatedAt);
    if (chainTime !== null && chainTime > packetTime) {
      return true;
    }

    const tracked = packet.trackedChains[chainId as ChainId];
    if (tracked && tracked.mode !== resolveTruthMode(chainId as ChainId, sources, sources.tmuxSessions.filter((session) => session.startsWith("chain-")))) {
      return true;
    }
  }

  return false;
}

function isChainResumeStale(chainId: ChainId, sources: LoadedControlPlaneSources, packet: LoadedControlPlaneSources["chainResumePackets"][string]) {
  if (!packet) {
    return false;
  }

  const packetTime = parsePacketTimestamp(packet.generatedAt);
  if (packetTime === null) {
    return true;
  }

  const chainTime = parsePacketTimestamp(sources.chainStatus[chainId]?.updatedAt);
  const workItemTime = parsePacketTimestamp(sources.workItems[chainId]?.updatedAt ?? null);
  if (chainTime !== null && chainTime > packetTime) {
    return true;
  }
  if (workItemTime !== null && workItemTime > packetTime) {
    return true;
  }

  const truthMode = resolveTruthMode(chainId, sources, sources.tmuxSessions.filter((session) => session.startsWith("chain-")));
  if (packet.mode !== truthMode) {
    return true;
  }

  return false;
}
