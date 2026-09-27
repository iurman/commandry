import { createCaptureService } from "@commandry/application";
import { createCaptureRepository } from "@commandry/db";
import { CaptureError, KnowledgeLinkError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getCaptureService() {
  return createCaptureService(createCaptureRepository(getDatabase().db));
}

export function captureFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof CaptureError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "CAPTURE_ALREADY_FILED" ? 409 : 404,
      `${operation}.rejected`,
    );
  }
  if (error instanceof KnowledgeLinkError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      400,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Capture data is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
