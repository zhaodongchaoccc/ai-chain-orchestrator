import type { FastifyInstance } from "fastify";

import type { MemoryScheduler } from "../services/memory-scheduler";
import { loadDistillState } from "../services/memory-distill-service";
import type { ffPaths } from "../config";

export function registerMemoryRoutes(
  server: FastifyInstance,
  scheduler: MemoryScheduler,
  paths: typeof ffPaths
) {
  /** GET /api/memory/status — current distillation state + scheduler info */
  server.get("/api/memory/status", async () => {
    const [schedulerStatus, distillState] = await Promise.all([
      scheduler.getStatus(),
      loadDistillState(paths)
    ]);

    return {
      scheduler: schedulerStatus,
      lastResult: distillState.lastResult,
      runCount: distillState.runCount
    };
  });

  /** POST /api/memory/distill — immediately trigger a distillation */
  server.post("/api/memory/distill", async (_request, reply) => {
    const status = await scheduler.getStatus();

    if (status.running) {
      return reply.status(409).send({ message: "蒸馏任务正在运行，请稍后重试" });
    }

    try {
      const result = await scheduler.triggerNow();
      return {
        success: true,
        result
      };
    } catch (error) {
      return reply.status(500).send({
        message: error instanceof Error ? error.message : "蒸馏任务失败"
      });
    }
  });
}
