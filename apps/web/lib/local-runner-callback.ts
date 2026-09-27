import { createLocalRunnerCallbackService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  createLocalAgentRunRepository,
  LocalAgentCallbackCursorError,
} from "@commandry/db";
import { LocalRunnerCallbackError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalRunnerCallbackService() {
  return createLocalRunnerCallbackService(
    createLocalAgentRunRepository(getDatabase().db),
  );
}

export async function localRunnerRunExists(id: string) {
  return !!(await createLocalAgentRunRepository(getDatabase().db).getById(id));
}

export function localRunnerCallbackFailure(
  request: Request,
  operation: string,
  error: unknown,
): Response {
  if (error instanceof LocalRunnerCallbackError) {
    const status =
      error.code === "CALLBACK_SEQUENCE_CONFLICT"
        ? 409
        : error.code === "CALLBACK_PAYLOAD_INVALID"
          ? 400
          : 403;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  if (error instanceof LocalAgentCallbackCursorError)
    return jsonResponse(
      request,
      { code: "INVALID_CURSOR", message: error.message },
      400,
      `${operation}.invalid_cursor`,
    );
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Runner callback is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}

export function localRunnerModeFailure(request: Request, operation: string) {
  const environment = loadRuntimeConfig().appEnv;
  if (environment === "local" || environment === "test") return null;
  return jsonResponse(
    request,
    { code: "LOCAL_ONLY", message: "Synthetic callbacks are local only" },
    403,
    `${operation}.local_only`,
  );
}
