import { createWorkRelationsService } from "@commandry/application";
import { createWorkRelationsRepository } from "@commandry/db";
import { WorkRelationError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkRelationsService() {
  return createWorkRelationsService(
    createWorkRelationsRepository(getDatabase().db),
  );
}

export function workRelationsFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof WorkRelationError) {
    const status = ["WORK_NOT_FOUND", "RELATION_NOT_FOUND"].includes(error.code)
      ? 404
      : error.code === "RELATION_SELF"
        ? 400
        : 409;
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
      message: "Work relationships are unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
