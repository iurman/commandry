import { createWorkItemStatusService } from "@commandry/application";
import { createWorkItemStatusRepository } from "@commandry/db";
import { WorkItemStatusError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkItemStatusService() {
  return createWorkItemStatusService(
    createWorkItemStatusRepository(getDatabase().db),
  );
}

export function workItemStatusFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof WorkItemStatusError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "WORK_ITEM_NOT_FOUND" ? 404 : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Work item is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
