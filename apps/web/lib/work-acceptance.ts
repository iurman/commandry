import { createWorkAcceptanceService } from "@commandry/application";
import { createWorkAcceptanceRepository } from "@commandry/db";
import { WorkAcceptanceError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkAcceptanceService() {
  return createWorkAcceptanceService(
    createWorkAcceptanceRepository(getDatabase().db),
  );
}

export function workAcceptanceFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof WorkAcceptanceError) {
    const status = ["WORK_NOT_FOUND", "ATTACHMENT_NOT_FOUND"].includes(
      error.code,
    )
      ? 404
      : error.code === "ACCEPTANCE_REQUIRED"
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
    { code: "DATABASE_UNAVAILABLE", message: "Task acceptance is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
