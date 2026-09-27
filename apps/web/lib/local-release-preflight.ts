import { createLocalReleasePreflightService } from "@commandry/application";
import {
  createLocalReleasePreflightRepository,
  LocalReleasePreflightCursorError,
} from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalReleasePreflightService() {
  return createLocalReleasePreflightService(
    createLocalReleasePreflightRepository(getDatabase().db),
  );
}

export function localReleasePreflightFailure(
  request: Request,
  operation: string,
  error: unknown,
): Response {
  if (error instanceof LocalReleasePreflightCursorError)
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
      message: "Local release preflight evidence is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
