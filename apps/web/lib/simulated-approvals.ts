import { createSimulatedApprovalService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createSimulatedApprovalRepository } from "@commandry/db";
import { SimulatedApprovalError } from "@commandry/domain";
import {
  createPgBossProducer,
  createSimulatedApprovalDecisionSubmission,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let servicePromise:
  Promise<ReturnType<typeof createSimulatedApprovalService>> | undefined;

export function getSimulatedApprovalService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const config = loadRuntimeConfig();
      const database = getDatabase();
      const transport = await createPgBossProducer({
        connectionString: config.databaseUrl,
        max: config.bossPoolMax,
      });
      return createSimulatedApprovalService(
        {
          ...createSimulatedApprovalRepository(database.db),
          ...createSimulatedApprovalDecisionSubmission(
            database.db,
            transport.boss,
          ),
        },
        {
          localApprovalAutoCeiling: config.localApprovalAutoCeiling,
          localApprovalTtlSeconds: config.localApprovalTtlSeconds,
        },
      );
    })().catch((error) => {
      servicePromise = undefined;
      throw error;
    });
  }
  return servicePromise;
}

export function simulatedApprovalFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof SimulatedApprovalError) {
    const status = [
      "RUN_NOT_FOUND",
      "PACKET_NOT_FOUND",
      "LINK_NOT_FOUND",
      "APPROVAL_NOT_FOUND",
    ].includes(error.code)
      ? 404
      : [
            "PROJECT_SCOPE_DENIED",
            "TARGET_NOT_SELECTED",
            "SIMULATION_NOT_APPROVED",
          ].includes(error.code)
        ? 403
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
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local simulated approval data is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
