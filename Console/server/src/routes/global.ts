import type { FastifyInstance } from "fastify";

import type { ControlResponse, HealthApiResponse, OverviewResponse } from "../types/overview";

import type { ControlPlaneState } from "../types/overview";
import { buildGlobalControlActionCapabilities, buildSourceControlActionCapabilities } from "../services/action-capability-matrix";

function buildOverviewResponse(state: ControlPlaneState): OverviewResponse {
  return {
    overview: state.overview,
    scheduler: state.scheduler,
    waveSummary: state.waveSummary,
    mainControlResume: state.mainControlResume ?? null
  };
}

function buildControlResponse(state: ControlPlaneState, options: { includeWorkspace?: boolean } = {}): ControlResponse {
  return {
    workspace: options.includeWorkspace === true ? state.workspace : undefined,
    overview: state.overview,
    scheduler: state.scheduler,
    waveSummary: state.waveSummary,
    queue: state.queue,
    notifications: state.notifications,
    mainControlResume: state.mainControlResume ?? null,
    preflight: state.preflight,
    health: state.health,
    actions: options.includeWorkspace === true ? buildSourceControlActionCapabilities(state) : buildGlobalControlActionCapabilities(state),
    sourceRuntimeState: state.sourceRuntimeState ?? null,
    sourcePolicy: state.sourcePolicy ?? null,
    controlInboxItems: state.controlInboxItems ?? [],
    orchestrationState: state.orchestrationState ?? null
  };
}

export function registerGlobalRoutes(server: FastifyInstance, loadState: () => Promise<ControlPlaneState>) {
  server.get("/api/global/health", async (): Promise<HealthApiResponse> => (await loadState()).health);
  server.get("/api/global/overview", async (): Promise<OverviewResponse> => buildOverviewResponse(await loadState()));
  server.get("/api/global/control", async (): Promise<ControlResponse> => buildControlResponse(await loadState()));
}

export function registerWorkspaceControlRoutes(server: FastifyInstance, loadStateForSource: (sourceId: string) => Promise<ControlPlaneState>) {
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/control", async (request): Promise<ControlResponse> => buildControlResponse(await loadStateForSource(request.params.sourceId), { includeWorkspace: true }));
}
