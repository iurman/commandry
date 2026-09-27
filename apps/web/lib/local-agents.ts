import {
  createAgentContextService,
  createLocalAgentRunControlService,
  createLocalAgentRunService,
  createLocalAgentService,
  createProjectBriefService,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  createBriefRepository,
  createExecutionPacketRepository,
  createLocalAgentRepository,
  createLocalAgentRunRepository,
} from "@commandry/db";
import { LocalAgentError } from "@commandry/domain";
import {
  createLocalAgentRunSubmission,
  createPgBossProducer,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let runServicePromise:
  Promise<ReturnType<typeof createLocalAgentRunService>> | undefined;

export function localAgentModeFailure(
  request: Request,
  operation: string,
): Response | null {
  const config = loadRuntimeConfig();
  if (config.appEnv === "local" || config.appEnv === "test") return null;
  return jsonResponse(
    request,
    {
      code: "LOCAL_ONLY",
      message: "Synthetic local agents are available only in local or test",
    },
    403,
    `${operation}.local_only`,
  );
}

export function getLocalAgentService() {
  return createLocalAgentService(createLocalAgentRepository(getDatabase().db));
}

export function getLocalAgentRunService() {
  if (!runServicePromise) {
    runServicePromise = (async () => {
      const config = loadRuntimeConfig();
      const database = getDatabase();
      const transport = await createPgBossProducer({
        connectionString: config.databaseUrl,
        max: config.bossPoolMax,
      });
      const agents = createLocalAgentRepository(database.db);
      const packets = createExecutionPacketRepository(database.db);
      const runs = createLocalAgentRunRepository(database.db);
      return createLocalAgentRunService({
        getPacketById: packets.getById,
        getAgentById: agents.getById,
        isAssigned: agents.isAssigned,
        getById: runs.getById,
        ...createLocalAgentRunSubmission(database.db, transport.boss),
      });
    })().catch((error) => {
      runServicePromise = undefined;
      throw error;
    });
  }
  return runServicePromise;
}

export function getLocalAgentRunControlService() {
  const runs = createLocalAgentRunRepository(getDatabase().db);
  return createLocalAgentRunControlService({
    getById: runs.getById,
    cancel: runs.cancel,
  });
}

export function getAgentContextService() {
  const database = getDatabase();
  const runs = createLocalAgentRunRepository(database.db);
  const briefs = createProjectBriefService(createBriefRepository(database.db));
  return createAgentContextService({
    getAuthorization: runs.getAuthorization,
    getProjectBrief: briefs.getBrief,
    getWorkItem: runs.getWorkItem,
    recordAudit: runs.recordAudit,
    listAudit: runs.listAudit,
  });
}

export function localAgentFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof LocalAgentError) {
    const status = [
      "AGENT_NOT_FOUND",
      "PROJECT_NOT_FOUND",
      "PACKET_NOT_FOUND",
      "RUN_NOT_FOUND",
      "CONTEXT_NOT_FOUND",
    ].includes(error.code)
      ? 404
      : ["ASSIGNMENT_EXISTS", "OCCURRENCE_CONFLICT"].includes(error.code)
        ? 409
        : 403;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local agent data is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
