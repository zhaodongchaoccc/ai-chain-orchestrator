export const CHAIN_ID_TO_NAME_ZH = {
  Defect: "缺陷处理",
  ContractAddAndFee: "合同创建并收费",
  CustomerServiceStatus: "客户服务状态",
  ContractDetailFields: "合同明细扩展字段",
  ContractAutoNumbering: "合同自动编号",
  OperationLogTracking: "操作日志记录",
  PaymentPermissionAdjustment: "收费记录权限调整",
  HomepageReminder: "首页合同到期提醒",
  ReceiptPrinting: "收款单收据打印",
  OldDataUpgrade: "旧版数据升级",
  ChargeStatistical: "合同收费统计",
  EmployeePerformance: "员工绩效"
} as const;

export const CHAIN_IDS = Object.keys(CHAIN_ID_TO_NAME_ZH) as ChainId[];
export const DEFAULT_SOURCE_ID = "newfee";

export const CHAIN_ID_PATTERN = /^[A-Z][A-Za-z0-9]*$/;

export const CHAIN_STAGE_META = {
  S1: {
    label: "S1",
    descriptionZh: "需求收敛中",
    uiState: "discovery"
  },
  S2: {
    label: "S2",
    descriptionZh: "代码入口定位 / 实现中",
    uiState: "active"
  },
  S3: {
    label: "S3",
    descriptionZh: "最小改动方案已确定",
    uiState: "planned"
  },
  S4: {
    label: "S4",
    descriptionZh: "实现完成，待验证",
    uiState: "verifying"
  },
  S5: {
    label: "S5",
    descriptionZh: "验证通过，完整收口",
    uiState: "done"
  }
} as const;

export type ChainId = keyof typeof CHAIN_ID_TO_NAME_ZH;
export type ChainNameZh = (typeof CHAIN_ID_TO_NAME_ZH)[ChainId];

export type ChainStageLabel = keyof typeof CHAIN_STAGE_META;
export type ChainStageUiState = (typeof CHAIN_STAGE_META)[ChainStageLabel]["uiState"];
export type ChainStageValue = ChainStageLabel | "PENDING";
export type ChainUiState = ChainStageUiState | "pending" | "blocked";
export type WorkItemMode = "active" | "hold" | "blocked" | "done" | "escalate";
export type PreflightState = "fresh" | "stale" | "drift" | "needs_resync";

export type PriorityWave = "P0" | "P1" | "P2";
export type OverviewWave = PriorityWave | "mixed" | "all-done";
export type SchedulerDesiredState = "running" | "paused";
export type SchedulerStatus = SchedulerDesiredState | "abnormal" | "stopped";
export type MainControlHealth = "healthy" | "abnormal";
export type EventLevel = "info" | "warning" | "critical";
export type EventSource = "notification" | "system" | "scheduler" | "ai" | "action";
export type RiskLevel = "warning" | "critical";
export type RiskType = "scheduler" | "consistency" | "runtime" | "wave" | "workflow";
export type NotificationTargetType = "chain" | "scheduler" | "wave" | "system";
export type NotificationStatus = "derived-unread" | "acknowledged" | "resolved";
export type WorkspaceKind = "combined" | "single";
export type ConsoleActionType =
  | "generate_fee_api_docs"
  | "generate_chain_test_cases"
  | "open_session"
  | "start_chain_session"
  | "resume_chain_session"
  | "open_terminal_and_attach"
  | "copy_attach_command"
  | "copy_review_path"
  | "send_to_defect"
  | "claim_defect_item"
  | "mark_defect_fixed"
  | "verify_defect_item"
  | "escalate_to_source_control"
  | "escalate_to_global_control"
  | "claim_control_item"
  | "resolve_control_item"
  | "pause_scheduler"
  | "resume_scheduler"
  | "promote_queue_item"
  | "resync_queue"
  | "sleep_source_main_control"
  | "wake_source_main_control"
  | "summarize_overview"
  | "handoff_main_control"
  | "rotate_main_control_session"
  | "open_main_control_terminal"
  | "generate_wave_summary";

export type ChainSessionName = `chain-${string}`;
export type ChainMapFilename = `${ChainId}.md`;
export type ChainMapPath = `Maps/${string}.md`;
export type ChainCodeListPath = `CodeLists/${string}.md`;
export type NotificationFileName = `${string}-${ChainId}.md`;

export interface ChainRegistryEntry {
  id: ChainId;
  nameZh: ChainNameZh;
  priorityWave: PriorityWave;
  sequence: number;
  enabled: boolean;
}

export interface WorkspaceRegistryEntry {
  sourceId: string;
  label: string;
  kind: WorkspaceKind;
  enabled: boolean;
  sourceDocPath: string;
  worktreePath?: string | null;
  legacyRoot: boolean;
  draftIncomplete: boolean;
}

export interface ParsedChainSessionName {
  sourceId: string | null;
  chainId: string;
  legacy: boolean;
}

export function normalizeSourceId(sourceId?: string | null) {
  return typeof sourceId === "string" && sourceId.trim().length > 0 ? sourceId.trim() : DEFAULT_SOURCE_ID;
}

export function buildChainSessionName(sourceId: string | null | undefined, chainId: string) {
  return `chain-${normalizeSourceId(sourceId)}-${chainId}` as ChainSessionName;
}

export function parseChainSessionName(sessionName: string): ParsedChainSessionName | null {
  const scopedMatch = sessionName.match(/^chain-(.+)-([A-Z][A-Za-z0-9]*)$/u);
  if (scopedMatch) {
    return {
      sourceId: scopedMatch[1],
      chainId: scopedMatch[2],
      legacy: false
    };
  }

  const legacyMatch = sessionName.match(/^chain-([A-Z][A-Za-z0-9]*)$/u);
  if (legacyMatch) {
    return {
      sourceId: null,
      chainId: legacyMatch[1],
      legacy: true
    };
  }

  return null;
}

export interface SchedulerStateFile {
  desiredState: SchedulerDesiredState;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DispatchQueueState {
  maxConcurrent: number;
  pendingStart: ChainId[];
  nextCandidate: ChainId | null;
  updatedAt: string | null;
}

export interface SchedulerState extends SchedulerStateFile {
  pid: number | null;
  status: SchedulerStatus;
  activeSessions: ChainSessionName[];
  lastActionSummary: string | null;
}

export interface ChainRiskCount {
  critical: number;
  warning: number;
}

export interface ChainState {
  id: ChainId;
  nameZh: ChainNameZh;
  stage: ChainStageValue;
  uiState: ChainUiState;
  priorityWave: PriorityWave | "unknown";
  summary: string;
  updatedAt: string | null;
  sessionName: ChainSessionName | null;
  sessionRunning: boolean;
  queued: boolean;
  queueIndex: number | null;
  riskCount: ChainRiskCount;
  mapPath: ChainMapPath;
  blocked: boolean;
  workItemMode?: WorkItemMode | null;
  workItemTask?: string | null;
  workItemRecoverable?: boolean | null;
  workItemUpdatedAt?: string | null;
}

export interface ChainWorkItemSummary {
  mode: WorkItemMode;
  currentTask: string;
  recoverable: boolean;
  updatedAt: string | null;
}

export interface ChainWorkItemDetail extends ChainWorkItemSummary {
  expectedOutput: string | null;
  allowedActions: string[];
  forbiddenActions: string[];
  lastVerifiedAt: string | null;
  lastVerifiedBy: string | null;
  sourceChainId?: string | null;
  severity?: string | null;
  regression?: boolean | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  verificationScope?: string[];
}

export interface MainControlResumeTrackedChain {
  chainId: ChainId;
  stage: ChainStageValue | null;
  summary: string;
  mode: WorkItemMode;
  currentTask: string;
  recoverable: boolean;
  queued: boolean;
  sessionRunning: boolean;
  blocked: boolean;
  rollback: boolean;
}

export interface MainControlResumeDeltaModeChange {
  chainId: ChainId;
  from: WorkItemMode | null;
  to: WorkItemMode | null;
}

export interface MainControlResumeDeltaTaskChange {
  chainId: ChainId;
  from: string | null;
  to: string | null;
}

export interface MainControlResumeDelta {
  changedChains: ChainId[];
  queueAdded: ChainId[];
  queueRemoved: ChainId[];
  modeChanged: MainControlResumeDeltaModeChange[];
  taskChanged: MainControlResumeDeltaTaskChange[];
}

export interface MainControlResumePacket {
  generatedAt: string;
  handoffPath: string;
  running: ChainId[];
  pending: ChainId[];
  blocked: ChainId[];
  rollback: ChainId[];
  completedKept: ChainId[];
  queue: {
    pendingStart: ChainId[];
    nextCandidate: ChainId | null;
    updatedAt: string | null;
  };
  trackedChains: Partial<Record<ChainId, MainControlResumeTrackedChain>>;
  workItems: Partial<Record<ChainId, Pick<MainControlResumeTrackedChain, "mode" | "currentTask" | "recoverable">>>;
  delta: MainControlResumeDelta;
}

export interface ChainResumePacket {
  generatedAt: string;
  chainId: ChainId;
  stage: ChainStageValue | null;
  summary: string;
  mode: WorkItemMode;
  currentTask: string;
  recoverable: boolean;
  queued: boolean;
  sessionRunning: boolean;
  blocked: boolean;
  rollback: boolean;
  paths: {
    map: string;
    codeList: string;
    workItem: string;
  };
  delta: {
    stageChanged: boolean;
    modeChanged: boolean;
    taskChanged: boolean;
    summaryChanged: boolean;
    queuedChanged: boolean;
    sessionRunningChanged: boolean;
  };
}

export interface PreflightIssue {
  code: string;
  severity: Exclude<PreflightState, "fresh">;
  summary: string;
  chainId?: ChainId | null;
}

export interface PreflightSummary {
  state: PreflightState;
  checkedAt: string;
  issues: PreflightIssue[];
  blockingActionTypes: ConsoleActionType[];
  recommendedActions: string[];
}

export interface OverviewState {
  currentWave: OverviewWave;
  totalChains: number;
  completedChains: number;
  activeChains: number;
  pendingChains: number;
  schedulerStatus: SchedulerStatus;
  mainControlHealth: MainControlHealth;
  concurrency: {
    active: number;
    max: number;
  };
  lastNotificationAt: string | null;
  lastSummaryAt: string | null;
}

export interface EventRecord {
  id: string;
  type: string;
  timestamp: string;
  chainId: ChainId | null;
  level: EventLevel;
  title: string;
  summary: string;
  source: EventSource;
  relatedPath: string | null;
  relatedSession: ChainSessionName | null;
  actionable: boolean;
}

export interface PersistedActionEvent extends EventRecord {
  actionType: string;
  outputDir?: string;
  generatedFiles?: string[];
  includedChainIds?: ChainId[];
  command?: string;
  path?: string;
}

export interface NotificationRecord {
  id: string;
  eventId: string;
  timestamp: string;
  level: EventLevel;
  title: string;
  summary: string;
  targetType: NotificationTargetType;
  targetId: ChainId | string | null;
  status: NotificationStatus;
  recommendedAction: string | null;
  canAiHandle: boolean;
}

export type ControlInboxScope = "source" | "global";
export type ControlInboxStatus = "open" | "claimed" | "resolved" | "rejected" | "escalated";
export type ControlInboxSeverity = EventLevel;

export interface ControlInboxItem {
  eventId: string;
  scopeFrom: "chain" | "source";
  scopeTo: ControlInboxScope;
  sourceId: string;
  chainId: ChainId | string | null;
  severity: ControlInboxSeverity;
  reason: string;
  requestedAction: string;
  status: ControlInboxStatus;
  createdAt: string;
  claimedBy: string | null;
  resolvedAt: string | null;
}

export type SourceMainControlRuntimeState = "running" | "idle-countdown" | "sleeping" | "waking" | "pinned";

export interface SourceRuntimePolicy {
  autoSleep: boolean;
  idleSleepMinutes: number;
  pinned: boolean;
  maxConcurrentChains: number;
}

export interface SourceRuntimeStateSnapshot {
  sourceId: string;
  runtimeState: SourceMainControlRuntimeState;
  lastActiveAt: string | null;
  pinned: boolean;
}

export interface OrchestrationStateSnapshot {
  maxRunningSources: number;
  runningSources: string[];
  sourceStates: Record<string, SourceRuntimeStateSnapshot>;
  updatedAt: string | null;
}

export interface ChainDetailSession {
  sessionName: ChainSessionName | null;
  sessionRunning: boolean;
  queued: boolean;
  queueIndex: number | null;
  attachCommand: string | null;
  manualHoldUntil?: string | null;
}

export interface ActionCapability {
  supported: boolean;
  requiresConfirmation: boolean;
  targetType: "system" | "chain" | "scheduler" | "main-control" | "wave";
  enabled: boolean;
  reason: string | null;
}

export type ActionCapabilityMap = Partial<Record<ConsoleActionType, ActionCapability>>;

export interface ChainDetailRisk {
  blocked: boolean;
  critical: number;
  warning: number;
  summary: string | null;
}

export interface ChainDetailDocuments {
  mapPath: ChainMapPath;
  codeListPath: ChainCodeListPath;
  reviewPath: string | null;
}

export interface ChainDetailNotification extends NotificationRecord {
  path: string;
}

export interface DefectItemRecord {
  itemId: string;
  sourceChainId: string;
  reason: string;
  severity: string | null;
  regression: boolean | null;
  expectedBehavior: string | null;
  actualBehavior: string | null;
  verificationScope: string[];
  createdAt: string;
  createdBy: string | null;
  status: "open" | "claimed" | "fixed" | "verified";
  claimedBy: string | null;
  claimedAt: string | null;
  fixedAt: string | null;
  verifiedAt: string | null;
}

export interface ChainDetailResponse {
  chain: ChainState;
  chainResume: ChainResumePacket | null;
  workItem: ChainWorkItemDetail | null;
  session: ChainDetailSession;
  actions: ActionCapabilityMap;
  risk: ChainDetailRisk;
  documents: ChainDetailDocuments;
  notifications: ChainDetailNotification[];
  events: EventRecord[];
  defectItems: DefectItemRecord[];
}

export interface MetaResponse {
  apiVersion: string;
  serverVersion: string;
  startedAt: string;
  pid: number;
  port: number;
  manualSessionHoldMinutes: number;
  capabilities: {
    actions: ActionCapabilityMap;
  };
}

export type AiMode = "qa" | "scheduler" | "docs" | "delegate";
export type AiTargetMode = "auto" | "main-control" | "current-chain" | "specific-chain";
export type AiResolvedTargetType = "main-control" | "chain" | "scheduler" | "wave" | null;
export type AiProposalKind = "action" | "dispatch";
export type AiProposalRisk = "safe" | "controlled" | "high";
export type AiPageContext = "overview" | "chain-detail" | "scheduler" | "notifications" | "wave";

export interface AiChatContext {
  page: AiPageContext;
  selectedChainId: ChainId | null;
}

export interface AiResolvedTarget {
  targetType: AiResolvedTargetType;
  targetId: ChainId | string | null;
  sessionName: string | null;
  reason: string;
}

export interface AiActionProposal {
  proposalKind: AiProposalKind;
  proposalId?: string;
  actionType?: string;
  title: string;
  summary: string;
  impact: string;
  riskLevel: AiProposalRisk;
  confirmLabel: string;
  targetType: Exclude<AiResolvedTargetType, null>;
  targetId: ChainId | string | null;
  sessionName: string | null;
  message?: string;
}

export interface AiChatRequest {
  mode: AiMode;
  target: AiTargetMode;
  targetChainId?: ChainId | null;
  message: string;
  context: AiChatContext;
}

export interface AiChatResponse {
  kind: "answer" | "proposal";
  response: string;
  resolvedTarget: AiResolvedTarget;
  proposal: AiActionProposal | null;
}

export interface AiDispatchRequest {
  proposalId: string;
}

export interface AiDispatchResponse {
  success: boolean;
  eventId: string | null;
  targetType: "main-control" | "chain";
  targetId: ChainId | string | null;
  sessionName: string;
  message: string;
  stdout: string | null;
  stderr: string | null;
}

export interface RiskRecord {
  id: string;
  level: RiskLevel;
  type: RiskType;
  title: string;
  summary: string;
  chainId: ChainId | null;
  recommendedAction: string;
  relatedPath?: string | null;
}

export interface WaveSummary {
  wave: OverviewWave;
  total: number;
  completed: number;
  active: number;
  pending: number;
  reviewPath: string | null;
}

export interface WaveReviewEntry {
  path: string;
  wave: PriorityWave | null;
  sequence: number | null;
  label: string;
}

export interface WaveResponse {
  waveSummary: WaveSummary;
  chains: ChainState[];
  reviews: WaveReviewEntry[];
  canTriggerSummary: boolean;
}

export interface HealthResponse {
  ok: boolean;
  preflight?: PreflightSummary;
}

export type ApiHealthResponse = HealthResponse;
