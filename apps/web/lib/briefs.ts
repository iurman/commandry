import {
  createExecutionPacketService,
  createProjectBriefService,
} from "@commandry/application";
import {
  createBriefRepository,
  createExecutionPacketRepository,
  createRecordDetailRepository,
} from "@commandry/db";
import { ExecutionPacketError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getProjectBriefService() {
  return createProjectBriefService(createBriefRepository(getDatabase().db));
}

export function getExecutionPacketService() {
  return createExecutionPacketService(
    createExecutionPacketRepository(getDatabase().db),
  );
}

export function getRecordDetailRepository() {
  return createRecordDetailRepository(getDatabase().db);
}

export function briefFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof ExecutionPacketError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "WORK_ITEM_NOT_FOUND" ? 404 : 400,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Project context is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
