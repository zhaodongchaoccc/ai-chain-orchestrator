import type { EventRecord, NotificationRecord, RiskRecord } from "../../../shared/event-model";

export type { EventRecord, NotificationRecord, RiskRecord };

export interface EventsResponse {
  events: EventRecord[];
  notifications: NotificationRecord[];
}

export interface RisksResponse {
  risks: RiskRecord[];
}
