import type { EventRecord, NotificationRecord } from "../../../shared/event-model";

import type { ControlPlaneState } from "../types/overview";

export function buildNotificationProjection(state: ControlPlaneState, events: EventRecord[]): NotificationRecord[] {
  const baseNotifications = state.notifications.map((notification) => normalizeBaseNotification(notification));
  const existingTargets = new Set(
    baseNotifications
      .filter((notification) => notification.status !== "resolved")
      .map((notification) => `${notification.targetType}:${notification.targetId ?? ""}`)
  );
  const derivedNotifications = events
    .filter((event) => event.source !== "notification")
    .filter(isAttentionWorthy)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id))
    .map((event) => ({
      id: `notification:${event.id}`,
      eventId: event.id,
      timestamp: event.timestamp,
      level: event.level,
      title: event.title,
      summary: event.summary,
      targetType: deriveTargetType(event),
      targetId: event.chainId,
      status: "derived-unread",
      recommendedAction: deriveRecommendedAction(event),
      canAiHandle: false
    } satisfies NotificationRecord))
    .filter((notification) => !existingTargets.has(`${notification.targetType}:${notification.targetId ?? ""}`));

  return [...baseNotifications, ...derivedNotifications].sort(
    (left, right) => right.timestamp.localeCompare(left.timestamp) || right.id.localeCompare(left.id)
  );
}

function normalizeBaseNotification(notification: NotificationRecord): NotificationRecord {
  return {
    ...notification,
    title: normalizeTitle(notification),
    summary: normalizeSummary(notification),
    recommendedAction: normalizeRecommendedAction(notification)
  };
}

function isAttentionWorthy(event: EventRecord) {
  if (event.source === "notification") {
    return true;
  }

  if (event.type === "scheduler_paused" || event.type === "scheduler_alerted" || event.type === "scheduler_stopped") {
    return true;
  }

  return event.type === "risk_detected" && event.actionable;
}

function deriveTargetType(event: EventRecord): NotificationRecord["targetType"] {
  if (event.chainId) {
    return "chain";
  }

  if (event.source === "scheduler" || event.type.startsWith("scheduler_")) {
    return "scheduler";
  }

  return "system";
}

function deriveRecommendedAction(event: EventRecord) {
  switch (event.type) {
    case "scheduler_paused":
      return "请先检查待处理工作，确认后恢复调度器。";
    case "scheduler_alerted":
    case "scheduler_stopped":
      return "请检查调度器状态、watcher pid 与 tmux 会话。";
    case "risk_detected":
      return event.chainId ? `请检查 ${event.chainId} 当前阻塞点。` : "请检查控制面真值文件与运行态输入。";
    default:
      return null;
  }
}

function containsChinese(value: string | null | undefined) {
  return Boolean(value && /[\u3400-\u9fff]/u.test(value));
}

function normalizeTitle(notification: NotificationRecord) {
  if (containsChinese(notification.title)) {
    return notification.title;
  }

  switch (notification.targetType) {
    case "chain":
      return "业务链通知";
    case "scheduler":
      return "调度器通知";
    case "wave":
      return "波次通知";
    case "system":
    default:
      return "系统通知";
  }
}

function normalizeSummary(notification: NotificationRecord) {
  if (containsChinese(notification.summary)) {
    return notification.summary;
  }

  switch (notification.targetType) {
    case "chain":
      return containsChinese(notification.title) ? `${notification.title} 有新的链路通知。` : "该链路有新的链路通知。";
    case "scheduler":
      return "调度器当前有新的状态通知。";
    case "wave":
      return "当前波次有新的状态通知。";
    case "system":
    default:
      return "系统当前有新的通知。";
  }
}

function normalizeRecommendedAction(notification: NotificationRecord) {
  if (!notification.recommendedAction || containsChinese(notification.recommendedAction)) {
    return notification.recommendedAction;
  }

  switch (notification.targetType) {
    case "chain":
      return containsChinese(notification.title) ? `请检查 ${notification.title} 当前状态。` : "请检查该链路当前状态。";
    case "scheduler":
      return "请检查调度器当前状态。";
    case "wave":
      return "请检查当前波次状态。";
    case "system":
    default:
      return "请检查系统当前状态。";
  }
}
