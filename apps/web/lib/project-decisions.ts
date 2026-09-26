import { createProjectDecisionService } from "@commandry/application";
import { createProjectDecisionRepository } from "@commandry/db";
import { ProjectDecisionError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getProjectDecisionService() {
  return createProjectDecisionService(
    createProjectDecisionRepository(getDatabase().db),
  );
}

export function projectDecisionFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof ProjectDecisionError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code.endsWith("NOT_FOUND") ? 404 : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Decisions are unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
