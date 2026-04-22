import type { DispatchQueueState, NotificationRecord, SchedulerState } from "../../../shared/event-model";

export type { DispatchQueueState, NotificationRecord, SchedulerState };

export interface QueueResponse {
  queue: DispatchQueueState;
  scheduler: SchedulerState;
  notifications: NotificationRecord[];
}
