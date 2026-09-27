import { createCaptureTriageService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createCaptureTriageRepository } from "@commandry/db";
import { CaptureTriageError } from "@commandry/domain";
import {
  createCaptureTriageSubmission,
  createPgBossProducer,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let service: ReturnType<typeof createCaptureTriageService> | undefined;
let submissionPromise:
  Promise<ReturnType<typeof createCaptureTriageSubmission>> | undefined;

function getSubmission() {
  if (!submissionPromise) {
    submissionPromise = (async () => {
      const config = loadRuntimeConfig();
      const transport = await createPgBossProducer({
        connectionString: config.databaseUrl,
        max: config.bossPoolMax,
      });
      return createCaptureTriageSubmission(transport.boss);
    })().catch((error) => {
      submissionPromise = undefined;
      throw error;
    });
  }
  return submissionPromise;
}

export function getCaptureTriageService() {
  if (!service) {
    service = createCaptureTriageService({
      ...createCaptureTriageRepository(getDatabase().db),
      async enqueueSuggestion(captureId) {
        return (await getSubmission()).enqueueSuggestion(captureId);
      },
    });
  }
  return service;
}

export function captureTriageFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof CaptureTriageError) {
    const status =
      error.code === "CAPTURE_NOT_FOUND" || error.code === "PROJECT_NOT_FOUND"
        ? 404
        : error.code === "CAPTURE_UNSUPPORTED"
          ? 400
          : 409;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Capture triage is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
