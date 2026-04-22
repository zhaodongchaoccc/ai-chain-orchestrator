import type { FastifyInstance } from "fastify";

import type { AiBridge } from "../services/ai-bridge";
import { AiBridgeError } from "../services/ai-bridge";
import type { AiChatRequest, AiDispatchRequest } from "../../../shared/event-model";

export function registerAiRoutes(server: FastifyInstance, aiBridge: AiBridge) {
  server.post<{ Body: AiChatRequest }>("/api/ai/chat", async (request, reply) => {
    try {
      return await aiBridge.chat(request.body);
    } catch (error) {
      if (error instanceof AiBridgeError) {
        return reply.status(error.statusCode).send({
          message: error.message
        });
      }

      throw error;
    }
  });

  server.post<{ Body: AiDispatchRequest }>("/api/ai/dispatch", async (request, reply) => {
    if (!request.body?.proposalId) {
      return reply.status(400).send({
        message: "AI proposal id is required"
      });
    }

    try {
      return await aiBridge.dispatch(request.body);
    } catch (error) {
      if (error instanceof AiBridgeError) {
        return reply.status(error.statusCode).send({
          message: error.message
        });
      }

      throw error;
    }
  });
}

export function registerWorkspaceAiRoutes(server: FastifyInstance, getAiBridgeForSource: (sourceId: string) => Promise<AiBridge>) {
  server.post<{ Params: { sourceId: string }; Body: AiChatRequest }>("/api/workspaces/:sourceId/ai/chat", async (request, reply) => {
    try {
      return await (await getAiBridgeForSource(request.params.sourceId)).chat(request.body);
    } catch (error) {
      if (error instanceof AiBridgeError) {
        return reply.status(error.statusCode).send({
          message: error.message
        });
      }

      throw error;
    }
  });

  server.post<{ Params: { sourceId: string }; Body: AiDispatchRequest }>("/api/workspaces/:sourceId/ai/dispatch", async (request, reply) => {
    if (!request.body?.proposalId) {
      return reply.status(400).send({
        message: "AI proposal id is required"
      });
    }

    try {
      return await (await getAiBridgeForSource(request.params.sourceId)).dispatch(request.body);
    } catch (error) {
      if (error instanceof AiBridgeError) {
        return reply.status(error.statusCode).send({
          message: error.message
        });
      }

      throw error;
    }
  });
}
