import {
  CHAIN_STAGE_META,
  type AiMode,
  type AiProposalRisk,
  type ChainStageValue,
  type ChainUiState,
  type EventSource,
  type MainControlHealth,
  type OverviewWave,
  type PreflightState,
  type SchedulerStatus,
  type WorkItemMode
} from "../../../shared/event-model";

export const zhCN = {
  brand: {
    console: "总控",
    controlCenter: "业务链驱动的多智能体研发编排系统"
  },
  preflight: {
    title: "环境新鲜度",
    fresh: "当前环境一致且可继续工作。",
    stale: "当前环境存在陈旧信号，建议先刷新或复核。",
    drift: "当前环境存在状态漂移，高风险动作已被软阻断。",
    needsResync: "当前环境需要重新同步派生层。",
    recommendedActions: (actions: string[]) => `建议动作：${actions.join("、")}`,
    manualActions: (actions: string[]) => `需人工处理：${actions.join("、")}`,
    manualActionDetail: (action: string, reason: string, nextStep: string) => `需人工处理：${action}；原因：${reason}；建议：${nextStep}`,
    issueCount: (count: number) => `${count} 条预检信号`,
    actionSuccessTitle: "已执行推荐动作",
    actionErrorTitle: "推荐动作执行失败",
    stateLabel: {
      fresh: "FRESH",
      stale: "STALE",
      drift: "DRIFT",
      needs_resync: "NEEDS_RESYNC"
    } as Record<PreflightState, string>
  },
  nav: {
    description: "多智能体业务链研发编排的全局观察与调度席位",
    overview: "总览",
    scheduler: "调度页",
    notifications: "通知页",
    wave: "Wave 页",
    activeChains: "运行链",
    queue: "队列",
    distribution: "分布",
    events: "事件",
    polling: "每 5 秒轮询",
    initialSync: "首次同步中",
    backgroundSync: "后台轮询已启用"
  },
  page: {
    title: (sourceId: string) => `需求总览 · ${sourceId}`,
    subtitle: (sourceId: string) => `用于查看 ${sourceId} 当前波次推进、业务链运行态、队列顺序与关键控制面信号。`,
    pollingWarning: "轮询警告",
    loadingTitle: "正在加载控制面数据",
    loadingBody: "正在从总控数据面拉取总览、链路、队列与事件快照。",
    lastError: "最近错误："
  },
  aiDock: {
    kicker: "AI 副驾驶",
    title: "AI 主控区",
    body: "带上下文的自然语言总控副驾驶：可问答、生成提案，并在你确认后向主控或 worker 派发消息。",
    apiAttention: "接口需要关注",
    awaiting: "等待你的指令",
    empty: "还没有对话记录。",
    modeLabel: "AI 模式",
    modeName: (mode: AiMode) => ({
      qa: "问答",
      scheduler: "调度",
      docs: "文档",
      delegate: "开发委派"
    }[mode]),
    targetLabel: "目标路由",
    targetName: (target: string) => ({
      auto: "自动路由",
      "main-control": "main-control",
      "current-chain": "当前链",
      "specific-chain": "指定链"
    }[target] ?? target),
    targetChainLabel: "指定链",
    chooseChain: "请选择链路",
    placeholderQa: "例如：现在全局状态怎么样？",
    placeholderScheduler: "例如：帮我判断现在是否需要重新同步队列。",
    placeholderDocs: "例如：当前链应该先看哪些文档？",
    placeholderDelegate: "例如：请继续推进当前链，并先收敛最小改动方案。",
    sendButton: "发送给 AI",
    sending: "发送中…",
    executing: "执行中…",
    actionErrorTitle: "动作执行失败",
    executeError: "AI 动作执行失败",
    riskLabel: (risk: AiProposalRisk) => ({
      safe: "安全",
      controlled: "受控",
      high: "高风险"
    }[risk]),
    proposalExecuted: (message: string) => `已执行：${message}`
  },
  overview: {
    kicker: "总览",
    title: "全局状态",
    currentWave: "当前波次",
    totals: "链路总览",
    scheduler: "调度器",
    concurrency: "并发情况",
    lastNotification: "最近通知",
    noActivity: "暂无活动",
    waitingFirstSync: "等待首次同步",
    completedFormat: (completed: number, total: number) => `已完成 ${completed}/${total}`,
    activePendingFormat: (active: number, pending: number) => `进行中 ${active} · 挂起 ${pending}`,
    desiredState: (state: string) => `期望状态：${state}`,
    liveSessions: (count: number) => `${count} 个活跃 tmux 会话`,
    lastRefresh: (time: string) => `最近刷新 ${time}`
  },
  activeChains: {
    kicker: "执行态",
    title: "运行中的业务链",
    runningCount: (count: number) => `${count} 条运行中`,
    emptyTitle: "当前没有正在运行的业务链",
    emptyBody: "调度器拉起链后，这里会显示活跃链卡片。",
    defaultSummary: "当前正在推进。",
    session: "会话",
    updatedAt: "更新时间",
    risk: "风险",
    workMode: "模式",
    currentTask: "当前任务",
    recoverability: "可恢复",
    noSession: "无会话",
    noTimestamp: "暂无更新时间",
    noTask: "当前无明确任务",
    openDetail: "查看详情",
    recoverable: "是",
    notRecoverable: "否",
    unknownRecoverable: "未知",
    riskFormat: (critical: number, warning: number) => `严重 ${critical} · 警告 ${warning}`
  },
  mainControlResume: {
    kicker: "resume packet",
    title: "主控恢复面板",
    missing: "尚未生成主控恢复包，建议先执行一次主控交接。",
    generatedAt: "生成时间",
    handoffPath: "交接文件",
    nextCandidate: "下一优先链",
    running: "运行中",
    pending: "挂起",
    blocked: "阻塞",
    rollback: "撤回",
    completedKept: "完成保留",
    changedChains: "变化链",
    queueAdded: "新增待启动",
    queueRemoved: "移出待启动",
    modeChanged: "模式变化",
    taskChanged: "任务变化",
    staleTitle: "主控恢复包可能过期",
    staleBody: "当前真值已经比主控恢复包更新，建议先重新生成交接或以真值为准。",
    none: "无"
  },
  queue: {
    kicker: "调度",
    title: "待启动队列",
    updatedAt: (value: string | null) => `更新时间：${value ?? "暂无"}`,
    noCandidate: "暂无候选链",
    nextChain: "下一条链",
    schedulerCapacity: (status: string, active: number, max: number) => `调度器：${status} · 并发：${active}/${max}`,
    emptyTitle: "当前队列为空",
    emptyBody: "新的候选链会随着调度状态变化出现在这里。",
    nextHint: "一旦有空槽位，将优先启动。",
    waitingHint: "正在待启动队列中等待。",
    workMode: "模式",
    currentTask: "当前任务",
    recoverability: "可恢复",
    noTask: "当前无明确任务"
  },
  distribution: {
    kicker: "覆盖情况",
    title: "阶段分布",
    meta: "按波次、阶段与状态分组",
    waveCount: (count: number) => `${count} 条链`,
    empty: "该波次暂无注册链路。",
    pendingStage: "挂起"
  },
  events: {
    kicker: "动态",
    title: "最近事件",
    latestCount: (count: number) => `最近 ${count} 条`,
    emptyTitle: "暂时没有事件",
    emptyBody: "调度器、队列与通知变化会显示在这里。",
    actionable: "需处理",
    fyi: "仅查看"
  },
  risks: {
    kicker: "风险",
    title: "风险摘要",
    openCenter: "打开通知页",
    emptyTitle: "当前没有需要立即处理的风险",
    emptyBody: "当系统检测到一致性、运行态或 Wave 风险时，会优先显示在这里。",
    level: (level: string) => level === "critical" ? "严重" : "警告"
  },
  chainDetail: {
    pageTitle: "业务链详情",
    pageSubtitle: (chainId: string) => `查看 ${chainId} 的当前状态、风险、通知与文档入口。`,
    navDescription: "用于巡检单链状态、风险、通知与进入 session 的方式",
    backToOverview: "返回总览",
    headerKicker: "业务链",
    updatedAt: "链更新时间",
    lastSync: "最近同步",
    wave: "所属波次",
    summaryKicker: "摘要",
    summaryTitle: "当前状态",
    summaryFallback: "当前暂无额外摘要。",
    uiState: "界面状态",
    queueState: "队列状态",
    queueIndex: (index: number | null) => (index ? `待启动队列第 ${index} 位` : "当前不在待启动队列中"),
    notQueued: "当前不在待启动队列中",
    blockedState: "阻塞状态",
    blocked: "已阻塞",
    clear: "无阻塞",
    workItemKicker: "work-item",
    workItemTitle: "当前唯一任务",
    workItemMode: "当前模式",
    workItemRecoverable: "可恢复",
    workItemUpdatedAt: "work-item 更新时间",
    workItemLastVerifiedAt: "最近核验",
    workItemLastVerifiedBy: "核验人",
    workItemExpectedOutput: "期望输出",
    workItemAllowedActions: "可做",
    workItemForbiddenActions: "不得",
    workItemNoTask: "当前无明确任务",
    workItemNoOutput: "当前无额外期望输出",
    workItemNoActions: "当前无额外动作约束",
    workItemDerivedHint: "提示：当前模式与可恢复由 chain-status、队列与 tmux 运行态实时派生，不会再持久化写入 work-item 文件。",
    resumeKicker: "resume packet",
    resumeTitle: "恢复面板",
    resumeMissing: "尚未生成链级恢复包，建议先执行一次主控交接或写包。",
    resumeGeneratedAt: "生成时间",
    resumeQueued: "队列状态",
    resumeSessionRunning: "Session 运行",
    resumeBlocked: "阻塞",
    resumeRollback: "撤回",
    resumeDelta: "本次变化",
    resumePaths: "恢复入口",
    resumeStaleTitle: "链级恢复包可能过期",
    resumeStaleBody: "当前链状态或 work-item 已比恢复包更新，请优先以真值为准。",
    resumePathMap: "业务链地图",
    resumePathCodeList: "代码清单",
    resumePathWorkItem: "work-item",
    resumeDeltaOn: "有变化",
    resumeDeltaOff: "无变化",
    riskKicker: "风险",
    riskTitle: "当前风险",
    riskCounts: (critical: number, warning: number) => `严重 ${critical} · 警告 ${warning}`,
    riskNone: "当前没有额外风险提示。",
    sessionKicker: "会话",
    sessionTitle: "会话与 attach 命令",
    sessionRunning: "运行中",
    sessionStopped: "未运行",
    sessionName: "会话名",
    manualHoldUntil: "人工接管保活至",
    attachCommand: "Attach 命令",
    noAttachCommand: "当前没有可用的 attach 命令。",
    copyAttachCommand: "复制 Attach 命令",
    copySuccess: "已复制 attach 命令。",
    copyFailure: "复制失败，请手动复制。",
    takeoverButton: "接管此链",
    takeoverMore: "更多接管选项",
    takeoverKicker: "接管",
    takeoverTitle: "接管此链",
    takeoverBody: "如果该链 session 已存在则恢复上下文；如果当前未运行则先启动 session 并注入初始上下文，再决定是否 attach 进入命令行继续编码。",
    takeoverGuidanceTag: "先恢复，再进入",
    takeoverTipStart: "当该链当前没有运行中的 worker session 时，可先一键启动并注入初始上下文。",
    takeoverTipResume: "恢复上下文不会打断你当前浏览器检查，适合先把 worker 拉回正确语境。",
    takeoverTipTerminal: "打开 Terminal 会立刻切走到命令行窗口，适合已经准备开始编码时使用。",
    takeoverTerminalWarning: "会切出浏览器窗口",
    takeoverSheetHint: "更多辅助操作都放在这里，不影响主接管路径。",
    startAndResumeContext: "启动并恢复上下文",
    resumeContext: "恢复该链上下文",
    openTerminalAndAttach: "打开 Terminal 并进入",
    takeoverBusy: "处理中…",
    takeoverClose: "关闭",
    viewSessionInfo: "查看 Session 信息",
    hideSessionInfo: "收起 Session 信息",
    takeoverSuccessTitle: "接管动作已执行",
    takeoverErrorTitle: "接管动作失败",
    takeoverError: "接管此链失败。",
    generateTestCases: "生成测试用例",
    generateTestCasesHint: "基于当前链边界、CodeList 与验证记录生成 Markdown 测试用例草案。",
    generateTestCasesBusy: "生成中…",
    generateTestCasesSuccessTitle: "测试用例已生成",
    generateTestCasesErrorTitle: "生成测试用例失败",
    generateTestCasesError: "生成测试用例失败。",
    sendToDefect: "归入 Defect",
    sendToDefectHint: "把当前链发现的缺陷直接记入 Defect，并附带来源链和验证范围。",
    sendToDefectTitle: "归入 Defect",
    sendToDefectBody: "填写本次缺陷的最小必要信息后，主控会把它记入当前需求源的 Defect 链，后续统一从 Defect 处理。",
    sendToDefectBusy: "归档中…",
    sendToDefectConfirm: "确认归入 Defect",
    sendToDefectSuccessTitle: "缺陷已归入 Defect",
    sendToDefectErrorTitle: "归入 Defect 失败",
    sendToDefectError: "归入 Defect 失败。",
    closeDefectSheet: "关闭 Defect 表单",
    defectReason: "缺陷描述",
    defectSeverity: "严重级别",
    defectRegression: "这是回归问题",
    defectExpectedBehavior: "期望行为",
    defectActualBehavior: "实际行为",
    defectVerificationScope: "验证范围（每行一项）",
    defectItemsKicker: "缺陷项",
    defectItemsTitle: "已归档缺陷列表",
    defectItemsEmptyTitle: "当前还没有归档缺陷",
    defectItemsEmptyBody: "从业务链点击“归入 Defect”后，缺陷会累计显示在这里。",
    defectSourceChain: "来源链",
    defectCreatedAt: "归档时间",
    defectCreatedBy: "归档人",
    defectStatus: "状态",
    defectClaim: "认领",
    defectMarkFixed: "标记修复",
    defectVerify: "验证通过",
    defectStatusOpen: "open",
    defectStatusClaimed: "claimed",
    defectStatusFixed: "fixed",
    defectStatusVerified: "verified",
    openGeneratedTestCases: "打开测试用例文档",
    notificationsKicker: "通知",
    notificationsTitle: "最近通知",
    notificationsEmptyTitle: "当前暂无链路通知",
    notificationsEmptyBody: "新的通知文件会在这里出现，并可直接跳转到 Obsidian。",
    openNotification: "打开通知",
    eventsKicker: "事件",
    eventsTitle: "关联事件",
    eventsEmptyTitle: "当前暂无关联事件",
    eventsEmptyBody: "当系统事件能稳定归属到该链时，会显示在这里。",
    docsKicker: "文档",
    docsTitle: "关联文档",
    docsEmptyTitle: "当前暂无可打开的文档",
    docsEmptyBody: "Map、CodeList、Review 就绪后会显示在这里。",
    mapDoc: "业务链地图",
    codeListDoc: "代码清单",
    reviewDoc: "Wave Review",
    openDocument: "在 Obsidian 中打开",
    loadingTitle: "正在加载业务链详情",
    loadingBody: "正在从总控数据面拉取单链详情快照。",
    notFoundTitle: "未找到该业务链",
    notFoundBody: (chainId: string) => `未找到 ${chainId} 对应的链路，请返回总览重新选择。`
  },
  scheduler: {
    navTitle: "调度页",
    navDescription: "用于查看 watcher 健康、队列顺序并执行受控调度动作",
    pageTitle: "调度控制",
    pageSubtitle: "在浏览器内查看调度器状态、队列顺序与最近动作结果，所有 B 级动作都需确认后执行。",
    backToOverview: "返回总览",
    statusKicker: "调度器",
    statusTitle: "调度器状态",
    desiredState: "期望状态",
    concurrency: "并发",
    concurrencyValue: (active: number, max: number) => `${active}/${max}`,
    watcherPid: "Watcher PID",
    noWatcherPid: "暂无",
    lastSync: "最近同步",
    noActionSummary: "当前暂无最近动作摘要。",
    healthItem: (label: string, readable: boolean) => `${label}：${readable ? "正常" : "异常"}`,
    pauseButton: "暂停调度器",
    resumeButton: "恢复调度器",
    resyncButton: "重新同步队列",
    summarizeButton: "触发主控汇总",
    waveButton: (wave: string) => `触发 ${wave} Wave 汇总`,
    queueKicker: "队列",
    queueTitle: "待启动队列与补位动作",
    queueUpdated: (updatedAt: string | null) => `更新时间：${updatedAt ?? "暂无"}`,
    queueEmptyTitle: "当前待启动队列为空",
    queueEmptyBody: "当运行链释放空槽位后，补位候选会出现在这里。",
    queueLeaderHint: "当前是下一条候选链。",
    queueWaitingHint: "可以提升到队列顶部。",
    promoteButton: "提升到队首",
    eventsTitle: "最近调度与动作事件",
    loadError: "Unable to load scheduler data.",
    actionError: "动作执行失败",
    actionErrorTitle: "动作失败",
    actionSuccessTitle: "动作已执行",
    confirmButton: "确认执行",
    cancelButton: "先取消",
    confirmPauseTitle: "确认暂停调度器",
    confirmPauseBody: "这会停止 watcher 进程，并把 scheduler-state.json 切到 paused。",
    confirmResumeTitle: "确认恢复调度器",
    confirmResumeBody: "这会重新拉起 watcher 进程，并把 scheduler-state.json 切到 running。",
    confirmResyncTitle: "确认重新同步队列",
    confirmResyncBody: "将按照 registry -> stage -> tmux 运行态的固定算法重算 pendingStart。",
    confirmSummarizeTitle: "确认触发主控汇总",
    confirmSummarizeBody: "这会向 main-control 发送 summarize-global-state 面板动作消息。",
    confirmWaveTitle: (wave: string) => `确认触发 ${wave} Wave 汇总`,
    confirmWaveBody: (wave: string) => `这会向 main-control 发送 generate-wave-summary ${wave} 指令。`,
    confirmPromoteTitle: (chainId: string) => `确认提升 ${chainId}`,
    confirmPromoteBody: (chainId: string) => `这会把 ${chainId} 提升到 dispatch-queue 顶部。`,
    loadingTitle: "正在加载调度控制页",
    loadingBody: "正在从总控数据面拉取 overview、queue、events 与 health 快照。"
  },
  notifications: {
    pageTitle: "通知与风险中心",
    pageSubtitle: "集中查看风险与通知，并可跳转到链详情、调度页或交给 AI 解释。",
    navDescription: "用于集中查看风险、通知与下一步处理入口",
    backToOverview: "返回总览",
    riskKicker: "风险",
    riskTitle: "风险详情",
    riskEmptyTitle: "当前没有风险项",
    riskEmptyBody: "新的风险一旦被 detector 命中，会显示在这里。",
    notificationsKicker: "通知",
    notificationsTitle: "通知详情",
    notificationEmptyTitle: "当前没有通知项",
    notificationEmptyBody: "新的通知文件与通知派生会显示在这里。",
    openDetail: "查看详情",
    openChain: "进入链详情",
    openScheduler: "打开调度页",
    askAi: "交给 AI 解释",
    noRecommendedAction: "暂无额外建议动作",
    loadingTitle: "正在加载通知与风险中心",
    loadingBody: "正在从总控数据面拉取风险、通知和链路快照。"
  },
  responsive: {
    aiDrawerOpen: "打开 AI",
    aiDrawerClose: "收起 AI",
    phaseAccordionTitle: "按波次查看链路",
    mobileTabsTitle: "移动巡检区"
  },
  operator: {
    currentFocus: "当前焦点",
    currentSourceLabel: "当前需求源",
    globalControl: "全局主控",
    sourceControl: "当前需求主控",
    globalOverview: "全局总览",
    mainControl: "主控交接",
    mainControlButton: "主控交接",
    mainControlTitle: "主控交接",
    mainControlBody: "主控交接完成后，就是新的主控上下文；它不是普通的焦点返回，而是全局主控的上下文切换。",
    mainControlHandoff: "生成主控交接页",
    mainControlHandoffHint: "先固化当前主控状态、更新 LATEST，并生成新的 handoff 文档。",
    mainControlRotate: "轮换新的主控上下文",
    mainControlRotateHint: "会在现有 main-control tmux 壳内启动新的主控上下文，是最强主控切换动作。",
    mainControlAttach: "打开 Terminal 并进入主控",
    mainControlAttachHint: "会切出浏览器窗口，并直接 attach 到 main-control。",
    generateApiDocs: "生成接口文档",
    generateApiDocsHint: "汇总当前收费业务链联调接口文档，并产出总览文档入口。",
    openGeneratedDoc: "打开生成文档",
    mainControlClose: "关闭",
    mainControlSuccessTitle: "主控动作已执行",
    mainControlErrorTitle: "主控动作失败",
    mainControlActionError: "主控交接动作失败",
    quickSwitch: "快速切换需求",
    recentFocuses: "最近焦点",
    recentFocusesPlaceholder: "选择历史焦点",
    backToPrevious: "返回上一个焦点",
    createSource: "创建需求源",
    createButton: "新建需求源",
    createPlaceholder: "输入需求名，例如 B",
    createDocHint: (demandName: string) => `若缺少需求文档，请先创建 \`Projects/飞枢系统/${demandName || "需求名"}.md\`。`,
    createConfirm: "创建",
    createBusy: "创建中…",
    createCancel: "取消",
    createErrorFallback: "创建需求源失败",
    chooseChain: "选择要接管的链路",
    registryLoading: "正在加载链路清单…",
    registryError: "链路清单加载失败",
    registryErrorOption: "链路清单加载失败，请稍后重试",
    registryReady: (count: number) => `已加载 ${count} 条链，可直接切焦点`,
    currentSource: (sourceId: string) => `需求源：${sourceId}`,
    workspaceRegistryError: "需求源列表加载失败，请稍后重试",
    pageName: (page: string) => ({
      "global-overview": "全局总览",
      "global-control": "全局主控",
      overview: "总览",
      "source-control": "当前需求主控",
      scheduler: "调度页",
      notifications: "通知页",
      wave: "Wave 页",
      memory: "记忆蒸馏",
      "chain-detail": "链详情"
    }[page] ?? page)
  },
  wave: {
    kicker: "Wave",
    pageTitle: "Wave 页面",
    pageSubtitle: "查看当前波次推进进度、历史 Review 文件，并安全触发新的 Wave 汇总。",
    meaningTitle: "当前波次说明",
    meaningBody: (wave: string) => `当前波次 ${wave} 代表 newfee 这组业务链里，主控当前正在收口的那一批链。只有这一波全部到达 S5，才应生成 Wave 汇总并推进下一波。`,
    navDescription: "用于查看当前波次、历史 Reviews 和触发 Wave 汇总",
    backToOverview: "返回总览",
    summaryTitle: "当前波次进度",
    total: "链路总数",
    completed: "已完成",
    active: "进行中",
    pending: "待定",
    reviewHint: (reviewPath: string | null) => reviewPath ? `当前波次已匹配 Review：${reviewPath}` : "当前波次尚未匹配到 Review 文件。",
    triggerBlocked: "当前波次仍有链未到 S5，暂不能触发 Wave 汇总。",
    triggerIdle: (wave: string) => `触发 ${wave} Wave 汇总`,
    triggerBusy: "触发中…",
    reviewKicker: "Review",
    reviewTitle: "历史 Review 文件",
    reviewEmptyTitle: "当前没有 Wave Review 文件",
    reviewEmptyBody: "后续生成的 Wave 总结会出现在这里。",
    unknownWave: "未知波次",
    openReview: "在 Obsidian 中打开",
    chainKicker: "链路",
    chainTitle: "当前波次链明细",
    noChainSummary: "当前暂无额外摘要。",
    confirmTitle: (wave: string) => `确认触发 ${wave} Wave 汇总`,
    confirmBody: (wave: string) => `这会通过白名单动作向 main-control 发送 generate-wave-summary ${wave} 指令。`,
    confirmButton: "确认触发",
    cancelButton: "先取消",
    actionError: "Wave 汇总触发失败",
    actionErrorTitle: "Wave 动作失败",
    actionSuccessTitle: "Wave 动作已执行",
    loadingTitle: "正在加载 Wave 页面",
    loadingBody: "正在从总控数据面拉取当前波次摘要和历史 Review 文件。",
    openWavePage: "查看 Wave 页面"
  }
} as const;

const schedulerStatusZh: Record<SchedulerStatus, string> = {
  running: "运行中",
  paused: "已暂停",
  stopped: "已停止",
  abnormal: "异常"
};

const mainControlHealthZh: Record<MainControlHealth, string> = {
  healthy: "健康",
  abnormal: "异常"
};

const uiStateZh: Record<ChainUiState, string> = {
  active: "进行中",
  verifying: "待验证",
  planned: "方案已定",
  discovery: "需求收敛中",
  done: "已完成",
  pending: "挂起",
  blocked: "阻塞"
};

const workItemModeZh: Record<WorkItemMode, string> = {
  active: "活跃",
  hold: "挂起",
  blocked: "阻塞",
  done: "已完成",
  escalate: "待裁决"
};

const eventSourceZh: Record<EventSource, string> = {
  notification: "通知",
  system: "系统",
  scheduler: "调度器",
  ai: "AI",
  action: "动作"
};

const eventTypeZh: Record<string, string> = {
  chain_notified: "链路通知",
  scheduler_notified: "调度器通知",
  wave_notified: "波次通知",
  system_notified: "系统通知",
  scheduler_started: "调度器已启动",
  scheduler_paused: "调度器已暂停",
  scheduler_stopped: "调度器已停止",
  scheduler_alerted: "调度器异常",
  queue_updated: "队列已更新",
  risk_detected: "风险触发",
  action_executed: "动作已执行"
};

const overviewWaveZh: Record<OverviewWave, string> = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  mixed: "混合波次",
  "all-done": "全部完成"
};

export function formatSchedulerStatusZh(status: SchedulerStatus) {
  return schedulerStatusZh[status];
}

export function formatMainControlHealthZh(status: MainControlHealth) {
  return mainControlHealthZh[status];
}

export function formatChainUiStateZh(state: ChainUiState) {
  return uiStateZh[state];
}

export function formatWorkItemModeZh(mode: WorkItemMode | null | undefined) {
  if (!mode) {
    return "未知";
  }

  return workItemModeZh[mode];
}

export function formatWorkItemRecoverableZh(recoverable: boolean | null | undefined) {
  if (recoverable === true) {
    return zhCN.activeChains.recoverable;
  }

  if (recoverable === false) {
    return zhCN.activeChains.notRecoverable;
  }

  return zhCN.activeChains.unknownRecoverable;
}

export function formatBooleanDeltaZh(value: boolean | null | undefined) {
  return value ? zhCN.chainDetail.resumeDeltaOn : zhCN.chainDetail.resumeDeltaOff;
}

export function formatChainIdList(chainIds: string[]) {
  return chainIds.length > 0 ? chainIds.join("、") : zhCN.mainControlResume.none;
}

export function formatResumePathValue(value: string | null | undefined) {
  return value ?? zhCN.mainControlResume.none;
}

export function formatPreflightStateZh(state: PreflightState | null | undefined) {
  if (!state) {
    return zhCN.preflight.stateLabel.fresh;
  }

  return zhCN.preflight.stateLabel[state];
}

export function formatOverviewWaveZh(wave: OverviewWave) {
  return overviewWaveZh[wave];
}

export function formatStageDisplay(stage: ChainStageValue) {
  if (stage === "PENDING") {
    return zhCN.distribution.pendingStage;
  }

  const meta = CHAIN_STAGE_META[stage];
  return `${meta.label} · ${meta.descriptionZh}`;
}

export function formatStageBadge(stage: ChainStageValue) {
  return stage === "PENDING" ? zhCN.distribution.pendingStage : stage;
}

export function formatEventSourceZh(source: EventSource) {
  return eventSourceZh[source];
}

export function formatEventTypeZh(type: string) {
  return eventTypeZh[type] ?? type;
}

export function containsChinese(value: string | null | undefined) {
  return Boolean(value && /[\u3400-\u9fff]/u.test(value));
}

export function formatChainSummaryZh(summary: string | null | undefined, chainNameZh: string) {
  if (containsChinese(summary)) {
    return summary ?? zhCN.activeChains.defaultSummary;
  }

  return `${chainNameZh} 当前正在推进。`;
}

export function formatSchedulerDetailZh(summary: string | null | undefined, fallbackStatus: SchedulerStatus) {
  if (containsChinese(summary)) {
    return summary;
  }

  return zhCN.overview.desiredState(formatSchedulerStatusZh(fallbackStatus));
}
