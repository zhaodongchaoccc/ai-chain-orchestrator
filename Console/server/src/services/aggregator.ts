import { CHAIN_STAGE_META, type ChainNameZh, type ChainRegistryEntry, type ChainState, type ChainStageLabel, type ChainUiState, type MainControlHealth, type NotificationRecord, type OverviewWave, type SchedulerState, type WaveSummary } from "../../../shared/event-model";
import type { ControlPlaneState, HealthApiResponse } from "../types/overview";
import type { LoadedControlPlaneSources } from "./state-loader";
import { buildPreflightSummary } from "./preflight";
import { buildChainWorkItemSummary } from "./work-item-view";
import { resolveWorkspaceChainPaths } from "./workspace-chain-paths";
import { buildWorkspaceChainSessionName, getWorkspaceChainSessions, isChainSessionRunning } from "./chain-session-utils";

const WAVE_ORDER: OverviewWave[] = ["P0", "P1", "P2"];

export function aggregateControlPlaneState(sources: LoadedControlPlaneSources): ControlPlaneState {
  const registry = [...sources.registry].sort(compareRegistry);
  const activeChainSessions = getWorkspaceChainSessions(sources.tmuxSessions, sources.workspace.sourceId, registry.map((entry) => entry.id));
  const schedulerStatus = deriveSchedulerStatus(sources, activeChainSessions);
  const schedulerHealthy = schedulerStatus === "running" || schedulerStatus === "paused";
  const chains = registry.map((entry) => buildChainState(entry, sources, activeChainSessions, schedulerStatus));
  const notifications = buildNotifications(sources.notifications);
  const currentWave = deriveCurrentWave(chains);
  const preflight = buildPreflightSummary(sources);
  const mainControlHealth: MainControlHealth = isCoreHealthy(sources.healthChecks) && schedulerHealthy && preflight.state !== "drift" ? "healthy" : "abnormal";
  const overview = {
    currentWave,
    totalChains: registry.length,
    completedChains: chains.filter((chain) => chain.stage === "S5").length,
    activeChains: chains.filter((chain) => chain.uiState === "active" || chain.uiState === "planned" || chain.uiState === "verifying" || chain.uiState === "blocked").length,
    pendingChains: chains.filter((chain) => chain.uiState === "pending").length,
    schedulerStatus,
    mainControlHealth,
    concurrency: {
      active: activeChainSessions.length,
      max: sources.queue.maxConcurrent
    },
    lastNotificationAt: notifications[0]?.timestamp ?? null,
    lastSummaryAt: sources.schedulerFile.updatedAt ?? null
  };
  const scheduler: SchedulerState = {
    ...sources.schedulerFile,
    pid: sources.watcherPid,
    status: schedulerStatus,
    activeSessions: activeChainSessions as SchedulerState["activeSessions"],
    lastActionSummary: sources.watcherLogSummary
  };
  const waveSummary = buildWaveSummary(currentWave, chains, sources.reviewPaths);
  const health: HealthApiResponse = {
    ok: isCoreHealthy(sources.healthChecks) && schedulerHealthy && preflight.state !== "drift",
    checks: sources.healthChecks,
    schedulerStatus,
    watcherPid: sources.watcherPid,
    watcherAlive: sources.watcherAlive,
    activeSessions: activeChainSessions,
    lastActionSummary: sources.watcherLogSummary,
    preflight
  };

  return {
    workspace: sources.workspace,
    overview,
    scheduler,
    waveSummary,
    mainControlResume: sources.mainControlResume,
    chains,
    registry,
    queue: sources.queue,
    notifications,
    actionEvents: sources.actionEvents,
    chainResumePackets: sources.chainResumePackets,
    workItems: sources.workItems,
    defectItems: sources.defectItems,
    reviewPaths: sources.reviewPaths,
    mapStages: sources.mapStages,
    manualSessionHolds: sources.manualSessionHolds,
    sourceRuntimeState: sources.sourceRuntimeState,
    sourcePolicy: sources.sourcePolicy,
    controlInboxItems: sources.controlInboxItems,
    orchestrationState: sources.orchestrationState,
    health,
    preflight
  };
}

function compareRegistry(left: ChainRegistryEntry, right: ChainRegistryEntry) {
  const waveDiff = WAVE_ORDER.indexOf(left.priorityWave) - WAVE_ORDER.indexOf(right.priorityWave);
  return waveDiff === 0 ? left.sequence - right.sequence : waveDiff;
}

function buildChainState(
  entry: ChainRegistryEntry,
  sources: LoadedControlPlaneSources,
  activeChainSessions: string[],
  schedulerStatus: SchedulerState["status"]
): ChainState {
  const record = sources.chainStatus[entry.id] ?? {};
  const stage = normalizeStage(record.stage);
  const blocked = record.blocked === true;
  const uiState = blocked ? "blocked" : toUiState(stage);
  const queuedIndex = sources.queue.pendingStart.indexOf(entry.id);
  const sessionName = buildWorkspaceChainSessionName(sources.workspace.sourceId, entry.id) as Exclude<ChainState["sessionName"], null>;
  const sessionRunning = isChainSessionRunning(activeChainSessions, sources.workspace.sourceId, entry.id);
  const warnings = Number(blocked) + Number(schedulerStatus === "abnormal" && sessionRunning);
  const chainPaths = resolveWorkspaceChainPaths(sources.workspace, entry.id);
  const workItem = buildChainWorkItemSummary(
    {
      id: entry.id,
      nameZh: (sources.chineseNames[entry.id] ?? entry.nameZh) as ChainNameZh,
      stage,
      uiState,
      priorityWave: entry.priorityWave,
      summary: record.summary ?? "",
      updatedAt: record.updatedAt ?? null,
      sessionName,
      sessionRunning,
      queued: queuedIndex >= 0,
      queueIndex: queuedIndex >= 0 ? queuedIndex + 1 : null,
      riskCount: { critical: 0, warning: warnings },
      mapPath: chainPaths.mapPath,
      blocked
    },
    sources.workItems[entry.id]
  );

  return {
    id: entry.id,
    nameZh: (sources.chineseNames[entry.id] ?? entry.nameZh) as ChainNameZh,
    stage,
    uiState,
    priorityWave: entry.priorityWave,
    summary: record.summary ?? "",
    updatedAt: record.updatedAt ?? null,
    sessionName,
    sessionRunning,
    queued: queuedIndex >= 0,
    queueIndex: queuedIndex >= 0 ? queuedIndex + 1 : null,
    riskCount: {
      critical: 0,
      warning: warnings
    },
    mapPath: chainPaths.mapPath,
    blocked,
    workItemMode: workItem.mode,
    workItemTask: workItem.currentTask,
    workItemRecoverable: workItem.recoverable,
    workItemUpdatedAt: workItem.updatedAt
  };
}

function normalizeStage(stage: string | undefined): ChainState["stage"] {
  if (!stage) {
    return "PENDING";
  }

  return stage in CHAIN_STAGE_META ? (stage as ChainStageLabel) : "PENDING";
}

function toUiState(stage: ChainState["stage"]): ChainUiState {
  if (stage === "PENDING") {
    return "pending";
  }

  return CHAIN_STAGE_META[stage].uiState;
}

function deriveSchedulerStatus(sources: LoadedControlPlaneSources, activeChainSessions: string[]): SchedulerState["status"] {
  if (sources.workspace.legacyRoot === false) {
    const runtimeState = sources.sourceRuntimeState?.runtimeState ?? null;

    if (runtimeState === "sleeping") {
      return activeChainSessions.length > 0 ? "abnormal" : "paused";
    }

    if (runtimeState === "running" || runtimeState === "idle-countdown" || runtimeState === "waking" || runtimeState === "pinned") {
      return "running";
    }

    return activeChainSessions.length > 0 ? "running" : "paused";
  }

  if (!sources.healthChecks.tmux.readable || !sources.healthChecks.watcherPid.readable) {
    return "abnormal";
  }

  if (sources.schedulerFile.desiredState === "paused") {
    return activeChainSessions.length > 0 ? "abnormal" : "paused";
  }

  if (sources.watcherPid === null) {
    return "stopped";
  }

  if (sources.watcherAlive === false) {
    return "abnormal";
  }

  return "running";
}

function deriveCurrentWave(chains: ChainState[]): OverviewWave {
  for (const wave of WAVE_ORDER) {
    const waveChains = chains.filter((chain) => chain.priorityWave === wave);
    if (waveChains.some((chain) => chain.stage !== "S5")) {
      return wave;
    }
  }

  return chains.length === 0 ? "mixed" : "all-done";
}

function buildWaveSummary(currentWave: OverviewWave, chains: ChainState[], reviewPaths: string[]): WaveSummary {
  const waveChains = chains.filter((chain) => chain.priorityWave === currentWave);

  return {
    wave: currentWave,
    total: waveChains.length,
    completed: waveChains.filter((chain) => chain.stage === "S5").length,
    active: waveChains.filter((chain) => chain.uiState === "active" || chain.uiState === "planned" || chain.uiState === "verifying" || chain.uiState === "blocked").length,
    pending: waveChains.filter((chain) => chain.uiState === "pending").length,
    reviewPath: resolveWaveReviewPath(currentWave, reviewPaths)
  };
}

function resolveWaveReviewPath(currentWave: OverviewWave, reviewPaths: string[]) {
  if (!WAVE_ORDER.includes(currentWave)) {
    return null;
  }

  return [...reviewPaths]
    .reverse()
    .find((path) => new RegExp(`(^|/)Wave\\d+-${currentWave}\\.md$`, "u").test(path)) ?? null;
}

function buildNotifications(records: LoadedControlPlaneSources["notifications"]): NotificationRecord[] {
  return [...records]
    .sort((left, right) => (right.timestamp ?? "").localeCompare(left.timestamp ?? ""))
    .map((record) => ({
      id: record.id,
      eventId: record.id,
      timestamp: record.timestamp ?? new Date(0).toISOString(),
      level: "warning",
      title: record.title,
      summary: record.summary,
      targetType: record.targetId ? "chain" : "system",
      targetId: record.targetId,
      status: "derived-unread",
      recommendedAction: null,
      canAiHandle: false
    }));
}

function isCoreHealthy(checks: HealthApiResponse["checks"]) {
  return [
    checks.chainRegistry,
    checks.chainStatus,
    checks.dispatchQueue,
    checks.schedulerState,
    checks.workItems ?? { readable: true },
    checks.maps,
    checks.reviews,
    checks.tmux,
    checks.watcherPid,
    checks.watcherLog
  ].every((check) => check.readable);
}
