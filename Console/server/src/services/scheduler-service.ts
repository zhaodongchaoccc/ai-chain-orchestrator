import type { ChainId, ChainRegistryEntry, DispatchQueueState } from "../../../shared/event-model";
import { DEFAULT_SOURCE_ID } from "../../../shared/event-model";

import { isChainSessionRunning } from "./chain-session-utils";

interface ChainStatusLike {
  stage?: string | null;
  blocked?: boolean;
}

interface ResyncQueueOptions {
  registry: ChainRegistryEntry[];
  chainStatus: Record<string, ChainStatusLike>;
  currentQueue: DispatchQueueState;
  activeSessions: string[];
  sourceId?: string;
  now?: () => Date;
}

const WAVE_RANK = {
  P0: 0,
  P1: 1,
  P2: 2
} as const;

export function resyncQueue({ registry, chainStatus, currentQueue, activeSessions, sourceId = DEFAULT_SOURCE_ID, now = () => new Date() }: ResyncQueueOptions): DispatchQueueState {
  const pendingStart = registry
    .filter((entry) => entry.enabled)
    .filter((entry) => chainStatus[entry.id]?.stage !== "S5")
    .filter((entry) => chainStatus[entry.id]?.stage !== "PENDING")
    .filter((entry) => chainStatus[entry.id]?.stage !== "ROLLBACK")
    .filter((entry) => chainStatus[entry.id]?.blocked !== true)
    .filter((entry) => !isChainSessionRunning(activeSessions, sourceId, entry.id))
    .sort((left, right) => {
      const waveDiff = WAVE_RANK[left.priorityWave] - WAVE_RANK[right.priorityWave];
      if (waveDiff !== 0) {
        return waveDiff;
      }

      const sequenceDiff = left.sequence - right.sequence;
      return sequenceDiff === 0 ? left.id.localeCompare(right.id) : sequenceDiff;
    })
    .map((entry) => entry.id);

  return {
    maxConcurrent: currentQueue.maxConcurrent,
    pendingStart,
    nextCandidate: pendingStart[0] ?? null,
    updatedAt: formatTimestamp(now())
  };
}

export function promoteQueueItem(queue: DispatchQueueState, chainId: ChainId, now: () => Date = () => new Date()): DispatchQueueState {
  const remaining = queue.pendingStart.filter((candidate) => candidate !== chainId);
  const pendingStart = queue.pendingStart.includes(chainId) ? [chainId, ...remaining] : [...queue.pendingStart];

  return {
    maxConcurrent: queue.maxConcurrent,
    pendingStart,
    nextCandidate: pendingStart[0] ?? null,
    updatedAt: formatTimestamp(now())
  };
}

export function formatTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
