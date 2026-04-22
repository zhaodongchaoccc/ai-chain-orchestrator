import type { PriorityWave, WaveResponse, WaveReviewEntry } from "../../../shared/event-model";

import type { ControlPlaneState } from "../types/overview";

const WAVE_ORDER = ["P0", "P1", "P2"] as const;
const STAGE_ORDER = ["S1", "S2", "S3", "S4", "S5", "PENDING"] as const;

export function buildWaveResponse(state: ControlPlaneState): WaveResponse {
  const wave = state.waveSummary.wave;
  const chains = WAVE_ORDER.includes(wave as PriorityWave)
    ? state.chains.filter((chain) => chain.priorityWave === wave)
    : [];
  const waveCompleted = chains.length > 0 && chains.every((chain) => chain.stage === "S5");

  return {
    waveSummary: state.waveSummary,
    chains: [...chains].sort((left, right) => {
      const stageDiff = STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage);
      return stageDiff === 0 ? (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") : stageDiff;
    }),
    reviews: buildReviewEntries(state.reviewPaths ?? []),
    canTriggerSummary: WAVE_ORDER.includes(wave as PriorityWave) && waveCompleted
  };
}

function buildReviewEntries(reviewPaths: string[]): WaveReviewEntry[] {
  return [...reviewPaths]
    .map((path) => {
      const match = path.match(/Wave(\d+)-(P[0-2])\.md$/u);
      return {
        path,
        wave: (match?.[2] as PriorityWave | undefined) ?? null,
        sequence: match ? Number.parseInt(match[1], 10) : null,
        label: path.replace(/^Reviews\//u, "")
      } satisfies WaveReviewEntry;
    })
    .sort((left, right) => {
      const sequenceDiff = (right.sequence ?? -1) - (left.sequence ?? -1);
      return sequenceDiff === 0 ? right.path.localeCompare(left.path) : sequenceDiff;
    });
}
