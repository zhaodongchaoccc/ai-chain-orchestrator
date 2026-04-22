import type { FastifyInstance } from "fastify";

import { buildEventStream } from "../services/event-store";
import type { ControlPlaneState } from "../types/overview";

export function registerEventRoutes(server: FastifyInstance, loadState: () => Promise<ControlPlaneState>) {
  server.get("/api/events", async () => ({
    events: buildEventStream(await loadState())
  }));
}

export function registerWorkspaceEventRoutes(server: FastifyInstance, loadStateForSource: (sourceId: string) => Promise<ControlPlaneState>) {
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/events", async (request) => ({
    events: buildEventStream(await loadStateForSource(request.params.sourceId))
  }));
}
