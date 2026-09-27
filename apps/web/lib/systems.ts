import { createSystemContextService } from "@commandry/application";
import { createSystemContextRepository } from "@commandry/db";
import { SystemContextError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getSystemContextService() {
  return createSystemContextService(
    createSystemContextRepository(getDatabase().db),
  );
}

export function systemContextFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof SystemContextError) {
    const notFound = [
      "SYSTEM_NOT_FOUND",
      "SYSTEM_LINK_NOT_FOUND",
      "DOMAIN_NOT_FOUND",
      "PROJECT_NOT_FOUND",
      "RESOURCE_NOT_FOUND",
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
    { code: "DATABASE_UNAVAILABLE", message: "System context is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
