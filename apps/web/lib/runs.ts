import { createSyntheticRunService } from "@commandry/application";
import { createSyntheticRunRepository } from "@commandry/db";
import {
  createPgBossProducer,
  createSyntheticRunSubmission,
} from "@commandry/platform";
import { loadRuntimeConfig } from "@commandry/config";
import { getDatabase } from "./database";

let service: ReturnType<typeof createSyntheticRunService> | undefined;

export async function getSyntheticRunService() {
  if (!service) {
    const config = loadRuntimeConfig();
    const database = getDatabase();
    const transport = await createPgBossProducer({
      connectionString: config.databaseUrl,
      max: config.bossPoolMax,
    });
    const submission = createSyntheticRunSubmission(
      database.db,
      transport.boss,
    );
    const repository = createSyntheticRunRepository(database.db);
    service = createSyntheticRunService({
      ...submission,
      getById: repository.getById,
    });
  }
  return service;
}
