import { createWorkPlanningService } from "@commandry/application";
import { createWorkPlanningRepository } from "@commandry/db";
import { WorkPlanningError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkPlanningService() {
  return createWorkPlanningService(
    createWorkPlanningRepository(getDatabase().db),
  );
}

export function workPlanningFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof WorkPlanningError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "WORK_ITEM_NOT_FOUND" ? 404 : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Work planning is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
