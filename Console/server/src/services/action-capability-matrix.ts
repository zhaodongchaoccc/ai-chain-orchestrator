import type { ActionCapability, ActionCapabilityMap, ConsoleActionType } from "../../../shared/event-model";

import type { ControlPlaneState } from "../types/overview";
import { buildChainWorkItemSummary } from "./work-item-view";

function capability(input: ActionCapability): ActionCapability {
  return input;
}

function applyPreflight(actionType: ConsoleActionType, preflight: ControlPlaneState["preflight"] | null | undefined, nextCapability: ActionCapability): ActionCapability {
  if (!nextCapability.enabled) {
    return nextCapability;
  }

  if (!preflight || !preflight.blockingActionTypes.includes(actionType)) {
    return nextCapability;
  }

  const recommended = preflight.recommendedActions.length > 0 ? `建议先执行：${preflight.recommendedActions.join("、")}` : "请先处理预检阻断项。";
  return {
    ...nextCapability,
    enabled: false,
    reason: recommended
  };
}

export function buildGlobalControlActionCapabilities(state: ControlPlaneState): ActionCapabilityMap {
  const preflight = state.preflight;
  return {
    generate_fee_api_docs: applyPreflight("generate_fee_api_docs", preflight, capability({ supported: true, requiresConfirmation: false, targetType: "system", enabled: true, reason: null })),
    summarize_overview: applyPreflight("summarize_overview", preflight, capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null })),
    handoff_main_control: applyPreflight("handoff_main_control", preflight, capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null })),
    rotate_main_control_session: applyPreflight("rotate_main_control_session", preflight, capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null })),
    open_main_control_terminal: capability({ supported: true, requiresConfirmation: false, targetType: "main-control", enabled: true, reason: null })
  };
}

export function buildSourceControlActionCapabilities(state: ControlPlaneState): ActionCapabilityMap {
  const preflight = state.preflight;
  const schedulerRunning = state.scheduler.status === "running";
  return {
    handoff_main_control: applyPreflight("handoff_main_control", preflight, capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null })),
    rotate_main_control_session: applyPreflight("rotate_main_control_session", preflight, capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null })),
    open_main_control_terminal: capability({ supported: true, requiresConfirmation: false, targetType: "main-control", enabled: true, reason: null }),
    sleep_source_main_control: capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: schedulerRunning, reason: schedulerRunning ? null : "当前需求主控未运行，无法立即休眠。" }),
    wake_source_main_control: capability({ supported: true, requiresConfirmation: true, targetType: "main-control", enabled: !schedulerRunning, reason: schedulerRunning ? "当前需求主控已运行。" : null }),
    resync_queue: applyPreflight("resync_queue", preflight, capability({ supported: true, requiresConfirmation: true, targetType: "scheduler", enabled: true, reason: null })),
    escalate_to_global_control: capability({ supported: true, requiresConfirmation: false, targetType: "main-control", enabled: true, reason: null })
  };
}

export function buildChainActionCapabilities(state: ControlPlaneState, chain: ControlPlaneState["chains"][number]): ActionCapabilityMap {
  const sessionRunning = chain.sessionRunning;
  const attachCommand = chain.sessionName ? `tmux attach -t ${chain.sessionName}` : null;
  const preflight = state.preflight;
  const workItem = buildChainWorkItemSummary(chain);
  const hasPendingDefectItems = chain.id === "Defect" && (state.defectItems?.Defect ?? []).some((item) => item.status !== "verified");
  const canStartSession = !sessionRunning && (workItem.recoverable || hasPendingDefectItems);
  const stoppedTakeoverReason = canStartSession
    ? "链 session 未运行，请先启动该链 session。"
    : describeStoppedTakeoverReason(workItem.mode, chain.id, hasPendingDefectItems);

  return {
    generate_chain_test_cases: applyPreflight("generate_chain_test_cases", preflight, capability({ supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null })),
    start_chain_session: applyPreflight("start_chain_session", preflight, capability({ supported: true, requiresConfirmation: false, targetType: "chain", enabled: canStartSession, reason: sessionRunning ? "链 session 已运行，可直接恢复上下文或 attach 进入。" : (canStartSession ? null : stoppedTakeoverReason) })),
    resume_chain_session: applyPreflight("resume_chain_session", preflight, capability({ supported: true, requiresConfirmation: false, targetType: "chain", enabled: sessionRunning, reason: sessionRunning ? null : stoppedTakeoverReason })),
    send_to_defect: applyPreflight("send_to_defect", preflight, capability({ supported: true, requiresConfirmation: false, targetType: "chain", enabled: chain.id !== "Defect", reason: chain.id === "Defect" ? "Defect 链不能再次归入 Defect。" : null })),
    claim_defect_item: capability({ supported: chain.id === "Defect", requiresConfirmation: false, targetType: "chain", enabled: chain.id === "Defect", reason: chain.id === "Defect" ? null : "只有 Defect 链可认领缺陷项。" }),
    mark_defect_fixed: capability({ supported: chain.id === "Defect", requiresConfirmation: false, targetType: "chain", enabled: chain.id === "Defect", reason: chain.id === "Defect" ? null : "只有 Defect 链可标记缺陷修复。" }),
    verify_defect_item: capability({ supported: chain.id === "Defect", requiresConfirmation: false, targetType: "chain", enabled: chain.id === "Defect", reason: chain.id === "Defect" ? null : "只有 Defect 链可验证缺陷项。" }),
    open_terminal_and_attach: capability({ supported: true, requiresConfirmation: false, targetType: "chain", enabled: sessionRunning && attachCommand !== null, reason: sessionRunning ? (attachCommand ? null : "当前没有可用的 attach 命令。") : stoppedTakeoverReason }),
    copy_attach_command: capability({ supported: true, requiresConfirmation: false, targetType: "chain", enabled: sessionRunning && attachCommand !== null, reason: sessionRunning ? (attachCommand ? null : "当前没有可用的 attach 命令。") : stoppedTakeoverReason })
  };
}

function describeStoppedTakeoverReason(mode: ReturnType<typeof buildChainWorkItemSummary>["mode"], chainId: ControlPlaneState["chains"][number]["id"], hasPendingDefectItems: boolean) {
  if (chainId === "Defect") {
    return hasPendingDefectItems
      ? "Defect 有待处理缺陷项，请先启动该链 session。"
      : "Defect 当前没有待处理缺陷项，暂不需要启动链 session。";
  }

  switch (mode) {
    case "done":
      return "当前链已收口，仅保留只读参考，不支持启动或恢复链 session。";
    case "hold":
      return "当前链处于挂起，等待恢复信号，不支持启动或恢复链 session。";
    case "blocked":
      return "当前链处于阻塞状态，需先解除阻塞后再启动或恢复链 session。";
    case "escalate":
      return "当前链需先交回主控裁决，暂不支持启动或恢复链 session。";
    case "active":
      return "链 session 未运行，请先启动该链 session。";
  }
}
