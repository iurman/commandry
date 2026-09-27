import { createWorkProjectContextService } from "@commandry/application";
import { createWorkProjectRepository } from "@commandry/db";
import { WorkProjectContextError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkProjectContextService() {
  return createWorkProjectContextService(
    createWorkProjectRepository(getDatabase().db),
  );
}

export function workProjectFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof WorkProjectContextError) {
    const notFound = [
      "WORK_NOT_FOUND",
      "PROJECT_NOT_FOUND",
      "WORK_PROJECT_LINK_NOT_FOUND",
    ].includes(error.code);
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      notFound ? 404 : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Work context is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
