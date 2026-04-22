import type { ActionCapabilityMap, ChainDetailNotification, ChainDetailResponse, ChainId, ChainState } from "../../../shared/event-model";

import type { ControlPlaneState } from "../types/overview";
import { buildChainActionCapabilities } from "./action-capability-matrix";
import { buildEventStream } from "./event-store";
import { buildChainWorkItemDetail } from "./work-item-view";
import { resolveWorkspaceChainPaths } from "./workspace-chain-paths";

export function buildChainDetailResponse(state: ControlPlaneState, chainId: string): ChainDetailResponse | null {
  const chain = state.chains.find((item) => item.id === chainId as ChainId);

  if (!chain) {
    return null;
  }

  const chainPaths = resolveWorkspaceChainPaths(state.workspace, chain.id);

  return {
    chain: {
      ...chain,
      mapPath: chainPaths.mapPath
    },
    chainResume: state.chainResumePackets?.[chain.id] ?? null,
    workItem: buildChainWorkItemDetail(chain, state.workItems?.[chain.id] ?? null),
    session: {
      sessionName: chain.sessionName,
      sessionRunning: chain.sessionRunning,
      queued: chain.queued,
      queueIndex: chain.queueIndex,
      attachCommand: chain.sessionName ? `tmux attach -t ${chain.sessionName}` : null,
      manualHoldUntil: state.manualSessionHolds?.[chain.id] ?? null
    },
    actions: buildChainActionCapabilities(state, chain),
    risk: {
      blocked: chain.blocked,
      critical: chain.riskCount.critical,
      warning: chain.riskCount.warning,
      summary: buildRiskSummary(chain)
    },
    documents: {
      mapPath: chainPaths.mapPath,
      codeListPath: chainPaths.codeListPath,
      reviewPath: resolveReviewPath(state, chain)
    },
    notifications: buildChainNotifications(state, chain.id),
    events: buildEventStream(state).filter((event) => event.chainId === chain.id),
    defectItems: state.defectItems?.[chain.id] ?? []
  };
}

function resolveReviewPath(state: ControlPlaneState, chain: ChainState) {
  const reviewPaths = state.reviewPaths ?? [];
  const matchedReviewPath = [...reviewPaths]
    .reverse()
    .find((path) => new RegExp(`(^|/)Wave\\d+-${chain.priorityWave}\\.md$`, "u").test(path));

  if (matchedReviewPath) {
    return matchedReviewPath;
  }

  return chain.priorityWave === state.waveSummary.wave ? state.waveSummary.reviewPath : null;
}

function buildChainNotifications(state: ControlPlaneState, chainId: ChainId): ChainDetailNotification[] {
  const chainPaths = resolveWorkspaceChainPaths(state.workspace, chainId);

  return state.notifications
    .filter((notification) => notification.targetType === "chain" && notification.targetId === chainId)
    .map((notification) => ({
      ...notification,
      path: chainPaths.notificationPath(notification.id)
    }));
}

function buildRiskSummary(chain: ChainState) {
  if (chain.blocked) {
    return chain.summary || `${chain.nameZh} 当前需要关注。`;
  }

  if (chain.riskCount.critical > 0 || chain.riskCount.warning > 0) {
    return chain.summary || `${chain.nameZh} 当前存在风险提示。`;
  }

  return null;
}
