import {
  createProjectAgentFindingsService,
  ProjectAgentFindingsError,
} from "@commandry/application";
import { createProjectAgentFindingsRepository } from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getProjectAgentFindingsService() {
  return createProjectAgentFindingsService(
    createProjectAgentFindingsRepository(getDatabase().db),
  );
}

export function projectAgentFindingsFailure(
  request: Request,
  error: unknown,
): Response {
  if (error instanceof ProjectAgentFindingsError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "PROJECT_NOT_FOUND" ? 404 : 400,
      "project_agent_findings.rejected",
    );
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Agent findings are unavailable" },
    503,
    "project_agent_findings.unavailable",
  );
}
