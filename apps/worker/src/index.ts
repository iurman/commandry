import { randomUUID } from "node:crypto";
import {
  createAgentContextService,
  createLocalAgentRunProcessor,
  createProjectBriefService,
  createSyntheticEventImportProcessor,
  createSyntheticRunProcessor,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  localAgentRunJobV1Schema,
  syntheticEventImportJobV1Schema,
  syntheticJobV1Schema,
} from "@commandry/contracts";
import {
  createBriefRepository,
  createDatabase,
  createLocalAgentRunRepository,
  createSyntheticEventImportRepository,
  createSyntheticRunRepository,
  createWorkerHeartbeatRepository,
} from "@commandry/db";
import {
  createPgBossProducer,
  LOCAL_AGENT_RUN_QUEUE,
  SYNTHETIC_EVENT_IMPORT_QUEUE,
  SYNTHETIC_QUEUE,
} from "@commandry/platform";

const config = loadRuntimeConfig();
const database = createDatabase({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
});
const transport = await createPgBossProducer({
  connectionString: config.databaseUrl,
  max: config.bossPoolMax,
});
const runRepository = createSyntheticRunRepository(database.db);
const heartbeatRepository = createWorkerHeartbeatRepository(database.db);
const processRun = createSyntheticRunProcessor(runRepository);
const processEventImport = createSyntheticEventImportProcessor(
  createSyntheticEventImportRepository(database.db),
);
const localAgentRunRepository = createLocalAgentRunRepository(database.db);
const projectBriefService = createProjectBriefService(
  createBriefRepository(database.db),
);
const localAgentContext = createAgentContextService({
  getAuthorization: localAgentRunRepository.getAuthorization,
  getProjectBrief: projectBriefService.getBrief,
  getWorkItem: localAgentRunRepository.getWorkItem,
  recordAudit: localAgentRunRepository.recordAudit,
  listAudit: localAgentRunRepository.listAudit,
});
const processLocalAgentRun = createLocalAgentRunProcessor(
  localAgentRunRepository,
  localAgentContext,
);
const workerId = randomUUID();

function log(
  level: "info" | "error",
  operation: string,
  details: Record<string, unknown> = {},
) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      service: "worker",
      environment: config.appEnv,
      release: config.releaseSha,
      operation,
      ...details,
    }),
  );
}

async function heartbeat() {
  try {
    await heartbeatRepository.beat(workerId, config.releaseSha);
  } catch (error) {
    log("error", "worker.heartbeat_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

await heartbeat();
const timer = setInterval(() => void heartbeat(), 10_000);
timer.unref();

await transport.boss.work(SYNTHETIC_QUEUE, async ([job]) => {
  if (!job) throw new Error("pg-boss delivered an empty job batch");
  const input = syntheticJobV1Schema.parse(job.data);
  try {
    await processRun(input);
    log("info", "synthetic_run.completed", {
      correlationId: input.runId,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "synthetic_run.failed_attempt", {
      correlationId: input.runId,
      jobId: job.id,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
});
await transport.boss.work(SYNTHETIC_EVENT_IMPORT_QUEUE, async ([job]) => {
  if (!job) throw new Error("pg-boss delivered an empty import job batch");
  const input = syntheticEventImportJobV1Schema.parse(job.data);
  try {
    await processEventImport(input);
    log("info", "synthetic_event_import.completed", {
      correlationId: input.runId,
      occurrenceId: input.occurrenceId,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "synthetic_event_import.failed_attempt", {
      correlationId: input.runId,
      occurrenceId: input.occurrenceId,
      jobId: job.id,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
});
await transport.boss.work(LOCAL_AGENT_RUN_QUEUE, async ([job]) => {
  if (!job) throw new Error("pg-boss delivered an empty local agent job batch");
  const input = localAgentRunJobV1Schema.parse(job.data);
  try {
    await processLocalAgentRun(input);
    log("info", "local_agent_run.completed", {
      correlationId: input.runId,
      occurrenceId: input.occurrenceId,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "local_agent_run.failed_attempt", {
      correlationId: input.runId,
      occurrenceId: input.occurrenceId,
      jobId: job.id,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
});
log("info", "worker.started", { workerId });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  log("info", "worker.stopping", { signal });
  try {
    await transport.close();
    await database.close();
    log("info", "worker.stopped", { workerId });
  } catch (error) {
    log("error", "worker.stop_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    process.exitCode = 1;
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
