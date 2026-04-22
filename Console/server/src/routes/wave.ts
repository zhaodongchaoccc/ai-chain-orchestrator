import type { FastifyInstance } from "fastify";

import { buildWaveResponse } from "../services/wave-service";
import type { ControlPlaneState } from "../types/overview";

export function registerWaveRoutes(server: FastifyInstance, loadState: () => Promise<ControlPlaneState>) {
  server.get("/api/wave", async () => {
    const state = await loadState();
    return buildWaveResponse(state);
  });
}

export function registerWorkspaceWaveRoutes(server: FastifyInstance, loadStateForSource: (sourceId: string) => Promise<ControlPlaneState>) {
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/wave", async (request) => {
    const state = await loadStateForSource(request.params.sourceId);
    return buildWaveResponse(state);
  });
}
