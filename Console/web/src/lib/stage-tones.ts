import { CHAIN_STAGE_META, type ChainStageValue, type ChainUiState } from "../../../shared/event-model";

export function getStageTone(stage: ChainStageValue): ChainUiState {
  if (stage === "PENDING") {
    return "pending";
  }

  return CHAIN_STAGE_META[stage].uiState;
}
