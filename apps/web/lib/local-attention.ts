import { createLocalAttentionService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createLocalAttentionRepository } from "@commandry/db";
import { LocalAttentionError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalAttentionService() {
  return createLocalAttentionService(
    createLocalAttentionRepository(getDatabase().db),
  );
}

export function localAttentionModeFailure(
  request: Request,
  operation: string,
): Response | null {
  const config = loadRuntimeConfig();
  if (config.appEnv === "local" || config.appEnv === "test") return null;
  return jsonResponse(
    request,
    {
      code: "LOCAL_ONLY",
      message: "Synthetic attention rules are available only in local or test",
    },
    403,
    `${operation}.local_only`,
  );
}

export function localAttentionFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof LocalAttentionError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "SETTINGS_STALE" ? 409 : 400,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local attention data is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
