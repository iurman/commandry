import { createOvernightQueueService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createOvernightQueueRepository } from "@commandry/db";
import { OvernightQueueError } from "@commandry/domain";
import {
  createOvernightQueueSubmission,
  createPgBossProducer,
} from "@commandry/platform";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let servicePromise:
  Promise<ReturnType<typeof createOvernightQueueService>> | undefined;

export function getOvernightQueueService() {
  if (!servicePromise) {
    servicePromise = (async () => {
      const config = loadRuntimeConfig();
      const database = getDatabase();
      const transport = await createPgBossProducer({
        connectionString: config.databaseUrl,
        max: config.bossPoolMax,
      });
      return createOvernightQueueService(
        {
          ...createOvernightQueueRepository(database.db),
          ...createOvernightQueueSubmission(database.db, transport.boss),
        },
        config.localOvernightMaxDays,
      );
    })().catch((error) => {
      servicePromise = undefined;
      throw error;
    });
  }
  return servicePromise;
}

export function overnightQueueFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof OvernightQueueError) {
    const status = [
      "PACKET_NOT_FOUND",
      "AGENT_NOT_FOUND",
      "ENTRY_NOT_FOUND",
    ].includes(error.code)
      ? 404
      : error.code === "INVALID_SCHEDULE"
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
    { code: "DATABASE_UNAVAILABLE", message: "Overnight queue is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
