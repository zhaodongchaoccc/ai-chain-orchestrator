import type { ChainState, ChainWorkItemDetail, ChainWorkItemSummary, WorkItemMode } from "../../../shared/event-model";

function valueOrFallback<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function defaultTask(mode: WorkItemMode) {
  return {
    active: "继续当前唯一任务",
    hold: "保持挂起，等待恢复信号",
    blocked: "确认阻塞原因与恢复条件",
    done: "保持只读参考，不重新开工",
    escalate: "交回主控裁决当前动作"
  } satisfies Record<WorkItemMode, string>;
}

function defaultExpectedOutput(mode: WorkItemMode) {
  return {
    active: "输出当前阶段、守门结论、当前风险和唯一下一步",
    hold: "输出当前阶段、当前风险和继续挂起的判断",
    blocked: "输出阻塞原因、恢复条件和下一次检查点",
    done: "输出当前阶段、参考价值和是否需要主控介入",
    escalate: "输出冲突点并交回主控裁决"
  } satisfies Record<WorkItemMode, string>;
}

function defaultAllowedActions(mode: WorkItemMode) {
  return {
    active: ["恢复上下文", "定位代码入口", "影响分析", "继续当前唯一任务"],
    hold: ["恢复上下文", "只读分析", "状态判断"],
    blocked: ["确认阻塞原因", "确认恢复条件", "状态判断"],
    done: ["只读核对", "联调口径说明", "样板参考"],
    escalate: ["恢复上下文", "整理冲突点", "交主控裁决"]
  } satisfies Record<WorkItemMode, string[]>;
}

function defaultForbiddenActions(mode: WorkItemMode) {
  return {
    active: [],
    hold: ["实现", "测试验证", "发送 S5 完成通知"],
    blocked: ["实现", "测试验证"],
    done: ["重新开工", "发送新的完成通知"],
    escalate: ["实现", "测试验证", "擅自改状态"]
  } satisfies Record<WorkItemMode, string[]>;
}

function resolveMode(chain: ChainState): WorkItemMode {
  if (chain.blocked) {
    return "blocked";
  }

  if (chain.stage === "S5") {
    return "done";
  }

  if (chain.sessionRunning) {
    return "active";
  }

  if (chain.stage === "PENDING") {
    return "hold";
  }

  if (["S1", "S2", "S3", "S4"].includes(chain.stage)) {
    return "active";
  }

  return "escalate";
}

export function buildChainWorkItemSummary(chain: ChainState, persisted?: ChainWorkItemDetail | null): ChainWorkItemSummary {
  const mode = resolveMode(chain);

  return {
    mode,
    currentTask: valueOrFallback(persisted?.currentTask, defaultTask(mode)[mode]),
    recoverable: mode === "active",
    updatedAt: persisted?.updatedAt ?? null
  };
}

export function buildChainWorkItemDetail(chain: ChainState, persisted?: ChainWorkItemDetail | null): ChainWorkItemDetail {
  const summary = buildChainWorkItemSummary(chain, persisted);

  return {
    ...summary,
    expectedOutput: valueOrFallback(persisted?.expectedOutput, defaultExpectedOutput(summary.mode)[summary.mode]),
    allowedActions: persisted?.allowedActions ?? defaultAllowedActions(summary.mode)[summary.mode],
    forbiddenActions: persisted?.forbiddenActions ?? defaultForbiddenActions(summary.mode)[summary.mode],
    lastVerifiedAt: persisted?.lastVerifiedAt ?? null,
    lastVerifiedBy: persisted?.lastVerifiedBy ?? null,
    sourceChainId: persisted?.sourceChainId ?? null,
    severity: persisted?.severity ?? null,
    regression: persisted?.regression ?? null,
    expectedBehavior: persisted?.expectedBehavior ?? null,
    actualBehavior: persisted?.actualBehavior ?? null,
    verificationScope: persisted?.verificationScope ?? []
  };
}
