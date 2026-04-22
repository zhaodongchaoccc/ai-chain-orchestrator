import type { SourceRuntimePolicy, SourceRuntimeStateSnapshot } from "../../../shared/event-model";

const DEFAULT_POLICY: SourceRuntimePolicy = {
  autoSleep: true,
  idleSleepMinutes: 30,
  pinned: false,
  maxConcurrentChains: 3
};

export function normalizeSourceRuntimePolicy(input: Partial<SourceRuntimePolicy> | null | undefined): SourceRuntimePolicy {
  const idleSleepMinutes = typeof input?.idleSleepMinutes === "number" && input.idleSleepMinutes >= 1
    ? Math.trunc(input.idleSleepMinutes)
    : DEFAULT_POLICY.idleSleepMinutes;
  const maxConcurrentChains = typeof input?.maxConcurrentChains === "number" && input.maxConcurrentChains >= 1
    ? Math.trunc(input.maxConcurrentChains)
    : DEFAULT_POLICY.maxConcurrentChains;

  return {
    autoSleep: input?.autoSleep !== false,
    idleSleepMinutes,
    pinned: input?.pinned === true,
    maxConcurrentChains
  };
}

export function shouldSleepSourceMainControl(input: {
  policy: SourceRuntimePolicy;
  lastActiveAt: string | null;
  now: Date;
  hasRunningChains: boolean;
  hasCriticalInbox: boolean;
  hasPendingDispatch: boolean;
}) {
  if (!input.policy.autoSleep || input.policy.pinned) {
    return false;
  }
  if (input.hasRunningChains || input.hasCriticalInbox || input.hasPendingDispatch) {
    return false;
  }
  if (!input.lastActiveAt) {
    return false;
  }
  const lastActive = new Date(input.lastActiveAt.replace(" ", "T"));
  if (Number.isNaN(lastActive.getTime())) {
    return false;
  }
  const idleMs = input.now.getTime() - lastActive.getTime();
  return idleMs >= input.policy.idleSleepMinutes * 60 * 1000;
}

export function selectEvictionCandidate(snapshots: SourceRuntimeStateSnapshot[], maxRunningSources: number) {
  const running = snapshots.filter((snapshot) => snapshot.runtimeState === "running" || snapshot.runtimeState === "pinned");
  if (running.length < maxRunningSources) {
    return null;
  }
  return [...running]
    .filter((snapshot) => !snapshot.pinned)
    .sort((left, right) => (left.lastActiveAt ?? "").localeCompare(right.lastActiveAt ?? ""))[0] ?? null;
}
