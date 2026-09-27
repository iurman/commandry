import { createSyntheticFlowReplayService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createSyntheticFlowReplayRepository } from "@commandry/db";
import { SyntheticFlowReplayError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getSyntheticFlowReplayService() {
  return createSyntheticFlowReplayService(
    createSyntheticFlowReplayRepository(getDatabase().db),
  );
}

export function syntheticFlowReplayModeFailure(
  request: Request,
  operation: string,
): Response | null {
  const config = loadRuntimeConfig();
  if (config.appEnv === "local" || config.appEnv === "test") return null;
  return jsonResponse(
    request,
    {
      code: "LOCAL_ONLY",
      message: "Synthetic replay is available only in local or test",
    },
    403,
    `${operation}.local_only`,
  );
}

export function syntheticFlowReplayFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof SyntheticFlowReplayError)
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      400,
      `${operation}.rejected`,
    );
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Replay is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
