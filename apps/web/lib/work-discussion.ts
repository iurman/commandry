import { createWorkDiscussionService } from "@commandry/application";
import { createWorkDiscussionRepository } from "@commandry/db";
import { WorkDiscussionError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkDiscussionService() {
  return createWorkDiscussionService(
    createWorkDiscussionRepository(getDatabase().db),
  );
}

export function workDiscussionFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof WorkDiscussionError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "WORK_NOT_FOUND" ? 404 : 400,
      `${operation}.rejected`,
    );
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Work discussion is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
