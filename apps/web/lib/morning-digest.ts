import { createMorningDigestService } from "@commandry/application";
import { createMorningDigestRepository } from "@commandry/db";
import { MorningDigestError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let service: ReturnType<typeof createMorningDigestService> | undefined;

export function getMorningDigestService() {
  service ??= createMorningDigestService(
    createMorningDigestRepository(getDatabase().db),
  );
  return service;
}

export function morningDigestFailure(
  request: Request,
  error: unknown,
): Response {
  if (error instanceof MorningDigestError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      400,
      "morning_digest.rejected",
    );
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Morning digest is unavailable" },
    503,
    "morning_digest.unavailable",
  );
}
