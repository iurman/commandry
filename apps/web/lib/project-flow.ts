import {
  createProjectFlowService,
  ProjectFlowError,
} from "@commandry/application";
import { createProjectFlowRepository } from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getProjectFlowService() {
  return createProjectFlowService(
    createProjectFlowRepository(getDatabase().db),
  );
}

export function projectFlowFailure(request: Request, error: unknown): Response {
  if (error instanceof ProjectFlowError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "PROJECT_NOT_FOUND" ? 404 : 400,
      "project_flow.rejected",
    );
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Project flow is unavailable" },
    503,
    "project_flow.unavailable",
  );
}
