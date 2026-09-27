import { createKnowledgeProjectContextService } from "@commandry/application";
import { createKnowledgeProjectRepository } from "@commandry/db";
import { KnowledgeProjectContextError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getKnowledgeProjectContextService() {
  return createKnowledgeProjectContextService(
    createKnowledgeProjectRepository(getDatabase().db),
  );
}

export function knowledgeProjectFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof KnowledgeProjectContextError) {
    const notFound = [
      "KNOWLEDGE_NOT_FOUND",
      "PROJECT_NOT_FOUND",
      "KNOWLEDGE_PROJECT_LINK_NOT_FOUND",
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
      message: "Knowledge context is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
