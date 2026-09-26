import { randomUUID } from "node:crypto";
import {
  createAgentContextService,
  createCaptureTriageProcessor,
  createLocalAgentRunProcessor,
  createLocalAutomationProcessor,
  createSimulatedApprovalProcessor,
  createProjectBriefService,
  createSyntheticEventImportProcessor,
  createSyntheticRunProcessor,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  captureTriageJobV1Schema,
  automationJobV1Schema,
  localAgentRunJobV1Schema,
  simulatedApprovalJobV1Schema,
  syntheticEventImportJobV1Schema,
  syntheticJobV1Schema,
} from "@commandry/contracts";
import {
  createBriefRepository,
  createCaptureTriageRepository,
  createDatabase,
  createLocalAgentRunRepository,
  createLocalAutomationRepository,
  createSimulatedApprovalRepository,
  createSyntheticEventImportRepository,
  createSyntheticRunRepository,
  createWorkerHeartbeatRepository,
} from "@commandry/db";
import {
  CAPTURE_TRIAGE_QUEUE,
  createPgBossProducer,
  createRecurringAutomationScheduler,
  createSyntheticEventAutomationReconciler,
  LOCAL_AGENT_RUN_QUEUE,
  LOCAL_AUTOMATION_QUEUE,
  SIMULATED_APPROVAL_QUEUE,
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
const syntheticEventRepository = createSyntheticEventImportRepository(
  database.db,
);
const processEventImport = createSyntheticEventImportProcessor(
  syntheticEventRepository,
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
const simulatedApprovalRepository = createSimulatedApprovalRepository(
  database.db,
);
const processSimulatedApproval = createSimulatedApprovalProcessor(
  simulatedApprovalRepository,
);
const processCaptureTriage = createCaptureTriageProcessor(
  createCaptureTriageRepository(database.db),
);
const processLocalAutomation = createLocalAutomationProcessor(
  createLocalAutomationRepository(database.db),
  projectBriefService,
  syntheticEventRepository,
);
const recurringAutomationScheduler = createRecurringAutomationScheduler(
  database.db,
  transport.boss,
);
const syntheticEventAutomationReconciler =
  createSyntheticEventAutomationReconciler(database.db, transport.boss);
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
async function reconcileExpiredApprovals() {
  try {
    const count = await simulatedApprovalRepository.reconcileExpired();
    if (count > 0) log("info", "simulated_approval.expired", { count });
  } catch (error) {
    log("error", "simulated_approval.expiry_reconciliation_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}
await reconcileExpiredApprovals();
const approvalExpiryTimer = setInterval(
  () => void reconcileExpiredApprovals(),
  10_000,
);
approvalExpiryTimer.unref();

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
    const imported = await processEventImport(input);
    if (!imported.eventId)
      throw new Error("Synthetic import completed without a normalized event");
    await syntheticEventAutomationReconciler.reconcileEvent(imported.eventId);
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
await transport.boss.work(SIMULATED_APPROVAL_QUEUE, async ([job]) => {
  if (!job) throw new Error("pg-boss delivered an empty approval job batch");
  const input = simulatedApprovalJobV1Schema.parse(job.data);
  try {
    await processSimulatedApproval(input);
    log("info", "simulated_approval.simulation_recorded", {
      approvalId: input.approvalId,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "simulated_approval.failed_attempt", {
      approvalId: input.approvalId,
      jobId: job.id,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
});
await transport.boss.work(
  CAPTURE_TRIAGE_QUEUE,
  { pollingIntervalSeconds: 0.5 },
  async ([job]) => {
    if (!job)
      throw new Error("pg-boss delivered an empty capture triage job batch");
    const input = captureTriageJobV1Schema.parse(job.data);
    try {
      await processCaptureTriage(input.captureId);
      log("info", "capture_triage.suggestion_processed", {
        captureId: input.captureId,
        jobId: job.id,
      });
    } catch (error) {
      log("error", "capture_triage.failed_attempt", {
        captureId: input.captureId,
        jobId: job.id,
        error: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  },
);
await transport.boss.work(LOCAL_AUTOMATION_QUEUE, async ([job]) => {
  if (!job)
    throw new Error("pg-boss delivered an empty local automation job batch");
  const input = automationJobV1Schema.parse(job.data);
  try {
    const run = await processLocalAutomation(input);
    log("info", "local_automation.processed", {
      runId: run.id,
      state: run.state,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "local_automation.failed_attempt", {
      runId: input.runId,
      jobId: job.id,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
});
let reconcilingRecurring = false;
async function reconcileRecurringAutomations() {
  if (reconcilingRecurring) return;
  reconcilingRecurring = true;
  try {
    const count = await recurringAutomationScheduler.reconcile();
    if (count > 0)
      log("info", "local_automation.recurrence_materialized", { count });
  } catch (error) {
    log("error", "local_automation.recurrence_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    reconcilingRecurring = false;
  }
}
await reconcileRecurringAutomations();
const recurringTimer = setInterval(
  () => void reconcileRecurringAutomations(),
  10_000,
);
recurringTimer.unref();
log("info", "worker.started", { workerId });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearInterval(approvalExpiryTimer);
  clearInterval(recurringTimer);
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
