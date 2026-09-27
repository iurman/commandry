import { createLocalBackupService } from "@commandry/application";
import {
  createLocalBackupRepository,
  LocalBackupCursorError,
} from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalBackupService() {
  return createLocalBackupService(
    createLocalBackupRepository(getDatabase().db),
  );
}

export function localBackupFailure(
  request: Request,
  operation: string,
  error: unknown,
): Response {
  if (error instanceof LocalBackupCursorError)
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
      message: "Local backup evidence is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
