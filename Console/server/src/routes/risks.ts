import type { FastifyInstance } from "fastify";

import { detectRisks } from "../domain/risk-detector";
import type { ControlPlaneState } from "../types/overview";

export function registerRiskRoutes(server: FastifyInstance, loadState: () => Promise<ControlPlaneState>) {
  server.get("/api/risks", async () => {
    const state = await loadState();
    return {
      risks: detectRisks(state)
    };
  });
}

export function registerWorkspaceRiskRoutes(server: FastifyInstance, loadStateForSource: (sourceId: string) => Promise<ControlPlaneState>) {
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/risks", async (request) => {
    const state = await loadStateForSource(request.params.sourceId);
    return {
      risks: detectRisks(state)
    };
  });
}
