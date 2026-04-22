import type { ChainId, OverviewWave, RiskRecord } from "../../../shared/event-model";

import type { ControlPlaneState } from "../types/overview";

interface DetectRiskOptions {
  now?: () => Date;
}

const WAVE_ORDER: OverviewWave[] = ["P0", "P1", "P2"];

export function detectRisks(state: ControlPlaneState, options: DetectRiskOptions = {}): RiskRecord[] {
  const now = options.now ?? (() => new Date());
  const risks: RiskRecord[] = [];

  for (const chain of state.chains) {
    if (chain.stage === "S5" && chain.sessionRunning) {
      risks.push({
        id: `risk:completed-session:${chain.id}`,
        level: "warning",
        type: "runtime",
        title: `${chain.nameZh} 已完成链仍保留 session`,
        summary: `${chain.id} 已处于 S5，但 ${chain.sessionName ?? "对应 session"} 仍在运行。`,
        chainId: chain.id,
        recommendedAction: "确认是否需要保留现场；若不需要，清理或脱离该 session。",
        relatedPath: chain.mapPath
      });
    }

    const mapStage = state.mapStages?.[chain.id] ?? null;
    if (mapStage && mapStage !== chain.stage) {
      risks.push({
        id: `risk:map-stage-mismatch:${chain.id}`,
        level: "warning",
        type: "consistency",
        title: `${chain.nameZh} 地图阶段与真值不一致`,
        summary: `Maps 记录为 ${mapStage}，但 chain-status 真值为 ${chain.stage}。`,
        chainId: chain.id,
        recommendedAction: "以 chain-status.json 为准，尽快回写对应业务链地图。",
        relatedPath: chain.mapPath
      });
    }
  }

  for (const chainId of state.queue.pendingStart) {
    const chain = state.chains.find((item) => item.id === chainId);
    if (chain?.stage === "S5") {
      risks.push({
        id: `risk:queue-completed:${chain.id}`,
        level: "warning",
        type: "workflow",
        title: "待启动队列包含已完成链",
        summary: `${chain.id} 已是 S5，但仍出现在 dispatch-queue.pendingStart 中。`,
        chainId: chain.id,
        recommendedAction: "重新同步队列，或手动清理这条已完成链。",
        relatedPath: "share/dispatch-queue.json"
      });
    }
  }

  if (state.scheduler.desiredState === "running" && state.health.watcherPid && state.health.watcherAlive === false) {
    risks.push({
      id: "risk:watcher-dead",
      level: "critical",
      type: "scheduler",
      title: "watcher pid 存在但进程不可用",
      summary: `PID ${state.health.watcherPid} 已记录，但当前进程不可用。`,
      chainId: null,
      recommendedAction: "检查 watcher 运行态并考虑恢复调度器。",
      relatedPath: "share/scheduler-state.json"
    });
  }

  if (
    state.scheduler.status === "running"
    && state.queue.pendingStart.length > 0
    && state.overview.concurrency.active < state.overview.concurrency.max
    && isOlderThan(state.queue.updatedAt, now(), 30)
  ) {
    risks.push({
      id: "risk:queue-stalled",
      level: "warning",
      type: "scheduler",
      title: "并发未满但未补位",
      summary: `当前并发 ${state.overview.concurrency.active}/${state.overview.concurrency.max}，但队列 ${secondsSince(state.queue.updatedAt, now())} 秒未推进。`,
      chainId: state.queue.nextCandidate,
      recommendedAction: "检查 watcher 和队列真值，必要时执行重新同步队列。",
      relatedPath: "share/dispatch-queue.json"
    });
  }

  for (const wave of WAVE_ORDER) {
    const waveChains = state.chains.filter((chain) => chain.priorityWave === wave);
    if (waveChains.length === 0) {
      continue;
    }

    if (waveChains.every((chain) => chain.stage === "S5") && !hasReviewForWave(state.reviewPaths ?? [], wave)) {
      risks.push({
        id: `risk:wave-summary-missing:${wave}`,
        level: "warning",
        type: "wave",
        title: `${wave} Wave 已完成但缺少回顾`,
        summary: `${wave} 下所有链均已达到 S5，但 Reviews 中仍未发现对应波次回顾文件。`,
        chainId: null,
        recommendedAction: `触发 ${wave} Wave 汇总，补齐对应 Reviews 文件。`,
        relatedPath: "Reviews"
      });
    }
  }

  return risks.sort(compareRisks);
}

function hasReviewForWave(reviewPaths: string[], wave: string) {
  return reviewPaths.some((path) => new RegExp(`(^|/)Wave\\d+-${wave}\\.md$`, "u").test(path));
}

function isOlderThan(timestamp: string | null, now: Date, seconds: number) {
  const parsed = parseTimestamp(timestamp);
  if (parsed === null) {
    return false;
  }

  return now.getTime() - parsed.getTime() > seconds * 1000;
}

function secondsSince(timestamp: string | null, now: Date) {
  const parsed = parseTimestamp(timestamp);
  if (parsed === null) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 1000));
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareRisks(left: RiskRecord, right: RiskRecord) {
  const levelRank = {
    critical: 0,
    warning: 1
  } as const;

  return levelRank[left.level] - levelRank[right.level] || left.title.localeCompare(right.title);
}
