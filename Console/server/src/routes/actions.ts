import type { FastifyInstance, FastifyReply } from "fastify";

import { ActionRunnerError, isSupportedAction, requiresConfirmation, type ActionRequest, type ActionResult } from "../services/action-runner";

export function registerActionRoutes(server: FastifyInstance, runAction: (action: ActionRequest) => Promise<ActionResult>) {
  const handleGlobalAction = async (request: { body?: Partial<ActionRequest> }, reply: FastifyReply) => {
    const actionType = request.body?.actionType;

    if (!actionType || !isSupportedAction(actionType)) {
      return reply.status(400).send({
        success: false,
        actionType: actionType ?? null,
        message: "Unsupported action"
      });
    }

    if (requiresConfirmation(actionType) && request.body?.confirmed !== true) {
      return reply.status(409).send({
        success: false,
        actionType,
        message: `Confirmation required for action: ${actionType}`
      });
    }

    try {
      return await runAction({
        actionType,
        targetId: request.body?.targetId ?? null,
        payload: request.body?.payload,
        confirmed: request.body?.confirmed,
        mode: request.body?.mode,
        timeoutMs: request.body?.timeoutMs
      });
    } catch (error) {
      if (error instanceof ActionRunnerError) {
        return reply.status(error.statusCode).send({
          success: false,
          actionType,
          message: error.message
        });
      }

      throw error;
    }
  };

  server.post<{ Body: Partial<ActionRequest> }>("/api/actions", handleGlobalAction);
  server.post<{ Body: Partial<ActionRequest> }>("/api/global/actions", handleGlobalAction);
}

export function registerWorkspaceActionRoutes(server: FastifyInstance, runActionForSource: (sourceId: string, action: ActionRequest) => Promise<ActionResult>) {
  server.post<{ Params: { sourceId: string }; Body: Partial<ActionRequest> }>("/api/workspaces/:sourceId/actions", async (request, reply) => {
    const actionType = request.body?.actionType;

    if (!actionType || !isSupportedAction(actionType)) {
      return reply.status(400).send({
        success: false,
        actionType: actionType ?? null,
        message: "Unsupported action"
      });
    }

    if (requiresConfirmation(actionType) && request.body?.confirmed !== true) {
      return reply.status(409).send({
        success: false,
        actionType,
        message: `Confirmation required for action: ${actionType}`
      });
    }

    try {
      return await runActionForSource(request.params.sourceId, {
        actionType,
        targetId: request.body?.targetId ?? null,
        payload: request.body?.payload,
        confirmed: request.body?.confirmed,
        mode: request.body?.mode,
        timeoutMs: request.body?.timeoutMs
      });
    } catch (error) {
      if (error instanceof ActionRunnerError) {
        return reply.status(error.statusCode).send({
          success: false,
          actionType,
          message: error.message
        });
      }

      throw error;
    }
  });
}
