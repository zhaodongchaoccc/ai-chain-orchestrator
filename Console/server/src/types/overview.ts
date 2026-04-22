import type { ActionCapabilityMap, ChainRegistryEntry, ChainResumePacket, ChainState, ChainWorkItemDetail, ControlInboxItem, DefectItemRecord, DispatchQueueState, EventRecord, HealthResponse, MainControlResumePacket, MetaResponse, NotificationRecord, OrchestrationStateSnapshot, OverviewState, PreflightSummary, SchedulerState, SourceRuntimePolicy, SourceRuntimeStateSnapshot, WaveSummary } from "../../../shared/event-model";

export type { ChainRegistryEntry, ChainState, DispatchQueueState, HealthResponse, MetaResponse, NotificationRecord, OverviewState, SchedulerState, WaveSummary };

export interface HealthCheckResult {
  readable: boolean;
  detail?: string;
}

export interface HealthApiResponse extends HealthResponse {
  checks: {
    chainRegistry: HealthCheckResult;
    chainStatus: HealthCheckResult;
    dispatchQueue: HealthCheckResult;
    schedulerState: HealthCheckResult;
    chineseNames: HealthCheckResult;
    workItems?: HealthCheckResult;
    notifications: HealthCheckResult;
    maps: HealthCheckResult;
    reviews: HealthCheckResult;
    tmux: HealthCheckResult;
    watcherPid: HealthCheckResult;
    watcherLog: HealthCheckResult;
  };
  schedulerStatus?: SchedulerState["status"];
  watcherPid?: number | null;
  watcherAlive?: boolean | null;
  activeSessions?: string[];
  lastActionSummary?: string | null;
  preflight?: PreflightSummary;
  platform?: string;
}

export interface ControlPlaneState {
  workspace?: {
    sourceId: string;
    legacyRoot: boolean;
  };
  overview: OverviewState;
  scheduler: SchedulerState;
  waveSummary: WaveSummary;
  chains: ChainState[];
  registry: ChainRegistryEntry[];
  queue: DispatchQueueState;
  mainControlResume?: MainControlResumePacket | null;
  notifications: NotificationRecord[];
  actionEvents?: EventRecord[];
  chainResumePackets?: Partial<Record<string, ChainResumePacket>>;
  workItems?: Record<string, ChainWorkItemDetail>;
  defectItems?: Partial<Record<string, DefectItemRecord[]>>;
  reviewPaths?: string[];
  mapStages?: Record<string, ChainState["stage"] | null>;
  manualSessionHolds?: Record<string, string>;
  sourceRuntimeState?: SourceRuntimeStateSnapshot | null;
  sourcePolicy?: SourceRuntimePolicy | null;
  controlInboxItems?: ControlInboxItem[];
  orchestrationState?: OrchestrationStateSnapshot | null;
  health: HealthApiResponse;
  preflight: PreflightSummary;
}

export interface OverviewResponse {
  overview: OverviewState;
  scheduler: SchedulerState;
  waveSummary: WaveSummary;
  mainControlResume?: MainControlResumePacket | null;
}

export interface ControlResponse extends OverviewResponse {
  workspace?: ControlPlaneState["workspace"];
  queue: DispatchQueueState;
  notifications: NotificationRecord[];
  preflight: PreflightSummary;
  health: HealthApiResponse;
  actions?: ActionCapabilityMap;
  sourceRuntimeState?: SourceRuntimeStateSnapshot | null;
  sourcePolicy?: SourceRuntimePolicy | null;
  controlInboxItems?: ControlInboxItem[];
  orchestrationState?: OrchestrationStateSnapshot | null;
}
