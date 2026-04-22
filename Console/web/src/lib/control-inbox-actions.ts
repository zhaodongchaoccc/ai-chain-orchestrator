import type { ControlInboxItem } from "../../../shared/event-model";

export interface ControlInboxActionState {
  canClaim: boolean;
  canResolve: boolean;
}

export function getControlInboxActionState(item: ControlInboxItem): ControlInboxActionState {
  return {
    canClaim: item.status === "open",
    canResolve: item.status === "open" || item.status === "claimed" || item.status === "escalated"
  };
}
