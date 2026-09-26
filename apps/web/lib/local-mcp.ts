import {
  createLocalMcpService,
  createProjectBriefService,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  createBriefRepository,
  createExecutionPacketRepository,
  createLocalAgentRepository,
  createLocalAgentRunRepository,
  createLocalMcpRepository,
} from "@commandry/db";
import { LocalMcpError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalMcpService() {
  const config = loadRuntimeConfig();
  const db = getDatabase().db;
  const sessions = createLocalMcpRepository(db);
  const packets = createExecutionPacketRepository(db);
  const agents = createLocalAgentRepository(db);
  const runs = createLocalAgentRunRepository(db);
  const briefs = createProjectBriefService(createBriefRepository(db));
  return createLocalMcpService(
    {
      ...sessions,
      getPacketById: packets.getById,
      getAgentById: agents.getById,
      isAssigned: agents.isAssigned,
      getProjectBrief: briefs.getBrief,
      getWorkItem: runs.getWorkItem,
    },
    config.localMcpSessionTtlSeconds,
  );
}

export function localMcpFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof LocalMcpError) {
    const status = [
      "PACKET_NOT_FOUND",
      "AGENT_NOT_FOUND",
      "SESSION_NOT_FOUND",
      "CONTEXT_NOT_FOUND",
    ].includes(error.code)
      ? 404
      : ["TOKEN_INVALID", "SESSION_EXPIRED", "SESSION_REVOKED"].includes(
            error.code,
          )
        ? 401
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
      message: "Local MCP reads are unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
