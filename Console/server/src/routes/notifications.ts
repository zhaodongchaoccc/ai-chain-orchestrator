import type { FastifyInstance } from "fastify";

import { buildNotificationProjection } from "../services/notification-service";
import { buildEventStream } from "../services/event-store";
import type { ControlPlaneState } from "../types/overview";

export function registerNotificationRoutes(server: FastifyInstance, loadState: () => Promise<ControlPlaneState>) {
  server.get("/api/notifications", async () => {
    const state = await loadState();
    return {
      notifications: buildNotificationProjection(state, buildEventStream(state))
    };
  });
}

export function registerWorkspaceNotificationRoutes(server: FastifyInstance, loadStateForSource: (sourceId: string) => Promise<ControlPlaneState>) {
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/notifications", async (request) => {
    const state = await loadStateForSource(request.params.sourceId);
    return {
      notifications: buildNotificationProjection(state, buildEventStream(state))
    };
  });
}
