import type { NotificationRecord, PreflightState, RiskRecord, SchedulerStatus } from "../../../shared/event-model";

export interface ScopeStatusCard {
  key: "freshness" | "runtime" | "workflow" | "attention";
  label: string;
  value: string;
  detail: string;
  tone: "healthy" | "running" | "warning" | "critical" | "pending" | "blocked" | "paused" | "stopped";
}

function summarizeAttention(risks: RiskRecord[], notifications: NotificationRecord[]) {
  const critical = risks.filter((risk) => risk.level === "critical").length;
  const warning = risks.filter((risk) => risk.level === "warning").length;
  const notificationCount = notifications.length;

  if (critical > 0) {
    return {
      value: "严重",
      detail: `严重 ${critical} 条，通知 ${notificationCount} 条`,
      tone: "critical" as const
    };
  }

  if (warning > 0 || notificationCount > 0) {
    return {
      value: "关注",
      detail: `警告 ${warning} 条，通知 ${notificationCount} 条`,
      tone: "warning" as const
    };
  }

  return {
    value: "稳定",
    detail: "当前无高优先级关注项",
    tone: "healthy" as const
  };
}

function mapFreshness(preflightState: PreflightState | null | undefined) {
  switch (preflightState) {
    case "drift":
      return { value: "DRIFT", detail: "高风险动作应暂停，先处理漂移", tone: "critical" as const };
    case "needs_resync":
      return { value: "NEEDS_RESYNC", detail: "当前派生层需要重新同步", tone: "warning" as const };
    case "stale":
      return { value: "STALE", detail: "存在陈旧信号，建议先复核", tone: "warning" as const };
    case "fresh":
    default:
      return { value: "FRESH", detail: "当前真值与运行态一致", tone: "healthy" as const };
  }
}

function mapRuntime(status: SchedulerStatus) {
  switch (status) {
    case "running":
      return { value: "RUNNING", detail: "当前主控处于运行状态", tone: "running" as const };
    case "paused":
      return { value: "PAUSED", detail: "当前主控已暂停自动调度", tone: "paused" as const };
    case "abnormal":
      return { value: "ABNORMAL", detail: "当前主控存在运行异常", tone: "critical" as const };
    case "stopped":
    default:
      return { value: "STOPPED", detail: "当前主控未运行", tone: "stopped" as const };
  }
}

export function buildGlobalStatusMatrix(input: {
  preflightState: PreflightState | null | undefined;
  schedulerStatus: SchedulerStatus;
  workspacesCount: number;
  activeChains: number;
  pendingChains: number;
  risks: RiskRecord[];
  notifications: NotificationRecord[];
}): ScopeStatusCard[] {
  const freshness = mapFreshness(input.preflightState);
  const runtime = mapRuntime(input.schedulerStatus);
  const workflow = input.activeChains > 0
    ? { value: "运行中", detail: `活跃链 ${input.activeChains} · 待定 ${input.pendingChains}`, tone: "running" as const }
    : input.pendingChains > 0
      ? { value: "待处理", detail: `当前仍有 ${input.pendingChains} 条待定链`, tone: "pending" as const }
      : { value: "空闲", detail: `当前接入 ${input.workspacesCount} 个需求源`, tone: "healthy" as const };
  const attention = summarizeAttention(input.risks, input.notifications);

  return [
    { key: "freshness", label: "新鲜度", ...freshness },
    { key: "runtime", label: "运行态", ...runtime },
    { key: "workflow", label: "编排态", ...workflow },
    { key: "attention", label: "关注度", ...attention }
  ];
}

export function buildSourceStatusMatrix(input: {
  preflightState: PreflightState | null | undefined;
  schedulerStatus: SchedulerStatus;
  activeChains: number;
  pendingStartCount: number;
  notifications: NotificationRecord[];
}): ScopeStatusCard[] {
  const freshness = mapFreshness(input.preflightState);
  const runtime = mapRuntime(input.schedulerStatus);
  const workflow = input.activeChains > 0
    ? { value: "运行中", detail: `当前活跃链 ${input.activeChains} 条`, tone: "running" as const }
    : input.pendingStartCount > 0
      ? { value: "排队中", detail: `待启动队列 ${input.pendingStartCount} 条`, tone: "pending" as const }
      : { value: "空闲", detail: "当前需求暂无运行中链", tone: "healthy" as const };
  const attention = input.notifications.length > 0
    ? { value: "关注", detail: `当前需求通知 ${input.notifications.length} 条`, tone: "warning" as const }
    : { value: "稳定", detail: "当前需求无额外通知", tone: "healthy" as const };

  return [
    { key: "freshness", label: "新鲜度", ...freshness },
    { key: "runtime", label: "运行态", ...runtime },
    { key: "workflow", label: "编排态", ...workflow },
    { key: "attention", label: "关注度", ...attention }
  ];
}
