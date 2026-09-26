import { createLocalIntegrationService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createLocalIntegrationRepository } from "@commandry/db";
import { LocalIntegrationError } from "@commandry/domain";
import {
  createPgBossProducer,
  createSyntheticEventImportSubmission,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let service: ReturnType<typeof createLocalIntegrationService> | undefined;

export async function getLocalIntegrationService() {
  if (!service) {
    const config = loadRuntimeConfig();
    const database = getDatabase();
    const producer = await createPgBossProducer({
      connectionString: config.databaseUrl,
      max: config.bossPoolMax,
    });
    service = createLocalIntegrationService({
      ...createLocalIntegrationRepository(database.db),
      ...createSyntheticEventImportSubmission(database.db, producer.boss),
    });
  }
  return service;
}

export function localIntegrationWriteAllowed(
  request: Request,
): Response | null {
  const environment = loadRuntimeConfig().appEnv;
  if (environment === "local" || environment === "test") return null;
  return jsonResponse(
    request,
    {
      code: "LOCAL_ONLY",
      message: "Local fixture integrations are unavailable in this environment",
    },
    403,
    "integrations.local_only",
  );
}

export function localIntegrationFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof LocalIntegrationError) {
    const status =
      error.code === "PROJECT_NOT_FOUND" ||
      error.code === "INTEGRATION_NOT_FOUND"
        ? 404
        : error.code === "RESOURCE_REQUIRED" ||
            error.code === "SCENARIO_MISMATCH"
          ? 400
          : 409;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.binding`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "INTEGRATION_UNAVAILABLE",
      message: "Local integration is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
