import os from "node:os";
import path from "node:path";

import type { ChainId, ChainState, EventRecord, NotificationRecord } from "../../../shared/event-model";
import { buildChainSessionName, DEFAULT_SOURCE_ID } from "../../../shared/event-model";

import type { ControlPlaneState } from "../types/overview";

const DEFAULT_TIMESTAMP = "1970-01-01 00:00";
const DEFAULT_WORKTREES_ROOT = process.env.FF_WORKTREES_ROOT ?? path.join(process.env.HOME ?? os.homedir(), "ff-worktrees");

const schedulerStatusZh = {
  running: "运行中",
  paused: "已暂停",
  stopped: "已停止",
  abnormal: "异常"
} as const;

const schedulerEventTitleZh = {
  running: "调度器已启动",
  paused: "调度器已暂停",
  stopped: "调度器已停止",
  abnormal: "调度器异常"
} as const;

export function buildEventStream(state: ControlPlaneState): EventRecord[] {
  const eventSourceId = state.workspace?.sourceId ?? DEFAULT_SOURCE_ID;
  const events: EventRecord[] = [...(state.actionEvents ?? [])].map((event) => normalizeLegacyEventForDisplay(event, eventSourceId));

  for (const notification of state.notifications) {
    const chain = findChain(state, notification.targetId);
    const notificationEventType = {
      chain: "chain_notified",
      scheduler: "scheduler_notified",
      wave: "wave_notified",
      system: "system_notified"
    } as const;

    events.push({
      id: notification.eventId,
      type: notificationEventType[notification.targetType],
      timestamp: normalizeTimestamp(notification.timestamp),
      chainId: chain?.id ?? null,
      level: notification.level,
      title: normalizeNotificationTitle(notification, chain),
      summary: normalizeNotificationSummary(notification, chain),
      source: "notification",
      relatedPath: `share/notifications/${notification.id}.md`,
      relatedSession: chain?.sessionName ?? null,
      actionable: notification.status === "derived-unread"
    });
  }

  const schedulerEvent = buildSchedulerEvent(state);
  if (schedulerEvent) {
    events.push(schedulerEvent);
  }

  const queueEvent = buildQueueEvent(state);
  if (queueEvent) {
    events.push(queueEvent);
  }

  events.push(...buildRiskEvents(state));

  return events.sort(compareEventsLatestFirst);
}

export function normalizeLegacyEventForDisplay(event: EventRecord, sourceId: string): EventRecord {
  if (!event.chainId) {
    return event;
  }

  const nextSessionName = buildChainSessionName(sourceId, event.chainId);
  const legacySessionName = `chain-${event.chainId}`;
  const nextSummary = event.summary
    .replaceAll(legacySessionName, nextSessionName)
    .replace(
      new RegExp(`(resume-chain-session\\.sh ${escapeRegExp(event.chainId)})(?! ${escapeRegExp(sourceId)}(?:$|\\s))`, "gu"),
      `$1 ${sourceId}`
    )
    .replace(
      /^\[OK\] opencode 工作目录: .+$/gmu,
      `[OK] opencode 工作目录: ${path.join(DEFAULT_WORKTREES_ROOT, sourceId)}`
    );

  return {
    ...event,
    summary: nextSummary,
    relatedSession: event.relatedSession === legacySessionName ? nextSessionName : event.relatedSession
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildSchedulerEvent(state: ControlPlaneState): EventRecord | null {
  const timestamp = normalizeTimestamp(
    state.scheduler.updatedAt ?? state.health.lastActionSummary?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u)?.[0] ?? null
  );

  const eventTypes = {
    running: "scheduler_started",
    paused: "scheduler_paused",
    stopped: "scheduler_stopped",
    abnormal: "scheduler_alerted"
  } as const;

  const eventType = eventTypes[state.scheduler.status];
  if (!eventType) {
    return null;
  }

  const summary = state.scheduler.lastActionSummary
    && containsChinese(state.scheduler.lastActionSummary)
    ? state.scheduler.lastActionSummary
    : `调度器当前状态：${schedulerStatusZh[state.scheduler.status]}`;

  return {
    id: `scheduler:${state.scheduler.status}:${timestamp}`,
    type: eventType,
    timestamp,
    chainId: null,
    level: state.scheduler.status === "abnormal" || state.scheduler.status === "stopped" ? "critical" : "info",
    title: schedulerEventTitleZh[state.scheduler.status],
    summary,
    source: "scheduler",
    relatedPath: "share/scheduler-state.json",
    relatedSession: null,
    actionable: state.scheduler.status !== "running"
  };
}

function buildQueueEvent(state: ControlPlaneState): EventRecord | null {
  if (state.queue.pendingStart.length === 0 && state.queue.nextCandidate === null && state.queue.updatedAt === null) {
    return null;
  }

  const pendingCount = state.queue.pendingStart.length;
  const nextChain = state.queue.nextCandidate;

  return {
    id: `queue:${normalizeTimestamp(state.queue.updatedAt)}:${pendingCount}:${nextChain ?? "none"}`,
    type: "queue_updated",
    timestamp: normalizeTimestamp(state.queue.updatedAt),
    chainId: nextChain,
    level: state.scheduler.status === "paused" && pendingCount > 0 ? "warning" : "info",
    title: "待启动队列已更新",
    summary: pendingCount > 0
      ? `当前有 ${pendingCount} 条待启动链，下一候选链为 ${nextChain ?? "无"}。`
      : "当前待启动队列为空。",
    source: "system",
    relatedPath: "share/dispatch-queue.json",
    relatedSession: findChain(state, nextChain)?.sessionName ?? null,
    actionable: pendingCount > 0
  };
}

function buildRiskEvents(state: ControlPlaneState): EventRecord[] {
  const blockedChainEvents = state.chains
    .filter((chain) => chain.blocked)
    .map((chain) => ({
      id: `risk:${chain.id}:${normalizeTimestamp(chain.updatedAt)}`,
      type: "risk_detected",
      timestamp: normalizeTimestamp(chain.updatedAt),
      chainId: chain.id,
      level: chain.riskCount.critical > 0 ? "critical" : "warning",
      title: `${chain.nameZh} 需要关注`,
      summary: containsChinese(chain.summary) ? chain.summary : `${chain.nameZh} 当前处于阻塞状态。`,
      source: "system",
      relatedPath: chain.mapPath,
      relatedSession: chain.sessionName,
      actionable: true
    } satisfies EventRecord));

  if (blockedChainEvents.length > 0 || state.overview.mainControlHealth !== "abnormal") {
    return blockedChainEvents;
  }

  return [
    {
      id: `risk:system:${normalizeTimestamp(state.overview.lastSummaryAt)}`,
      type: "risk_detected",
      timestamp: normalizeTimestamp(state.overview.lastSummaryAt),
      chainId: null,
      level: "critical",
      title: "系统健康状态需要关注",
      summary: "控制中心当前处于异常状态。",
      source: "system",
      relatedPath: null,
      relatedSession: null,
      actionable: true
    }
  ];
}

function findChain(state: ControlPlaneState, targetId: NotificationRecord["targetId"]): ChainState | undefined {
  if (!targetId) {
    return undefined;
  }

  return state.chains.find((chain) => chain.id === targetId) ?? state.chains.find((chain) => chain.id === targetId as ChainId);
}

function normalizeTimestamp(timestamp: string | null | undefined) {
  return timestamp && timestamp.trim() ? timestamp : DEFAULT_TIMESTAMP;
}

function containsChinese(value: string | null | undefined) {
  return Boolean(value && /[\u3400-\u9fff]/u.test(value));
}

function normalizeNotificationTitle(notification: NotificationRecord, chain?: ChainState) {
  if (containsChinese(notification.title)) {
    return notification.title;
  }

  switch (notification.targetType) {
    case "chain":
      return chain?.nameZh ?? "业务链通知";
    case "scheduler":
      return "调度器通知";
    case "wave":
      return "波次通知";
    case "system":
    default:
      return "系统通知";
  }
}

function normalizeNotificationSummary(notification: NotificationRecord, chain?: ChainState) {
  if (containsChinese(notification.summary)) {
    return notification.summary;
  }

  switch (notification.targetType) {
    case "chain":
      return `${chain?.nameZh ?? notification.targetId ?? "该链路"} 有新的链路通知。`;
    case "scheduler":
      return "调度器当前有新的状态通知。";
    case "wave":
      return "当前波次有新的状态通知。";
    case "system":
    default:
      return "系统当前有新的通知。";
  }
}

function compareEventsLatestFirst(left: EventRecord, right: EventRecord) {
  const timestampDiff = right.timestamp.localeCompare(left.timestamp);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return right.id.localeCompare(left.id);
}
