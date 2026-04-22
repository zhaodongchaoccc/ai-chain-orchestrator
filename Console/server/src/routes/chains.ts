import type { FastifyInstance } from "fastify";

import { buildChainDetailResponse } from "../services/chain-detail-service";
import type { ControlPlaneState } from "../types/overview";

interface ChainParams {
  id: string;
}

interface WorkspaceChainParams extends ChainParams {
  sourceId: string;
}

export function registerChainRoutes(server: FastifyInstance, loadState: () => Promise<ControlPlaneState>) {
  server.get("/api/chains", async () => {
    const state = await loadState();
    return {
      chains: state.chains,
      registry: state.registry
    };
  });

  server.get<{ Params: ChainParams }>("/api/chains/:id", async (request, reply) => {
    const detail = buildChainDetailResponse(await loadState(), request.params.id);

    if (!detail) {
      return reply.status(404).send({
        message: `Unknown chain id: ${request.params.id}`
      });
    }

    return detail;
  });
}

export function registerWorkspaceChainRoutes(server: FastifyInstance, loadStateForSource: (sourceId: string) => Promise<ControlPlaneState>) {
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/chains", async (request) => {
    const state = await loadStateForSource(request.params.sourceId);
    return {
      chains: state.chains,
      registry: state.registry
    };
  });

  server.get<{ Params: WorkspaceChainParams }>("/api/workspaces/:sourceId/chains/:id", async (request, reply) => {
    const detail = buildChainDetailResponse(await loadStateForSource(request.params.sourceId), request.params.id);

    if (!detail) {
      return reply.status(404).send({
        message: `Unknown chain id: ${request.params.id}`
      });
    }

    return detail;
  });
}
