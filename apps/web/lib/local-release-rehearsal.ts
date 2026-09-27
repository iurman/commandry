import { createLocalReleaseRehearsalService } from "@commandry/application";
import {
  createLocalReleaseRehearsalRepository,
  LocalReleaseCursorError,
} from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalReleaseRehearsalService() {
  return createLocalReleaseRehearsalService(
    createLocalReleaseRehearsalRepository(getDatabase().db),
  );
}

export function localReleaseFailure(
  request: Request,
  operation: string,
  error: unknown,
): Response {
  if (error instanceof LocalReleaseCursorError)
    return jsonResponse(
      request,
      { code: "INVALID_CURSOR", message: error.message },
      400,
      `${operation}.invalid_cursor`,
    );
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local release evidence is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
