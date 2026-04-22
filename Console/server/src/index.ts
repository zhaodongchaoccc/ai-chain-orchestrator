import Fastify from "fastify";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ActionCapabilityMap, MetaResponse, WorkspaceRegistryEntry } from "../../shared/event-model";
import { serverConfig } from "./config";
import { registerAiRoutes, registerWorkspaceAiRoutes } from "./routes/ai";
import { registerActionRoutes, registerWorkspaceActionRoutes } from "./routes/actions";
import { registerChainRoutes, registerWorkspaceChainRoutes } from "./routes/chains";
import { registerEventRoutes, registerWorkspaceEventRoutes } from "./routes/events";
import { registerGlobalRoutes, registerWorkspaceControlRoutes } from "./routes/global";
import { registerNotificationRoutes, registerWorkspaceNotificationRoutes } from "./routes/notifications";
import { registerRiskRoutes, registerWorkspaceRiskRoutes } from "./routes/risks";
import { registerWaveRoutes, registerWorkspaceWaveRoutes } from "./routes/wave";
import { registerMemoryRoutes } from "./routes/memory";
import { registerSystemRoutes } from "./routes/system";
import { registerLifecycleRoutes } from "./routes/lifecycle";
import { registerRequirementRoutes, registerSessionRoutes } from "./routes/requirements";
import { AiBridgeError, createAiBridge, type AiBridge } from "./services/ai-bridge";
import { getMemoryScheduler } from "./services/memory-scheduler";
import { ActionRunnerError, createActionRunner, type ActionRequest, type ActionResult } from "./services/action-runner";
import { aggregateControlPlaneState } from "./services/aggregator";
import { createDemandSourceByName } from "./services/create-demand-source";
import { DemandSourceManifestError } from "./services/demand-source-manifest";
import { loadControlPlaneSources } from "./services/state-loader";
import { getWorkspacePaths, loadWorkspaceRegistry } from "./services/workspace-registry";
import type { ControlPlaneState, HealthApiResponse, OverviewResponse } from "./types/overview";

function buildGlobalActionCapabilities(): ActionCapabilityMap {
  return {
    generate_fee_api_docs: { supported: true, requiresConfirmation: false, targetType: "system", enabled: true, reason: null },
    generate_chain_test_cases: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    open_session: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    start_chain_session: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    resume_chain_session: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    open_terminal_and_attach: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    copy_attach_command: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    copy_review_path: { supported: true, requiresConfirmation: false, targetType: "chain", enabled: true, reason: null },
    pause_scheduler: { supported: true, requiresConfirmation: true, targetType: "scheduler", enabled: true, reason: null },
    resume_scheduler: { supported: true, requiresConfirmation: true, targetType: "scheduler", enabled: true, reason: null },
    promote_queue_item: { supported: true, requiresConfirmation: true, targetType: "chain", enabled: true, reason: null },
    resync_queue: { supported: true, requiresConfirmation: true, targetType: "scheduler", enabled: true, reason: null },
    summarize_overview: { supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null },
    handoff_main_control: { supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null },
    rotate_main_control_session: { supported: true, requiresConfirmation: true, targetType: "main-control", enabled: true, reason: null },
    open_main_control_terminal: { supported: true, requiresConfirmation: false, targetType: "main-control", enabled: true, reason: null },
    generate_wave_summary: { supported: true, requiresConfirmation: true, targetType: "wave", enabled: true, reason: null }
  };
}

function resolveManualSessionHoldMinutes(): number {
  try {
    const policyPath = path.join(serverConfig.paths.shareRoot, "scheduler-policy.json");
    const policy = JSON.parse(readFileSync(policyPath, "utf8")) as { manualSessionHoldMinutes?: unknown };
    const minutes = policy.manualSessionHoldMinutes;
    if (typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0) {
      return minutes;
    }
  } catch {
    // Fall through to default.
  }

  return 15;
}

function buildMetaResponse(): MetaResponse {
  return {
    apiVersion: serverConfig.apiVersion,
    serverVersion: serverConfig.serverVersion,
    startedAt: serverConfig.startedAt,
    pid: process.pid,
    port: serverConfig.port,
    manualSessionHoldMinutes: resolveManualSessionHoldMinutes(),
    capabilities: {
      actions: buildGlobalActionCapabilities()
    }
  };
}

function detectPlatform() {
  if (process.platform === "darwin") {
    return "macos" as const;
  }
  if (process.platform === "linux") {
    try {
      const version = readFileSync("/proc/version", "utf8").toLowerCase();
      if (version.includes("microsoft")) {
        return "wsl2" as const;
      }
    } catch {
      // ignore
    }
  }
  return "linux" as const;
}

async function loadStateFromDisk(): Promise<ControlPlaneState> {
  const workspaces = await loadWorkspaceRegistry(serverConfig.paths);
  const workspace = workspaces.find((entry) => entry.sourceId === "newfee" && entry.enabled) ?? workspaces.find((entry) => entry.enabled) ?? null;

  if (!workspace) {
    const sources = await loadControlPlaneSources(serverConfig.paths);
    return aggregateControlPlaneState(sources);
  }

  const sources = await loadControlPlaneSources(getWorkspacePaths(serverConfig.paths, workspace));
  return aggregateControlPlaneState(sources);
}

export class SourceNotFoundError extends Error {
  statusCode: number;

  constructor(sourceId: string) {
    super(`Unknown source id: ${sourceId}`);
    this.statusCode = 404;
  }
}

async function listWorkspacesFromDisk() {
  return loadWorkspaceRegistry(serverConfig.paths);
}

async function resolveWorkspace(sourceId: string) {
  const workspaces = await listWorkspacesFromDisk();
  const workspace = workspaces.find((entry) => entry.sourceId === sourceId && entry.enabled);

  if (!workspace) {
    throw new SourceNotFoundError(sourceId);
  }

  return workspace;
}

async function loadStateForSourceFromDisk(sourceId: string): Promise<ControlPlaneState> {
  const workspace = await resolveWorkspace(sourceId);

  const sources = await loadControlPlaneSources(getWorkspacePaths(serverConfig.paths, workspace));
  return aggregateControlPlaneState(sources);
}

export function buildServer(options: {
  loadState?: () => Promise<ControlPlaneState>;
  loadStateForSource?: (sourceId: string) => Promise<ControlPlaneState>;
  listWorkspaces?: () => Promise<WorkspaceRegistryEntry[]>;
  createDemandSource?: (demandName: string) => Promise<Awaited<ReturnType<typeof createDemandSourceByName>>>;
  runAction?: (action: ActionRequest) => Promise<ActionResult>;
  runActionForSource?: (sourceId: string, action: ActionRequest) => Promise<ActionResult>;
  aiBridge?: AiBridge;
  aiBridgeForSource?: (sourceId: string) => Promise<AiBridge>;
} = {}) {
  const server = Fastify();
  const loadState = options.loadState ?? loadStateFromDisk;
  const loadStateForSource = options.loadStateForSource ?? loadStateForSourceFromDisk;
  const listWorkspaces = options.listWorkspaces ?? listWorkspacesFromDisk;
  const createDemandSource = options.createDemandSource ?? (async (demandName: string) => createDemandSourceByName({
    projectRoot: serverConfig.paths.projectRoot,
    shareRoot: serverConfig.paths.shareRoot,
    mapsRoot: serverConfig.paths.mapsRoot,
    reviewsRoot: serverConfig.paths.reviewsRoot,
    codeListsRoot: serverConfig.paths.codeListsRoot,
    demandTemplatesRoot: `${serverConfig.paths.projectRoot}/05-需求/templates`,
    worktreesRoot: process.env.FF_WORKTREES_ROOT ?? path.join(process.env.HOME ?? os.homedir(), "ff-worktrees"),
    demandName
  }));
  const runAction = options.runAction ?? createActionRunner(serverConfig.paths);
  const runActionForSource = options.runActionForSource ?? (async (sourceId: string, action: ActionRequest) => {
    try {
      const workspace = await resolveWorkspace(sourceId);
      return createActionRunner(getWorkspacePaths(serverConfig.paths, workspace))(action);
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        throw new ActionRunnerError(error.statusCode, error.message);
      }

      throw error;
    }
  });
  const aiBridge = options.aiBridge ?? createAiBridge(serverConfig.paths, { loadState });
  const aiBridgeForSource = options.aiBridgeForSource ?? (async (sourceId: string) => {
    try {
      const workspace = await resolveWorkspace(sourceId);
      return createAiBridge(getWorkspacePaths(serverConfig.paths, workspace), {
        loadState: () => loadStateForSource(sourceId)
      });
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        throw new AiBridgeError(error.statusCode, error.message);
      }

      throw error;
    }
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof SourceNotFoundError) {
      return reply.status(error.statusCode).send({
        message: error.message
      });
    }

    throw error;
  });

  const wrapSourceRoute = <T>(handler: (sourceId: string) => Promise<T>) => async (sourceId: string) => {
    try {
      return await handler(sourceId);
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        throw error;
      }

      throw error;
    }
  };

  server.get("/health", async () => {
    const state = await loadState();
    return { ok: state.health.ok };
  });
  server.get("/api/platform", async () => ({ platform: detectPlatform() }));
  server.get("/api/meta", async (): Promise<MetaResponse> => buildMetaResponse());
  server.get("/api/health", async (): Promise<HealthApiResponse> => {
    const health = (await loadState()).health;
    return { ...health, platform: detectPlatform() };
  });
  registerGlobalRoutes(server, loadState);
  registerLifecycleRoutes(server, serverConfig.paths);
  registerRequirementRoutes(server, serverConfig.paths);
  registerSessionRoutes(server);
  server.get("/api/overview", async (): Promise<OverviewResponse> => {
    const state = await loadState();
    return {
      overview: state.overview,
      scheduler: state.scheduler,
      waveSummary: state.waveSummary,
      mainControlResume: state.mainControlResume ?? null
    };
  });
  server.get("/api/queue", async () => {
    const state = await loadState();
    return {
      queue: state.queue,
      scheduler: state.scheduler,
      notifications: state.notifications
    };
  });
  server.get("/api/workspaces", async () => ({
    workspaces: await listWorkspaces()
  }));
  server.post<{ Body: { demandName?: string } }>("/api/workspaces", async (request, reply) => {
    const demandName = request.body?.demandName?.trim();

    if (!demandName) {
      return reply.status(400).send({
        message: "Demand name is required"
      });
    }

    try {
      const result = await createDemandSource(demandName);
      return {
        workspace: result.workspace,
        parsed: result.parsed,
        sourceDocPath: result.locatedDoc.relativePath,
        entryDocPath: result.entryDocPath,
        suggestedOverviewPath: `/ws/${result.workspace.sourceId}/overview`
      };
    } catch (error) {
      if (error instanceof DemandSourceManifestError) {
        return reply.status(error.statusCode).send({
          message: error.message
        });
      }

      if (error instanceof Error && (error.message.startsWith("Demand source file not found:") || error.message.startsWith("未找到需求源文件："))) {
        return reply.status(404).send({ message: error.message });
      }

      throw error;
    }
  });
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/health", async (request, reply) => {
    try {
      return (await loadStateForSource(request.params.sourceId)).health;
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }

      throw error;
    }
  });
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/overview", async (request, reply): Promise<OverviewResponse | ReturnType<typeof reply.status>> => {
    try {
      const state = await loadStateForSource(request.params.sourceId);
      return {
        overview: state.overview,
        scheduler: state.scheduler,
        waveSummary: state.waveSummary,
        mainControlResume: state.mainControlResume ?? null
      };
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }

      throw error;
    }
  });
  registerWorkspaceControlRoutes(server, wrapSourceRoute(loadStateForSource));
  server.get<{ Params: { sourceId: string } }>("/api/workspaces/:sourceId/queue", async (request, reply) => {
    try {
      const state = await loadStateForSource(request.params.sourceId);
      return {
        queue: state.queue,
        scheduler: state.scheduler,
        notifications: state.notifications
      };
    } catch (error) {
      if (error instanceof SourceNotFoundError) {
        return reply.status(error.statusCode).send({ message: error.message });
      }

      throw error;
    }
  });
  registerChainRoutes(server, loadState);
  registerWorkspaceChainRoutes(server, wrapSourceRoute(loadStateForSource));
  registerActionRoutes(server, runAction);
  registerWorkspaceActionRoutes(server, runActionForSource);
  registerAiRoutes(server, aiBridge);
  registerWorkspaceAiRoutes(server, aiBridgeForSource);
  registerEventRoutes(server, loadState);
  registerWorkspaceEventRoutes(server, wrapSourceRoute(loadStateForSource));
  registerNotificationRoutes(server, loadState);
  registerWorkspaceNotificationRoutes(server, wrapSourceRoute(loadStateForSource));
  registerRiskRoutes(server, loadState);
  registerWorkspaceRiskRoutes(server, wrapSourceRoute(loadStateForSource));
  registerWaveRoutes(server, loadState);
  registerWorkspaceWaveRoutes(server, wrapSourceRoute(loadStateForSource));
  registerMemoryRoutes(server, getMemoryScheduler(serverConfig.paths), serverConfig.paths);
  registerSystemRoutes(server, serverConfig.paths);

  return server;
}

export function shouldEnforceRuntimePidGuard(env: NodeJS.ProcessEnv = process.env) {
  return env.FF_CONSOLE_SUPERVISED !== "1";
}

async function start() {
  const runtimePidPath = serverConfig.paths.runtimePidPath;
  const enforceRuntimePidGuard = shouldEnforceRuntimePidGuard();
  const cleanupRuntimePid = () => {
    if (!enforceRuntimePidGuard) {
      return;
    }
    try {
      const currentPid = readFileSync(runtimePidPath, "utf8").trim();
      if (currentPid === String(process.pid)) {
        rmSync(runtimePidPath, { force: true });
      }
    } catch {
      // noop
    }
  };

  if (enforceRuntimePidGuard) {
    try {
      const existingPid = readFileSync(runtimePidPath, "utf8").trim();
      if (existingPid && Number(existingPid) !== process.pid) {
        try {
          process.kill(Number(existingPid), 0);
          throw new Error(`FF Console server 已在运行 (PID: ${existingPid})。如需替换旧实例，请运行: bash ${serverConfig.paths.playbooksRoot}/restart-console.sh`);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("FF Console server 已在运行")) {
            rmSync(runtimePidPath, { force: true });
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("FF Console server 已在运行")) {
        console.error(error.message);
        process.exit(1);
      }
    }
  }

  mkdirSync(serverConfig.paths.playbooksRoot, { recursive: true });
  if (enforceRuntimePidGuard) {
    writeFileSync(runtimePidPath, `${process.pid}\n`, "utf8");
    process.once("SIGINT", cleanupRuntimePid);
    process.once("SIGTERM", cleanupRuntimePid);
    process.once("exit", cleanupRuntimePid);
  }

  const server = buildServer();

  // Start daily memory distillation scheduler (default: 02:00)
  const memoryScheduler = getMemoryScheduler(serverConfig.paths);
  memoryScheduler.start();

  try {
    await server.listen({ host: serverConfig.host, port: serverConfig.port });
  } catch (error) {
    memoryScheduler.stop();
    cleanupRuntimePid();
    server.log.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  void start();
}
