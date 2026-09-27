import {
  createAutomationReviewService,
  createLocalAutomationService,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  createAutomationEvidenceRepository,
  createLocalAutomationRepository,
} from "@commandry/db";
import { LocalAutomationError } from "@commandry/domain";
import {
  createLocalAutomationSubmission,
  createPgBossProducer,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let service: ReturnType<typeof createLocalAutomationService> | undefined;
let reviewService: ReturnType<typeof createAutomationReviewService> | undefined;

export async function getLocalAutomationService() {
  if (!service) {
    const config = loadRuntimeConfig();
    const database = getDatabase();
    const transport = await createPgBossProducer({
      connectionString: config.databaseUrl,
      max: config.bossPoolMax,
    });
    service = createLocalAutomationService({
      ...createLocalAutomationRepository(database.db),
      ...createLocalAutomationSubmission(database.db, transport.boss),
    });
  }
  return service;
}

export function getAutomationReviewService() {
  if (!reviewService) {
    const database = getDatabase().db;
    const automation = createLocalAutomationRepository(database);
    reviewService = createAutomationReviewService({
      getRun: automation.getRun,
      getDefinition: automation.getDefinition,
      listRuns: automation.listRuns,
      ...createAutomationEvidenceRepository(database),
    });
  }
  return reviewService;
}

export function localAutomationFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof LocalAutomationError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code.endsWith("NOT_FOUND")
        ? 404
        : error.code === "AUTOMATION_INVALID_SCHEDULE"
          ? 400
          : 409,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local automations are unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
