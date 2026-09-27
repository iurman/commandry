import { createFileCaptureService } from "@commandry/application";
import { createFileCaptureRepository } from "@commandry/db";
import { FileCaptureError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getFileCaptureService() {
  return createFileCaptureService(
    createFileCaptureRepository(getDatabase().db),
  );
}

export function fileCaptureFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof FileCaptureError) {
    const status =
      error.code === "FILE_NOT_FOUND"
        ? 404
        : error.code === "FILE_TOO_LARGE"
          ? 413
          : error.code === "FILE_CORRUPT"
            ? 503
            : 400;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Original file is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
