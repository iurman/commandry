import {
  createSyntheticEventImportService,
  createSyntheticEventReadService,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createSyntheticEventImportRepository } from "@commandry/db";
import {
  SyntheticEventBindingError,
  SyntheticEventImportConflictError,
} from "@commandry/domain";
import {
  createPgBossProducer,
  createSyntheticEventImportSubmission,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let importService:
  ReturnType<typeof createSyntheticEventImportService> | undefined;

export async function getSyntheticEventImportService() {
  if (!importService) {
    const config = loadRuntimeConfig();
    const database = getDatabase();
    const transport = await createPgBossProducer({
      connectionString: config.databaseUrl,
      max: config.bossPoolMax,
    });
    const repository = createSyntheticEventImportRepository(database.db);
    importService = createSyntheticEventImportService({
      ...repository,
      ...createSyntheticEventImportSubmission(database.db, transport.boss),
    });
  }
  return importService;
}

export function getSyntheticEventReadService() {
  return createSyntheticEventReadService(
    createSyntheticEventImportRepository(getDatabase().db),
  );
}

export function syntheticEventFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof SyntheticEventImportConflictError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      409,
      `${operation}.conflict`,
    );
  }
  if (error instanceof SyntheticEventBindingError) {
    const status =
      error.code === "RESOURCE_REQUIRED"
        ? 400
        : error.code === "RESOURCE_NOT_LINKED"
          ? 409
          : 404;
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
      code: "DATABASE_UNAVAILABLE",
      message: "Synthetic event data is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
