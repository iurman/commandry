import { createKnowledgeRevisionsService } from "@commandry/application";
import { createKnowledgeRevisionRepository } from "@commandry/db";
import { KnowledgeRevisionError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getKnowledgeRevisionsService() {
  return createKnowledgeRevisionsService(
    createKnowledgeRevisionRepository(getDatabase().db),
  );
}

export function knowledgeRevisionFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof KnowledgeRevisionError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "KNOWLEDGE_NOT_FOUND" ? 404 : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Knowledge note is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
