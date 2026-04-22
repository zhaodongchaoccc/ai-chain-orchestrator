import type { ChainDetailResponse, ChainId, ChainRegistryEntry, ChainState, ChainSessionName } from "../../../shared/event-model";

export type { ChainDetailResponse, ChainId, ChainRegistryEntry, ChainSessionName, ChainState };

export interface ChainsResponse {
  chains: ChainState[];
  registry: ChainRegistryEntry[];
}
