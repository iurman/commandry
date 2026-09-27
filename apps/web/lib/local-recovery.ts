import { createLocalRecoveryService } from "@commandry/application";
import { createLocalRecoveryRepository } from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getLocalRecoveryService() {
  return createLocalRecoveryService(
    createLocalRecoveryRepository(getDatabase().db),
  );
}

export function localRecoveryFailure(
  request: Request,
  operation: string,
): Response {
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local recovery evidence is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
