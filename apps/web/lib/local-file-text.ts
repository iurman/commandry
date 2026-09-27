import { createLocalFileTextService } from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import { createLocalFileTextRepository } from "@commandry/db";
import {
  createLocalFileTextSubmission,
  createPgBossProducer,
} from "@commandry/platform";
import { getDatabase } from "./database";

let submissionPromise:
  Promise<ReturnType<typeof createLocalFileTextSubmission>> | undefined;

export function getLocalFileTextService() {
  return createLocalFileTextService(
    createLocalFileTextRepository(getDatabase().db),
  );
}

export async function enqueueLocalFileText(captureId: string) {
  if (!submissionPromise) {
    submissionPromise = (async () => {
      const config = loadRuntimeConfig();
      const transport = await createPgBossProducer({
        connectionString: config.databaseUrl,
        max: config.bossPoolMax,
      });
      return createLocalFileTextSubmission(transport.boss);
    })().catch((error) => {
      submissionPromise = undefined;
      throw error;
    });
  }
  await (await submissionPromise).enqueue(captureId);
}
