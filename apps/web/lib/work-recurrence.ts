import { createWorkRecurrenceService } from "@commandry/application";
import { createWorkRecurrenceRepository } from "@commandry/db";
import { WorkRecurrenceError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkRecurrenceService() {
  return createWorkRecurrenceService(
    createWorkRecurrenceRepository(getDatabase().db),
  );
}

export function workRecurrenceFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof WorkRecurrenceError) {
    const status = error.code.endsWith("NOT_FOUND")
      ? 404
      : error.code === "RECURRENCE_INVALID_SCHEDULE" ||
          error.code === "RECURRENCE_INVALID_SOURCE"
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
      message: "Recurring Work is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
