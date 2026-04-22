import type { ChainId, EventRecord, NotificationRecord } from "../../../shared/event-model";

export type AiActionTargetType = "chain" | "scheduler" | "main-control" | "wave" | "notification";
export type AiActionMode = "proposal" | "execute";

export interface AiActionRequest {
  actionId: string;
  actionType: string;
  targetType: AiActionTargetType;
  targetId: ChainId | string | null;
  mode: AiActionMode;
  payload: Record<string, unknown>;
  timeoutMs: number;
}

export interface AiActionResult {
  success: boolean;
  message: string;
  eventId: string | null;
  stdout: string | null;
  stderr: string | null;
}

export interface AiFeedResponse {
  events: EventRecord[];
  notifications: NotificationRecord[];
}
