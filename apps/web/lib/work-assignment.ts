import { createWorkAssignmentService } from "@commandry/application";
import { createWorkAssignmentRepository } from "@commandry/db";
import { WorkAssignmentError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkAssignmentService() {
  return createWorkAssignmentService(
    createWorkAssignmentRepository(getDatabase().db),
  );
}

export function workAssignmentFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof WorkAssignmentError) {
    const status =
      error.code === "WORK_ITEM_NOT_FOUND" || error.code === "PROJECT_NOT_FOUND"
        ? 404
        : error.code === "ASSIGNMENT_INVALID"
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
    { code: "DATABASE_UNAVAILABLE", message: "Work assignment is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
