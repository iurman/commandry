import { randomUUID } from "node:crypto";
import {
  createAgentContextService,
  createCaptureTriageProcessor,
  createLocalAgentRunProcessor,
  createLocalAttentionService,
  createLocalAgentRunService,
  createOvernightQueueProcessor,
  createLocalAutomationProcessor,
  createLocalFileTextService,
  createLocalConnectorService,
  createLocalIntegrationService,
  createSimulatedApprovalProcessor,
  createProjectBriefService,
  createSyntheticEventImportProcessor,
  createSyntheticRunProcessor,
  createWorkRecurrenceProcessor,
} from "@commandry/application";
import { loadRuntimeConfig } from "@commandry/config";
import {
  captureTriageJobV1Schema,
  automationJobV1Schema,
  localAgentRunJobV1Schema,
  localFileTextJobV1Schema,
  overnightQueueJobV1Schema,
  simulatedApprovalJobV1Schema,
  syntheticEventImportJobV1Schema,
  syntheticJobV1Schema,
  workRecurrenceJobV1Schema,
} from "@commandry/contracts";
import {
  createBriefRepository,
  createCaptureTriageRepository,
  createDatabase,
  createLocalAgentRunRepository,
  createLocalAttentionRepository,
  createLocalAgentRepository,
  createExecutionPacketRepository,
  createOvernightQueueRepository,
  createLocalAutomationRepository,
  createLocalFileTextRepository,
  createLocalConnectorRepository,
  createLocalIntegrationRepository,
  createSimulatedApprovalRepository,
  createSyntheticEventImportRepository,
  createSyntheticRunRepository,
  createWorkerHeartbeatRepository,
  createWorkRecurrenceRepository,
} from "@commandry/db";
import {
  CAPTURE_TRIAGE_QUEUE,
  createPgBossProducer,
  createLocalAgentRunSubmission,
  createSyntheticEventImportSubmission,
  createRecurringAutomationScheduler,
  createWorkRecurrenceScheduler,
  createSyntheticEventAutomationReconciler,
  createSyntheticConditionAutomationReconciler,
  LOCAL_AGENT_RUN_QUEUE,
  OVERNIGHT_QUEUE,
  LOCAL_AUTOMATION_QUEUE,
  LOCAL_FILE_TEXT_QUEUE,
  SIMULATED_APPROVAL_QUEUE,
  SYNTHETIC_EVENT_IMPORT_QUEUE,
  SYNTHETIC_QUEUE,
  WORK_RECURRENCE_QUEUE,
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
const localAttentionService = createLocalAttentionService(
  createLocalAttentionRepository(database.db),
);
let evaluatingLocalAttention = false;
async function evaluateLocalAttention() {
  if (
    evaluatingLocalAttention ||
    (config.appEnv !== "local" && config.appEnv !== "test")
  )
    return;
  evaluatingLocalAttention = true;
  try {
    const outcome = await localAttentionService.evaluate();
    if (outcome.activated || outcome.resolved)
      log("info", "local_attention.evaluated", outcome);
  } catch (error) {
    log("error", "local_attention.evaluation_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    evaluatingLocalAttention = false;
  }
}
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
const overnightQueueRepository = createOvernightQueueRepository(database.db);
const agentRepository = createLocalAgentRepository(database.db);
const packetRepository = createExecutionPacketRepository(database.db);
const submitLocalAgentRun = createLocalAgentRunService({
  getPacketById: packetRepository.getById,
  getAgentById: agentRepository.getById,
  isAssigned: agentRepository.isAssigned,
  getById: localAgentRunRepository.getById,
  ...createLocalAgentRunSubmission(database.db, transport.boss),
});
const processOvernightQueue = createOvernightQueueProcessor(
  overnightQueueRepository,
  submitLocalAgentRun.submit,
);
async function reconcileOvernightQueue() {
  try {
    let cursor: string | undefined;
    while (true) {
      const ids = await overnightQueueRepository.listRecoverable(
        new Date(),
        cursor,
      );
      if (ids.length === 0) break;
      for (const id of ids) {
        try {
          await processOvernightQueue(id);
        } catch (error) {
          log("error", "overnight_queue.recovery_failed", {
            entryId: id,
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      }
      if (ids.length < 100) break;
      cursor = ids.at(-1);
    }
  } catch (error) {
    log("error", "overnight_queue.reconciliation_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}
const simulatedApprovalRepository = createSimulatedApprovalRepository(
  database.db,
);
const processSimulatedApproval = createSimulatedApprovalProcessor(
  simulatedApprovalRepository,
);
const processCaptureTriage = createCaptureTriageProcessor(
  createCaptureTriageRepository(database.db),
);
const fileTextRepository = createLocalFileTextRepository(database.db);
const fileTextService = createLocalFileTextService(fileTextRepository);
const localIntegrationRepository = createLocalIntegrationRepository(
  database.db,
);
const localIntegrationService = createLocalIntegrationService({
  ...localIntegrationRepository,
  ...createSyntheticEventImportSubmission(database.db, transport.boss),
});
const localConnectorService = createLocalConnectorService({
  ...createLocalConnectorRepository(database.db),
  get: localIntegrationService.get,
  resourceLinkedToProject: localIntegrationRepository.resourceLinkedToProject,
  submitSample: localIntegrationService.submitSample,
});
const processLocalAutomation = createLocalAutomationProcessor(
  createLocalAutomationRepository(database.db),
  projectBriefService,
  syntheticEventRepository,
);
const recurringAutomationScheduler = createRecurringAutomationScheduler(
  database.db,
  transport.boss,
);
const workRecurrenceRepository = createWorkRecurrenceRepository(database.db);
const processWorkRecurrence = createWorkRecurrenceProcessor(
  workRecurrenceRepository,
);
const workRecurrenceScheduler = createWorkRecurrenceScheduler(
  database.db,
  transport.boss,
);
const syntheticEventAutomationReconciler =
  createSyntheticEventAutomationReconciler(database.db, transport.boss);
const syntheticConditionAutomationReconciler =
  createSyntheticConditionAutomationReconciler(database.db, transport.boss);
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
await reconcileOvernightQueue();
const overnightRecoveryTimer = setInterval(
  () => void reconcileOvernightQueue(),
  60_000,
);
overnightRecoveryTimer.unref();
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
    await syntheticConditionAutomationReconciler.reconcileEvent(
      imported.eventId,
    );
    await evaluateLocalAttention();
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
await transport.boss.work(OVERNIGHT_QUEUE, async ([job]) => {
  if (!job) throw new Error("pg-boss delivered an empty overnight job batch");
  const input = overnightQueueJobV1Schema.parse(job.data);
  try {
    await processOvernightQueue(input.entryId);
    log("info", "overnight_queue.processed", {
      entryId: input.entryId,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "overnight_queue.failed_attempt", {
      entryId: input.entryId,
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
await transport.boss.work(
  LOCAL_FILE_TEXT_QUEUE,
  { pollingIntervalSeconds: 0.5 },
  async ([job]) => {
    if (!job) throw new Error("pg-boss delivered an empty file text job batch");
    const input = localFileTextJobV1Schema.parse(job.data);
    try {
      const result = await fileTextService.process(input.captureId);
      log("info", "local_file_text.processed", {
        captureId: input.captureId,
        status: result.status,
        jobId: job.id,
      });
    } catch (error) {
      log("error", "local_file_text.failed_attempt", {
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
await transport.boss.work(WORK_RECURRENCE_QUEUE, async ([job]) => {
  if (!job)
    throw new Error("pg-boss delivered an empty Work recurrence job batch");
  const input = workRecurrenceJobV1Schema.parse(job.data);
  try {
    const occurrence = await processWorkRecurrence(input);
    log("info", "work_recurrence.processed", {
      occurrenceId: occurrence.id,
      state: occurrence.state,
      jobId: job.id,
    });
  } catch (error) {
    log("error", "work_recurrence.failed_attempt", {
      occurrenceId: input.occurrenceId,
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
let reconcilingWorkRecurrence = false;
async function reconcileWorkRecurrences() {
  if (reconcilingWorkRecurrence) return;
  reconcilingWorkRecurrence = true;
  try {
    const count = await workRecurrenceScheduler.reconcile();
    if (count > 0) log("info", "work_recurrence.occurrences_queued", { count });
  } catch (error) {
    log("error", "work_recurrence.reconciliation_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    reconcilingWorkRecurrence = false;
  }
}
await reconcileWorkRecurrences();
const workRecurrenceTimer = setInterval(
  () => void reconcileWorkRecurrences(),
  10_000,
);
workRecurrenceTimer.unref();
let reconcilingFileText = false;
async function reconcileFileText() {
  if (reconcilingFileText) return;
  reconcilingFileText = true;
  try {
    let cursor: string | undefined;
    while (true) {
      const ids = await fileTextRepository.listPending(100, cursor);
      if (ids.length === 0) break;
      for (const id of ids) {
        try {
          await fileTextService.process(id);
        } catch (error) {
          log("error", "local_file_text.recovery_failed", {
            captureId: id,
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      }
      if (ids.length < 100) break;
      cursor = ids.at(-1);
    }
  } catch (error) {
    log("error", "local_file_text.reconciliation_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    reconcilingFileText = false;
  }
}
await reconcileFileText();
const fileTextTimer = setInterval(() => void reconcileFileText(), 30_000);
fileTextTimer.unref();
let reconcilingLocalFeed = false;
async function reconcileLocalFeed() {
  if (
    reconcilingLocalFeed ||
    (config.appEnv !== "local" && config.appEnv !== "test")
  )
    return;
  reconcilingLocalFeed = true;
  try {
    for (let count = 0; count < 25; count += 1) {
      const item = await localConnectorService.processNext();
      if (!item) break;
      log("info", "local_connector.synthetic_poll_processed", {
        feedId: item.id,
        state: item.state,
      });
    }
  } catch (error) {
    log("error", "local_connector.synthetic_poll_failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  } finally {
    reconcilingLocalFeed = false;
  }
}
await reconcileLocalFeed();
const localFeedTimer = setInterval(() => void reconcileLocalFeed(), 5_000);
localFeedTimer.unref();
await evaluateLocalAttention();
const localAttentionTimer = setInterval(
  () => void evaluateLocalAttention(),
  10_000,
);
localAttentionTimer.unref();
log("info", "worker.started", { workerId });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  clearInterval(approvalExpiryTimer);
  clearInterval(recurringTimer);
  clearInterval(workRecurrenceTimer);
  clearInterval(fileTextTimer);
  clearInterval(localFeedTimer);
  clearInterval(localAttentionTimer);
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
