import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { PgBoss, fromDrizzle } from "pg-boss";
import { Pool } from "pg";
import type {
  CreateAutomationDefinitionRequest,
  CreateOvernightQueueEntryRequest,
  SetAutomationEnabledRequest,
  TriggerAutomationRunRequest,
} from "@commandry/contracts";
import type {
  PreparedSimulatedApprovalDecision,
  PreparedLocalAgentRun,
  PreparedSyntheticEventImport,
} from "@commandry/application";
import type { CommandryDatabase } from "@commandry/db";
import {
  automationDefinitionRecord,
  automationRunRecord,
  createLocalAgentRunRepository,
  createOvernightQueueRepository,
  createSimulatedApprovalRepository,
  createSyntheticEventImportRepository,
  schema,
} from "@commandry/db";
import {
  LocalAutomationError,
  requireAutomationEnabled,
  requireExpectedAutomationEnabled,
  requireSameAutomationOccurrence,
  scheduledAutomationTime,
  recurringAutomationStart,
  dueRecurrence,
  firstRecurrenceAfter,
  localAutomationTrigger,
  workRecurrenceDue,
  syntheticEventAutomationDecision,
  syntheticConditionAutomationDecision,
  LocalAgentError,
  OvernightQueueError,
  LocalIntegrationError,
  SimulatedApprovalError,
  SyntheticEventImportConflictError,
  type SyntheticRun,
} from "@commandry/domain";

export const SYNTHETIC_QUEUE = "commandry-synthetic-v1";
export const SYNTHETIC_DEAD_LETTER_QUEUE = "commandry-synthetic-dlq";
export const SYNTHETIC_EVENT_IMPORT_QUEUE =
  "commandry-synthetic-event-import-v1";
export const SYNTHETIC_EVENT_IMPORT_DEAD_LETTER_QUEUE =
  "commandry-synthetic-event-import-dlq";
export const LOCAL_AGENT_RUN_QUEUE = "commandry-local-agent-run-v1";
export const LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE =
  "commandry-local-agent-run-dlq";
export const OVERNIGHT_QUEUE = "commandry-overnight-v1";
export const OVERNIGHT_DEAD_LETTER_QUEUE = "commandry-overnight-dlq";
export const SIMULATED_APPROVAL_QUEUE = "commandry-simulated-approval-v1";
export const SIMULATED_APPROVAL_DEAD_LETTER_QUEUE =
  "commandry-simulated-approval-dlq";
export const CAPTURE_TRIAGE_QUEUE = "commandry-capture-triage-v1";
export const CAPTURE_TRIAGE_DEAD_LETTER_QUEUE = "commandry-capture-triage-dlq";
export const LOCAL_FILE_TEXT_QUEUE = "commandry-local-file-text-v1";
export const LOCAL_FILE_TEXT_DEAD_LETTER_QUEUE =
  "commandry-local-file-text-dlq";
export const LOCAL_AUTOMATION_QUEUE = "commandry-local-automation-v1";
export const LOCAL_AUTOMATION_DEAD_LETTER_QUEUE =
  "commandry-local-automation-dlq";
export const WORK_RECURRENCE_QUEUE = "commandry-work-recurrence-v1";
export const WORK_RECURRENCE_DEAD_LETTER_QUEUE =
  "commandry-work-recurrence-dlq";

function bossOptions(connectionString: string, max: number, migrate: boolean) {
  return {
    connectionString,
    max,
    migrate,
    supervise: true,
    schedule: false,
  } as const;
}

/** Runs in the one-shot DDL process, not in web or worker startup. */
export async function installPgBossSchema(options: {
  connectionString: string;
  runtimeRole: string;
}): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(options.runtimeRole)) {
    throw new Error("runtimeRole must be a simple PostgreSQL role name");
  }
  const boss = new PgBoss(bossOptions(options.connectionString, 1, true));
  await boss.start();
  try {
    await boss.createQueue(SYNTHETIC_DEAD_LETTER_QUEUE);
    await boss.createQueue(SYNTHETIC_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SYNTHETIC_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(SYNTHETIC_EVENT_IMPORT_DEAD_LETTER_QUEUE);
    await boss.createQueue(SYNTHETIC_EVENT_IMPORT_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SYNTHETIC_EVENT_IMPORT_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE);
    await boss.createQueue(LOCAL_AGENT_RUN_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(OVERNIGHT_DEAD_LETTER_QUEUE);
    await boss.createQueue(OVERNIGHT_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: OVERNIGHT_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(SIMULATED_APPROVAL_DEAD_LETTER_QUEUE);
    await boss.createQueue(SIMULATED_APPROVAL_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SIMULATED_APPROVAL_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(CAPTURE_TRIAGE_DEAD_LETTER_QUEUE);
    await boss.createQueue(CAPTURE_TRIAGE_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: CAPTURE_TRIAGE_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(LOCAL_FILE_TEXT_DEAD_LETTER_QUEUE);
    await boss.createQueue(LOCAL_FILE_TEXT_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: LOCAL_FILE_TEXT_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(LOCAL_AUTOMATION_DEAD_LETTER_QUEUE);
    await boss.createQueue(LOCAL_AUTOMATION_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: LOCAL_AUTOMATION_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(WORK_RECURRENCE_DEAD_LETTER_QUEUE);
    await boss.createQueue(WORK_RECURRENCE_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: WORK_RECURRENCE_DEAD_LETTER_QUEUE,
    });
  } finally {
    await boss.stop();
  }

  const pool = new Pool({ connectionString: options.connectionString, max: 1 });
  const role = `"${options.runtimeRole}"`;
  try {
    await pool.query(`GRANT USAGE ON SCHEMA pgboss TO ${role}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT EXECUTE ON FUNCTIONS TO ${role}`,
    );
  } finally {
    await pool.end();
  }
}

export function createCaptureTriageSubmission(boss: PgBoss) {
  return {
    async enqueueSuggestion(captureId: string): Promise<void> {
      const jobId = await boss.send(CAPTURE_TRIAGE_QUEUE, {
        version: 1,
        captureId,
      });
      if (!jobId) throw new Error("Capture triage job was not enqueued");
    },
  };
}

export function createLocalFileTextSubmission(boss: PgBoss) {
  return {
    async enqueue(captureId: string): Promise<void> {
      const jobId = await boss.send(LOCAL_FILE_TEXT_QUEUE, {
        version: 1,
        captureId,
      });
      if (!jobId) throw new Error("Local file text job was not enqueued");
    },
  };
}

export function createLocalAutomationSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async createDefinition(input: CreateAutomationDefinitionRequest) {
      return db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(eq(schema.project.id, input.projectId))
          .limit(1);
        if (!owner)
          throw new LocalAutomationError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        const now = new Date();
        const recurrence = recurringAutomationStart(input.recurrence, now);
        const triggerType = localAutomationTrigger(input);
        if (input.condition) {
          const [link] = await tx
            .select({ id: schema.projectResourceLink.id })
            .from(schema.projectResourceLink)
            .where(
              and(
                eq(schema.projectResourceLink.projectId, input.projectId),
                eq(
                  schema.projectResourceLink.resourceId,
                  input.condition.resourceId,
                ),
                eq(schema.projectResourceLink.lifecycle, "active"),
              ),
            )
            .limit(1);
          if (!link)
            throw new LocalAutomationError(
              "AUTOMATION_INVALID_CONDITION",
              "Condition resource needs an active link to this project",
            );
        }
        const id = crypto.randomUUID();
        const [row] = await tx
          .insert(schema.automationDefinition)
          .values({
            id,
            projectId: input.projectId,
            name: input.name,
            triggerType,
            eventType: input.eventType ?? null,
            conditionResourceId: input.condition?.resourceId ?? null,
            conditionThresholdPercent:
              input.condition?.thresholdPercent ?? null,
            recurrenceStartAt: recurrence?.startAt ?? null,
            recurrenceEveryMinutes: recurrence?.everyMinutes ?? null,
            nextOccurrenceAt: recurrence?.startAt ?? null,
            enabled: input.enabled,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new Error("Automation insert returned no row");
        await tx.insert(schema.automationAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: id,
          actor: "local-user:unattributed",
          operation: "automation.created",
          details: {
            enabled: input.enabled,
            triggerType,
            eventType: input.eventType ?? null,
            conditionResourceId: input.condition?.resourceId ?? null,
            conditionMetricName: input.condition?.metricName ?? null,
            conditionOperator: input.condition?.operator ?? null,
            conditionThresholdPercent:
              input.condition?.thresholdPercent ?? null,
            recurrenceStartAt: recurrence?.startAt.toISOString() ?? null,
            recurrenceEveryMinutes: recurrence?.everyMinutes ?? null,
          },
          createdAt: now,
        });
        if (input.enabled && triggerType === "on_creation_once") {
          const runId = crypto.randomUUID();
          await tx.insert(schema.automationRun).values({
            id: runId,
            definitionId: id,
            projectId: input.projectId,
            occurrenceId: crypto.randomUUID(),
            trigger: "on_creation",
            createdAt: now,
          });
          const jobId = await boss.send(
            LOCAL_AUTOMATION_QUEUE,
            {
              version: 1,
              runId,
              definitionId: id,
            },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Local automation job was not enqueued");
          await tx.insert(schema.automationAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: id,
            runId,
            actor: "system:local-automation",
            operation: "automation.run_queued",
            details: { trigger: "on_creation", jobId },
            createdAt: now,
          });
        }
        return automationDefinitionRecord(row);
      });
    },
    async setEnabled(id: string, input: SetAutomationEnabledRequest) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(schema.automationDefinition)
          .where(eq(schema.automationDefinition.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new LocalAutomationError(
            "AUTOMATION_NOT_FOUND",
            "Automation not found",
          );
        requireExpectedAutomationEnabled(
          current.enabled,
          input.expectedEnabled,
          input.enabled,
        );
        const now = new Date();
        let nextOccurrenceAt = current.nextOccurrenceAt;
        if (
          input.enabled &&
          current.recurrenceStartAt &&
          current.recurrenceEveryMinutes &&
          current.nextOccurrenceAt
        ) {
          nextOccurrenceAt = firstRecurrenceAfter(
            current.recurrenceStartAt,
            current.recurrenceEveryMinutes,
            now,
          );
        }
        const [updated] = await tx
          .update(schema.automationDefinition)
          .set({ enabled: input.enabled, nextOccurrenceAt, updatedAt: now })
          .where(eq(schema.automationDefinition.id, id))
          .returning();
        if (!updated) throw new Error("Locked automation disappeared");
        await tx.insert(schema.automationAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: id,
          actor: "local-user:unattributed",
          operation: "automation.enabled_changed",
          details: {
            previousEnabled: current.enabled,
            enabled: input.enabled,
            nextOccurrenceAt: nextOccurrenceAt?.toISOString() ?? null,
          },
          createdAt: now,
        });
        const [pending] = await tx
          .select({ scheduledFor: schema.automationRun.scheduledFor })
          .from(schema.automationRun)
          .where(
            and(
              eq(schema.automationRun.definitionId, id),
              eq(schema.automationRun.state, "queued"),
              eq(schema.automationRun.trigger, "scheduled"),
              isNotNull(schema.automationRun.scheduledFor),
            ),
          )
          .orderBy(asc(schema.automationRun.scheduledFor))
          .limit(1);
        return automationDefinitionRecord(
          updated,
          pending?.scheduledFor ?? null,
        );
      });
    },
    async triggerRun(id: string, input: TriggerAutomationRunRequest) {
      return db.transaction(async (tx) => {
        const [definition] = await tx
          .select()
          .from(schema.automationDefinition)
          .where(eq(schema.automationDefinition.id, id))
          .for("update")
          .limit(1);
        if (!definition)
          throw new LocalAutomationError(
            "AUTOMATION_NOT_FOUND",
            "Automation not found",
          );
        const [prior] = await tx
          .select()
          .from(schema.automationRun)
          .where(eq(schema.automationRun.occurrenceId, input.occurrenceId))
          .limit(1);
        if (prior) {
          requireSameAutomationOccurrence(prior, id, input.scheduledFor);
          return automationRunRecord(prior);
        }
        requireAutomationEnabled(definition.enabled);
        const now = new Date();
        const scheduledFor = scheduledAutomationTime(input.scheduledFor, now);
        const [inserted] = await tx
          .insert(schema.automationRun)
          .values({
            id: crypto.randomUUID(),
            definitionId: id,
            projectId: definition.projectId,
            occurrenceId: input.occurrenceId,
            trigger: scheduledFor ? "scheduled" : "manual",
            scheduledFor,
            createdAt: now,
          })
          .onConflictDoNothing({ target: schema.automationRun.occurrenceId })
          .returning();
        if (inserted) {
          const jobId = await boss.send(
            LOCAL_AUTOMATION_QUEUE,
            {
              version: 1,
              runId: inserted.id,
              definitionId: id,
            },
            {
              db: fromDrizzle(tx, sql),
              ...(scheduledFor ? { startAfter: scheduledFor } : {}),
            },
          );
          if (!jobId) throw new Error("Local automation job was not enqueued");
          await tx.insert(schema.automationAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: id,
            runId: inserted.id,
            actor: "local-user:unattributed",
            operation: "automation.run_queued",
            details: {
              trigger: scheduledFor ? "scheduled" : "manual",
              scheduledFor: scheduledFor?.toISOString() ?? null,
              jobId,
            },
            createdAt: now,
          });
          return automationRunRecord(inserted);
        }
        const [existing] = await tx
          .select()
          .from(schema.automationRun)
          .where(eq(schema.automationRun.occurrenceId, input.occurrenceId))
          .limit(1);
        if (!existing)
          throw new LocalAutomationError(
            "AUTOMATION_OCCURRENCE_CONFLICT",
            "Occurrence was not found after a concurrent submission",
          );
        requireSameAutomationOccurrence(existing, id, input.scheduledFor);
        return automationRunRecord(existing);
      });
    },
  };
}

function eventOccurrenceId(definitionId: string, eventId: string): string {
  const digest = createHash("sha256")
    .update(`synthetic_event:${definitionId}:${eventId}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Materialize one local, source-linked occurrence per matching synthetic event. */
export function createSyntheticEventAutomationReconciler(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async reconcileEvent(eventId: string): Promise<number> {
      const [event] = await db
        .select()
        .from(schema.normalizedEvent)
        .where(eq(schema.normalizedEvent.id, eventId))
        .limit(1);
      if (!event?.isSynthetic) return 0;
      const candidates = await db
        .select({ id: schema.automationDefinition.id })
        .from(schema.automationDefinition)
        .where(
          and(
            eq(schema.automationDefinition.projectId, event.projectId),
            eq(schema.automationDefinition.triggerType, "synthetic_event"),
            eq(schema.automationDefinition.eventType, event.type),
            lte(schema.automationDefinition.createdAt, event.ingestedAt),
          ),
        );
      let materialized = 0;
      for (const candidate of candidates) {
        const created = await db.transaction(async (tx) => {
          const [definition] = await tx
            .select()
            .from(schema.automationDefinition)
            .where(eq(schema.automationDefinition.id, candidate.id))
            .for("update")
            .limit(1);
          if (
            !definition ||
            syntheticEventAutomationDecision(definition, event, false) ===
              "ineligible"
          )
            return false;
          const [existing] = await tx
            .select({ id: schema.automationRun.id })
            .from(schema.automationRun)
            .where(
              and(
                eq(schema.automationRun.definitionId, definition.id),
                eq(schema.automationRun.sourceEventId, event.id),
              ),
            )
            .limit(1);
          if (existing) return false;
          const now = new Date();
          const [active] = definition.enabled
            ? await tx
                .select({ id: schema.automationRun.id })
                .from(schema.automationRun)
                .where(
                  and(
                    eq(schema.automationRun.definitionId, definition.id),
                    inArray(schema.automationRun.state, ["queued", "running"]),
                    sql`(${schema.automationRun.scheduledFor} is null or ${schema.automationRun.scheduledFor} <= ${now})`,
                  ),
                )
                .limit(1)
            : [];
          const decision = syntheticEventAutomationDecision(
            definition,
            event,
            Boolean(active),
          );
          const reason =
            decision === "skip_disabled"
              ? "disabled_at_event"
              : decision === "skip_overlap"
                ? "previous_run_active"
                : null;
          const runId = crypto.randomUUID();
          await tx.insert(schema.automationRun).values({
            id: runId,
            definitionId: definition.id,
            projectId: definition.projectId,
            occurrenceId: eventOccurrenceId(definition.id, event.id),
            trigger: "synthetic_event",
            sourceEventId: event.id,
            state: reason ? "skipped" : "queued",
            error: reason
              ? reason === "disabled_at_event"
                ? "Disabled when synthetic event was processed"
                : "Previous local run is still active"
              : null,
            completedAt: reason ? now : null,
            createdAt: now,
          });
          if (reason) {
            await tx.insert(schema.automationAuditEvent).values({
              id: crypto.randomUUID(),
              definitionId: definition.id,
              runId,
              actor: "system:synthetic-event-automation",
              operation: "automation.run_skipped",
              details: {
                reason,
                sourceEventId: event.id,
                eventType: event.type,
              },
              createdAt: now,
            });
            return true;
          }
          const jobId = await boss.send(
            LOCAL_AUTOMATION_QUEUE,
            { version: 1, runId, definitionId: definition.id },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId)
            throw new Error("Synthetic event automation job was not enqueued");
          await tx.insert(schema.automationAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: definition.id,
            runId,
            actor: "system:synthetic-event-automation",
            operation: "automation.run_queued",
            details: {
              trigger: "synthetic_event",
              sourceEventId: event.id,
              eventType: event.type,
              jobId,
            },
            createdAt: now,
          });
          return true;
        });
        if (created) materialized += 1;
      }
      return materialized;
    },
  };
}

/** Reconcile an immutable synthetic availability sample once when it enters a configured low state. */
export function createSyntheticConditionAutomationReconciler(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async reconcileEvent(eventId: string): Promise<number> {
      const [sample] = await db
        .select()
        .from(schema.metricSample)
        .where(eq(schema.metricSample.eventId, eventId))
        .limit(1);
      if (
        !sample ||
        !sample.isSynthetic ||
        sample.sourceKind !== "synthetic-operations" ||
        sample.name !== "external_availability" ||
        sample.unit !== "percent"
      )
        return 0;
      const candidates = await db
        .select({ id: schema.automationDefinition.id })
        .from(schema.automationDefinition)
        .where(
          and(
            eq(schema.automationDefinition.projectId, sample.projectId),
            eq(
              schema.automationDefinition.conditionResourceId,
              sample.resourceId,
            ),
            eq(schema.automationDefinition.triggerType, "synthetic_condition"),
            lte(schema.automationDefinition.createdAt, sample.recordedAt),
          ),
        );
      let materialized = 0;
      for (const candidate of candidates) {
        const created = await db.transaction(async (tx) => {
          const [definition] = await tx
            .select()
            .from(schema.automationDefinition)
            .where(eq(schema.automationDefinition.id, candidate.id))
            .for("update")
            .limit(1);
          if (!definition) return false;
          const [activeLink] = await tx
            .select({ id: schema.projectResourceLink.id })
            .from(schema.projectResourceLink)
            .where(
              and(
                eq(schema.projectResourceLink.projectId, sample.projectId),
                eq(schema.projectResourceLink.resourceId, sample.resourceId),
                eq(schema.projectResourceLink.lifecycle, "active"),
              ),
            )
            .limit(1);
          if (!activeLink) return false;
          const [latest] = await tx
            .select({ id: schema.metricSample.id })
            .from(schema.metricSample)
            .where(
              and(
                eq(schema.metricSample.projectId, sample.projectId),
                eq(schema.metricSample.resourceId, sample.resourceId),
                eq(schema.metricSample.name, "external_availability"),
                eq(schema.metricSample.sourceKind, "synthetic-operations"),
              ),
            )
            .orderBy(
              desc(schema.metricSample.sampledAt),
              desc(schema.metricSample.id),
            )
            .limit(1);
          const [previous] = await tx
            .select({ value: schema.metricSample.value })
            .from(schema.metricSample)
            .where(
              and(
                eq(schema.metricSample.projectId, sample.projectId),
                eq(schema.metricSample.resourceId, sample.resourceId),
                eq(schema.metricSample.name, "external_availability"),
                eq(schema.metricSample.sourceKind, "synthetic-operations"),
                sql`(${schema.metricSample.sampledAt}, ${schema.metricSample.id}) < (${sample.sampledAt}, ${sample.id}::uuid)`,
              ),
            )
            .orderBy(
              desc(schema.metricSample.sampledAt),
              desc(schema.metricSample.id),
            )
            .limit(1);
          const [existing] = await tx
            .select({ id: schema.automationRun.id })
            .from(schema.automationRun)
            .where(
              and(
                eq(schema.automationRun.definitionId, definition.id),
                eq(schema.automationRun.sourceEventId, sample.eventId),
              ),
            )
            .limit(1);
          if (existing) return false;
          const [active] = definition.enabled
            ? await tx
                .select({ id: schema.automationRun.id })
                .from(schema.automationRun)
                .where(
                  and(
                    eq(schema.automationRun.definitionId, definition.id),
                    inArray(schema.automationRun.state, ["queued", "running"]),
                  ),
                )
                .limit(1)
            : [];
          const decision = syntheticConditionAutomationDecision(
            definition,
            sample,
            previous?.value ?? null,
            latest?.id === sample.id,
            Boolean(active),
          );
          if (decision === "ineligible") return false;
          const reason =
            decision === "skip_disabled"
              ? "disabled_at_condition"
              : decision === "skip_overlap"
                ? "previous_run_active"
                : null;
          const now = new Date();
          const runId = crypto.randomUUID();
          await tx.insert(schema.automationRun).values({
            id: runId,
            definitionId: definition.id,
            projectId: definition.projectId,
            occurrenceId: eventOccurrenceId(definition.id, sample.eventId),
            trigger: "synthetic_condition",
            sourceEventId: sample.eventId,
            sourceMetricSampleId: sample.id,
            state: reason ? "skipped" : "queued",
            error: reason
              ? reason === "disabled_at_condition"
                ? "Disabled when synthetic condition was observed"
                : "Previous local run is still active"
              : null,
            completedAt: reason ? now : null,
            createdAt: now,
          });
          const details = {
            trigger: "synthetic_condition",
            metricSampleId: sample.id,
            sourceEventId: sample.eventId,
            resourceId: sample.resourceId,
            metricName: "external_availability",
            value: sample.value,
            thresholdPercent: definition.conditionThresholdPercent,
            previousValue: previous?.value ?? null,
            sampledAt: sample.sampledAt.toISOString(),
            sourceLabel: sample.sourceLabel,
          };
          if (reason) {
            await tx.insert(schema.automationAuditEvent).values({
              id: crypto.randomUUID(),
              definitionId: definition.id,
              runId,
              actor: "system:synthetic-condition-automation",
              operation: "automation.run_skipped",
              details: { ...details, reason },
              createdAt: now,
            });
            return true;
          }
          const jobId = await boss.send(
            LOCAL_AUTOMATION_QUEUE,
            { version: 1, runId, definitionId: definition.id },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId)
            throw new Error(
              "Synthetic condition automation job was not enqueued",
            );
          await tx.insert(schema.automationAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: definition.id,
            runId,
            actor: "system:synthetic-condition-automation",
            operation: "automation.run_queued",
            details: { ...details, jobId },
            createdAt: now,
          });
          return true;
        });
        if (created) materialized += 1;
      }
      return materialized;
    },
  };
}

function recurringOccurrenceId(definitionId: string, dueAt: Date): string {
  const digest = createHash("sha256")
    .update(`${definitionId}:${dueAt.toISOString()}`)
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Materialize at most one most-recent due occurrence per definition per sweep. */
export function createRecurringAutomationScheduler(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async reconcile(now = new Date(), limit = 20): Promise<number> {
      const candidates = await db
        .select({ id: schema.automationDefinition.id })
        .from(schema.automationDefinition)
        .where(
          and(
            eq(schema.automationDefinition.enabled, true),
            eq(schema.automationDefinition.triggerType, "recurring_interval"),
            lte(schema.automationDefinition.nextOccurrenceAt, now),
          ),
        )
        .orderBy(asc(schema.automationDefinition.nextOccurrenceAt))
        .limit(limit);
      let materialized = 0;
      for (const candidate of candidates) {
        const created = await db.transaction(async (tx) => {
          const [definition] = await tx
            .select()
            .from(schema.automationDefinition)
            .where(eq(schema.automationDefinition.id, candidate.id))
            .for("update", { skipLocked: true })
            .limit(1);
          if (
            !definition?.enabled ||
            definition.triggerType !== "recurring_interval" ||
            !definition.nextOccurrenceAt ||
            !definition.recurrenceEveryMinutes
          )
            return false;
          const due = dueRecurrence(
            definition.nextOccurrenceAt,
            definition.recurrenceEveryMinutes,
            now,
          );
          if (!due) return false;
          const [active] = await tx
            .select({ id: schema.automationRun.id })
            .from(schema.automationRun)
            .where(
              and(
                eq(schema.automationRun.definitionId, definition.id),
                inArray(schema.automationRun.state, ["queued", "running"]),
                sql`(${schema.automationRun.scheduledFor} is null or ${schema.automationRun.scheduledFor} <= ${now})`,
              ),
            )
            .limit(1);
          const runId = crypto.randomUUID();
          const [run] = await tx
            .insert(schema.automationRun)
            .values({
              id: runId,
              definitionId: definition.id,
              projectId: definition.projectId,
              occurrenceId: recurringOccurrenceId(definition.id, due.dueAt),
              trigger: "recurring",
              scheduledFor: due.dueAt,
              state: active ? "skipped" : "queued",
              error: active ? "Previous local run is still active" : null,
              completedAt: active ? now : null,
              createdAt: now,
            })
            .onConflictDoNothing({ target: schema.automationRun.occurrenceId })
            .returning();
          await tx
            .update(schema.automationDefinition)
            .set({ nextOccurrenceAt: due.nextAt, updatedAt: now })
            .where(eq(schema.automationDefinition.id, definition.id));
          if (due.skipped > 0) {
            await tx.insert(schema.automationAuditEvent).values({
              id: crypto.randomUUID(),
              definitionId: definition.id,
              actor: "system:local-automation-scheduler",
              operation: "automation.occurrences_skipped",
              details: {
                count: due.skipped,
                reason: "bounded_catch_up",
                latestDueAt: due.dueAt.toISOString(),
              },
              createdAt: now,
            });
          }
          if (!run) return false;
          if (active) {
            await tx.insert(schema.automationAuditEvent).values({
              id: crypto.randomUUID(),
              definitionId: definition.id,
              runId,
              actor: "system:local-automation-scheduler",
              operation: "automation.run_skipped",
              details: {
                reason: "previous_run_active",
                activeRunId: active.id,
              },
              createdAt: now,
            });
            return true;
          }
          const jobId = await boss.send(
            LOCAL_AUTOMATION_QUEUE,
            { version: 1, runId, definitionId: definition.id },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId)
            throw new Error("Recurring local automation job was not enqueued");
          await tx.insert(schema.automationAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: definition.id,
            runId,
            actor: "system:local-automation-scheduler",
            operation: "automation.run_queued",
            details: {
              trigger: "recurring",
              scheduledFor: due.dueAt.toISOString(),
              jobId,
            },
            createdAt: now,
          });
          return true;
        });
        if (created) materialized += 1;
      }
      return materialized;
    },
  };
}

/** Queue one latest due task occurrence per definition, with bounded catch-up. */
export function createWorkRecurrenceScheduler(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async reconcile(now = new Date(), limit = 20): Promise<number> {
      const candidates = await db
        .select({ id: schema.workRecurrenceDefinition.id })
        .from(schema.workRecurrenceDefinition)
        .where(
          and(
            eq(schema.workRecurrenceDefinition.enabled, true),
            lte(schema.workRecurrenceDefinition.nextOccurrenceAt, now),
          ),
        )
        .orderBy(asc(schema.workRecurrenceDefinition.nextOccurrenceAt))
        .limit(limit);
      let queued = 0;
      for (const candidate of candidates) {
        const created = await db.transaction(async (tx) => {
          const [definition] = await tx
            .select()
            .from(schema.workRecurrenceDefinition)
            .where(eq(schema.workRecurrenceDefinition.id, candidate.id))
            .for("update", { skipLocked: true })
            .limit(1);
          if (!definition?.enabled) return false;
          const due = workRecurrenceDue(
            definition.nextOccurrenceAt,
            definition.everyMinutes,
            now,
          );
          if (!due) return false;
          const occurrenceId = recurringOccurrenceId(definition.id, due.dueAt);
          const [occurrence] = await tx
            .insert(schema.workRecurrenceOccurrence)
            .values({
              id: occurrenceId,
              definitionId: definition.id,
              scheduledFor: due.dueAt,
              state: "queued",
              createdAt: now,
            })
            .onConflictDoNothing({
              target: [
                schema.workRecurrenceOccurrence.definitionId,
                schema.workRecurrenceOccurrence.scheduledFor,
              ],
            })
            .returning();
          await tx
            .update(schema.workRecurrenceDefinition)
            .set({ nextOccurrenceAt: due.nextAt })
            .where(eq(schema.workRecurrenceDefinition.id, definition.id));
          if (due.skipped > 0) {
            await tx.insert(schema.workRecurrenceAuditEvent).values({
              id: crypto.randomUUID(),
              definitionId: definition.id,
              operation: "work.recurrence.occurrences_skipped",
              actor: "system:local-work-scheduler",
              details: {
                count: due.skipped,
                reason: "bounded_catch_up",
                latestDueAt: due.dueAt.toISOString(),
              },
              createdAt: now,
            });
          }
          if (!occurrence) return false;
          const jobId = await boss.send(
            WORK_RECURRENCE_QUEUE,
            { version: 1, occurrenceId, definitionId: definition.id },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Recurring Work job was not enqueued");
          await tx.insert(schema.workRecurrenceAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: definition.id,
            occurrenceId,
            operation: "work.recurrence.occurrence_queued",
            actor: "system:local-work-scheduler",
            details: {
              jobId,
              scheduledFor: due.dueAt.toISOString(),
              sourceWorkItemId: definition.sourceWorkItemId,
            },
            createdAt: now,
          });
          return true;
        });
        if (created) queued += 1;
      }
      return queued;
    },
  };
}

/** Producer startup has no schema mutation and uses a separate bounded pool. */
export async function createPgBossProducer(options: {
  connectionString: string;
  max?: number;
}) {
  const boss = new PgBoss(
    bossOptions(options.connectionString, options.max ?? 2, false),
  );
  await boss.start();
  return { boss, close: () => boss.stop() };
}

/** Application submission port: the product row and job commit or roll back together. */
export function createSyntheticRunSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async submitOnce(occurrenceId: string): Promise<SyntheticRun> {
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.syntheticRun)
          .values({
            id: crypto.randomUUID(),
            occurrenceId,
            state: "queued",
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          const jobId = await boss.send(
            SYNTHETIC_QUEUE,
            {
              version: 1,
              runId: inserted.id,
              occurrenceId,
            },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Synthetic job was not enqueued");
          await tx.insert(schema.auditEvent).values({
            id: crypto.randomUUID(),
            actor: "system:api",
            operation: "synthetic_run.queued",
            targetRunId: inserted.id,
            details: { jobId },
          });
          return inserted;
        }

        const [existing] = await tx
          .select()
          .from(schema.syntheticRun)
          .where(eq(schema.syntheticRun.occurrenceId, occurrenceId))
          .limit(1);
        if (!existing)
          throw new Error("Synthetic occurrence was not found after conflict");
        return existing;
      });
    },
  };
}

/** Persist the original synthetic evidence, product run, queue job, and audit atomically. */
export function createSyntheticEventImportSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createSyntheticEventImportRepository(db);
  return {
    async submitOnce(input: PreparedSyntheticEventImport) {
      const importId = await db.transaction(async (tx) => {
        if (input.integrationInstanceId) {
          const [instance] = await tx
            .select()
            .from(schema.integrationInstance)
            .where(
              eq(schema.integrationInstance.id, input.integrationInstanceId),
            )
            .for("update")
            .limit(1);
          if (!instance) {
            throw new LocalIntegrationError(
              "INTEGRATION_NOT_FOUND",
              "Integration not found",
            );
          }
          if (!instance.enabled) {
            throw new LocalIntegrationError(
              "INTEGRATION_DISABLED",
              "Enable the integration before running a sample",
            );
          }
          if (
            instance.kind !== input.sourceKind ||
            instance.projectId !== input.projectId ||
            instance.resourceId !== input.resourceId
          ) {
            throw new LocalIntegrationError(
              "SCENARIO_MISMATCH",
              "Sample does not match its configured source",
            );
          }
          if (instance.resourceId) {
            const [link] = await tx
              .select({ id: schema.projectResourceLink.id })
              .from(schema.projectResourceLink)
              .where(
                and(
                  eq(schema.projectResourceLink.projectId, instance.projectId),
                  eq(
                    schema.projectResourceLink.resourceId,
                    instance.resourceId,
                  ),
                  eq(schema.projectResourceLink.lifecycle, "active"),
                ),
              )
              .limit(1);
            if (!link) {
              throw new LocalIntegrationError(
                "RESOURCE_NOT_LINKED",
                "Resource is no longer linked to this project",
              );
            }
          }
        }
        const [inserted] = await tx
          .insert(schema.syntheticEventImport)
          .values({
            id: crypto.randomUUID(),
            occurrenceId: input.occurrenceId,
            requestFingerprint: input.requestFingerprint,
            integrationInstanceId: input.integrationInstanceId,
            scenarioId: input.scenarioId,
            projectId: input.projectId,
            resourceId: input.resourceId,
            state: "queued",
          })
          .onConflictDoNothing({
            target: schema.syntheticEventImport.occurrenceId,
          })
          .returning({ id: schema.syntheticEventImport.id });

        if (!inserted) {
          const [existing] = await tx
            .select({
              id: schema.syntheticEventImport.id,
              requestFingerprint:
                schema.syntheticEventImport.requestFingerprint,
            })
            .from(schema.syntheticEventImport)
            .where(
              eq(schema.syntheticEventImport.occurrenceId, input.occurrenceId),
            )
            .limit(1);
          if (!existing)
            throw new Error(
              "Synthetic event import was not found after conflict",
            );
          if (existing.requestFingerprint !== input.requestFingerprint)
            throw new SyntheticEventImportConflictError();
          return existing.id;
        }

        const envelopeId = crypto.randomUUID();
        await tx.insert(schema.sourceEnvelope).values({
          id: envelopeId,
          importId: inserted.id,
          sourceKind: input.sourceKind,
          sourceLabel: input.sourceLabel,
          sourceSchemaVersion: input.sourceSchemaVersion,
          sourceEventId: input.sourceEventId,
          rawPayload: input.rawPayload,
          occurredAt: input.occurredAt
            ? new Date(input.occurredAt)
            : new Date(),
          isSynthetic: true,
        });

        const jobId = await boss.send(
          SYNTHETIC_EVENT_IMPORT_QUEUE,
          {
            version: 1,
            runId: inserted.id,
            occurrenceId: input.occurrenceId,
          },
          { db: fromDrizzle(tx, sql) },
        );
        if (!jobId) throw new Error("Synthetic event import was not enqueued");

        await tx.insert(schema.auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:api",
          operation: "synthetic_event_import.queued",
          targetImportId: inserted.id,
          details: {
            jobId,
            envelopeId,
            scenarioId: input.scenarioId,
            integrationInstanceId: input.integrationInstanceId,
          },
        });
        return inserted.id;
      });

      const record = await repository.getById(importId);
      if (!record)
        throw new Error("Synthetic event import disappeared after submission");
      return record;
    },
  };
}

/** A packet-bound fake run, expiring grants, queue job, and audit commit together. */
export function createLocalAgentRunSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createLocalAgentRunRepository(db);
  return {
    async submitOnce(input: PreparedLocalAgentRun) {
      const runId = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.localAgentRun)
          .values({
            id: crypto.randomUUID(),
            agentId: input.agentId,
            packetId: input.packetId,
            packetVersion: input.packetVersion,
            packetDigest: input.packetDigest,
            workItemId: input.workItemId,
            projectId: input.projectId,
            occurrenceId: input.occurrenceId,
            requestFingerprint: input.requestFingerprint,
            state: "queued",
          })
          .onConflictDoNothing({ target: schema.localAgentRun.occurrenceId })
          .returning({ id: schema.localAgentRun.id });

        if (!inserted) {
          const [existing] = await tx
            .select({
              id: schema.localAgentRun.id,
              requestFingerprint: schema.localAgentRun.requestFingerprint,
            })
            .from(schema.localAgentRun)
            .where(eq(schema.localAgentRun.occurrenceId, input.occurrenceId))
            .limit(1);
          if (!existing)
            throw new Error("Local agent run disappeared after conflict");
          if (existing.requestFingerprint !== input.requestFingerprint) {
            throw new LocalAgentError(
              "OCCURRENCE_CONFLICT",
              "Occurrence ID was already used for a different local agent run",
            );
          }
          return existing.id;
        }

        const [packet] = await tx
          .select({
            id: schema.executionPacket.id,
            packetVersion: schema.executionPacket.packetVersion,
            contentDigest: schema.executionPacket.contentDigest,
            workItemId: schema.executionPacket.workItemId,
            projectId: schema.executionPacket.projectId,
          })
          .from(schema.executionPacket)
          .where(eq(schema.executionPacket.id, input.packetId))
          .limit(1);
        if (
          !packet ||
          packet.packetVersion !== input.packetVersion ||
          packet.contentDigest !== input.packetDigest ||
          packet.workItemId !== input.workItemId ||
          packet.projectId !== input.projectId
        ) {
          throw new LocalAgentError(
            "PACKET_NOT_FOUND",
            "Prepared run does not match its immutable execution packet",
          );
        }
        const [assignment] = await tx
          .select({ id: schema.localAgentProjectAssignment.id })
          .from(schema.localAgentProjectAssignment)
          .where(
            and(
              eq(schema.localAgentProjectAssignment.agentId, input.agentId),
              eq(schema.localAgentProjectAssignment.projectId, input.projectId),
            ),
          )
          .limit(1);
        if (!assignment) {
          throw new LocalAgentError(
            "AGENT_NOT_ASSIGNED",
            "Local agent is not assigned to the packet project",
          );
        }
        if (
          !Number.isInteger(input.grantTtlSeconds) ||
          input.grantTtlSeconds < 1 ||
          input.grantTtlSeconds > 86_400 ||
          input.grantOperations.length !== 2 ||
          new Set(input.grantOperations).size !== 2 ||
          !input.grantOperations.includes("project.brief.read") ||
          !input.grantOperations.includes("work.read")
        ) {
          throw new Error("Prepared local agent grant is invalid");
        }
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + input.grantTtlSeconds * 1000,
        );
        await tx.insert(schema.localAgentRunGrant).values(
          input.grantOperations.map((operation) => ({
            id: crypto.randomUUID(),
            runId: inserted.id,
            projectId: input.projectId,
            operation,
            expiresAt,
            createdAt: now,
          })),
        );

        const jobId = await boss.send(
          LOCAL_AGENT_RUN_QUEUE,
          { version: 1, runId: inserted.id, occurrenceId: input.occurrenceId },
          { db: fromDrizzle(tx, sql) },
        );
        if (!jobId) throw new Error("Local agent run was not enqueued");
        await tx.insert(schema.auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:api",
          operation: "local_agent_run.queued",
          targetAgentRunId: inserted.id,
          details: {
            projectId: input.projectId,
            packetId: input.packetId,
            agentId: input.agentId,
            jobId,
            grantExpiresAt: expiresAt.toISOString(),
          },
        });
        return inserted.id;
      });
      const record = await repository.getById(runId);
      if (!record) throw new Error("Queued local agent run disappeared");
      return record;
    },
  };
}

/** An overnight entry, delayed worker job, and audit commit together. */
export function createOvernightQueueSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createOvernightQueueRepository(db);
  return {
    async schedule(input: CreateOvernightQueueEntryRequest, runAfter: Date) {
      const id = await db.transaction(async (tx) => {
        const [packet] = await tx
          .select({
            id: schema.executionPacket.id,
            packetVersion: schema.executionPacket.packetVersion,
            contentDigest: schema.executionPacket.contentDigest,
            projectId: schema.executionPacket.projectId,
            workItemId: schema.executionPacket.workItemId,
            status: schema.workItem.status,
          })
          .from(schema.executionPacket)
          .innerJoin(
            schema.workItem,
            eq(schema.workItem.id, schema.executionPacket.workItemId),
          )
          .where(eq(schema.executionPacket.id, input.packetId))
          .limit(1);
        if (!packet)
          throw new OvernightQueueError(
            "PACKET_NOT_FOUND",
            "Execution packet not found",
          );
        if (packet.status !== "open")
          throw new OvernightQueueError("NOT_READY", "Packet work is done");
        const [agent] = await tx
          .select({ id: schema.localAgentProfile.id })
          .from(schema.localAgentProfile)
          .where(eq(schema.localAgentProfile.id, input.agentId))
          .limit(1);
        if (!agent)
          throw new OvernightQueueError(
            "AGENT_NOT_FOUND",
            "Synthetic local agent not found",
          );
        const [assignment] = await tx
          .select({ id: schema.localAgentProjectAssignment.id })
          .from(schema.localAgentProjectAssignment)
          .where(
            and(
              eq(schema.localAgentProjectAssignment.agentId, input.agentId),
              eq(
                schema.localAgentProjectAssignment.projectId,
                packet.projectId,
              ),
            ),
          )
          .limit(1);
        if (!assignment)
          throw new OvernightQueueError(
            "NOT_READY",
            "Agent is not assigned to the packet project",
          );
        const now = new Date();
        if (runAfter.getTime() <= now.getTime())
          throw new OvernightQueueError(
            "INVALID_SCHEDULE",
            "Choose a future time",
          );
        const id = crypto.randomUUID();
        await tx.insert(schema.overnightQueueEntry).values({
          id,
          packetId: packet.id,
          packetVersion: packet.packetVersion,
          packetDigest: packet.contentDigest,
          projectId: packet.projectId,
          workItemId: packet.workItemId,
          agentId: input.agentId,
          runAfter,
          createdAt: now,
          updatedAt: now,
        });
        const jobId = await boss.send(
          OVERNIGHT_QUEUE,
          { version: 1, entryId: id },
          {
            db: fromDrizzle(tx, sql),
            startAfter: runAfter,
          },
        );
        if (!jobId) throw new Error("Overnight job was not enqueued");
        await tx.insert(schema.overnightQueueAuditEvent).values({
          id: crypto.randomUUID(),
          entryId: id,
          actor: "local-user:unattributed",
          operation: "overnight_queue.scheduled",
          details: {
            jobId,
            runAfter: runAfter.toISOString(),
            packetId: packet.id,
            agentId: input.agentId,
          },
          createdAt: now,
        });
        return id;
      });
      const entry = await repository.getById(id);
      if (!entry) throw new Error("Scheduled overnight entry disappeared");
      return entry;
    },
  };
}

/** A reviewer decision, immutable history, audit, and optional local job commit together. */
export function createSimulatedApprovalDecisionSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createSimulatedApprovalRepository(db);
  return {
    async decideOnce(input: PreparedSimulatedApprovalDecision) {
      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [state] = await tx
          .select()
          .from(schema.simulatedApprovalState)
          .where(eq(schema.simulatedApprovalState.proposalId, input.id))
          .for("update")
          .limit(1);
        if (!state) {
          throw new SimulatedApprovalError(
            "APPROVAL_NOT_FOUND",
            "Approval was not found",
          );
        }
        const [proposal] = await tx
          .select()
          .from(schema.simulatedActionProposal)
          .where(eq(schema.simulatedActionProposal.id, input.id))
          .limit(1);
        if (!proposal) throw new Error("Approval state has no proposal");
        if (proposal.descriptorDigest !== input.expectedDigest) {
          throw new SimulatedApprovalError(
            "DIGEST_MISMATCH",
            "Decision digest does not match the exact action descriptor",
          );
        }
        const [existing] = await tx
          .select()
          .from(schema.simulatedApprovalDecision)
          .where(eq(schema.simulatedApprovalDecision.proposalId, input.id))
          .limit(1);
        const targetState = {
          approve: "approved" as const,
          reject: "rejected" as const,
          cancel: "cancelled" as const,
        }[input.decision];
        if (existing) {
          if (
            existing.occurrenceId === input.occurrenceId &&
            existing.decision === targetState
          ) {
            return { id: input.id, error: null };
          }
          if (existing.occurrenceId === input.occurrenceId) {
            throw new SimulatedApprovalError(
              "OCCURRENCE_CONFLICT",
              "Decision occurrence ID was already used for another outcome",
            );
          }
          throw new SimulatedApprovalError(
            state.state === "expired"
              ? "APPROVAL_EXPIRED"
              : "APPROVAL_NOT_PENDING",
            "Approval already has a final decision",
          );
        }
        if (state.state !== "pending") {
          throw new SimulatedApprovalError(
            state.state === "expired"
              ? "APPROVAL_EXPIRED"
              : "APPROVAL_NOT_PENDING",
            "Approval is no longer pending",
          );
        }
        if (proposal.expiresAt <= now) {
          await tx
            .update(schema.simulatedApprovalState)
            .set({ state: "expired", decidedAt: now, updatedAt: now })
            .where(eq(schema.simulatedApprovalState.proposalId, input.id));
          await tx.insert(schema.simulatedApprovalDecision).values({
            id: crypto.randomUUID(),
            proposalId: input.id,
            occurrenceId: `expiry:${input.id}`,
            decision: "expired",
            expectedDigest: proposal.descriptorDigest,
            actor: "local-worker",
            createdAt: now,
          });
          await tx.insert(schema.auditEvent).values({
            id: crypto.randomUUID(),
            targetApprovalId: input.id,
            actor: "local-worker",
            operation: "simulated_approval.expired",
            details: {
              eventType: "expired",
              occurrenceId: null,
              detail:
                "Pending local simulation proposal expired without an external action.",
            },
            createdAt: now,
          });
          return {
            id: input.id,
            error: new SimulatedApprovalError(
              "APPROVAL_EXPIRED",
              "Approval request expired",
            ),
          };
        }
        if (input.decision === "approve") {
          const [link] = await tx
            .select()
            .from(schema.projectResourceLink)
            .where(eq(schema.projectResourceLink.id, proposal.linkId))
            .for("share")
            .limit(1);
          const [target] = await tx
            .select({ id: schema.resource.id })
            .from(schema.resource)
            .where(eq(schema.resource.id, proposal.resourceId))
            .limit(1);
          if (
            !link ||
            link.lifecycle !== "active" ||
            link.resourceId !== proposal.resourceId ||
            link.projectId !== proposal.projectId ||
            !target
          ) {
            throw new SimulatedApprovalError(
              "LINK_NOT_ACTIVE",
              "Target link or resource is no longer active",
            );
          }
        }
        const [decision] = await tx
          .insert(schema.simulatedApprovalDecision)
          .values({
            id: crypto.randomUUID(),
            proposalId: input.id,
            occurrenceId: input.occurrenceId,
            decision: targetState,
            expectedDigest: input.expectedDigest,
            actor: "local-reviewer:unattributed",
            createdAt: now,
          })
          .onConflictDoNothing({
            target: schema.simulatedApprovalDecision.occurrenceId,
          })
          .returning({ id: schema.simulatedApprovalDecision.id });
        if (!decision) {
          throw new SimulatedApprovalError(
            "OCCURRENCE_CONFLICT",
            "Decision occurrence ID was already used",
          );
        }
        await tx
          .update(schema.simulatedApprovalState)
          .set({ state: targetState, decidedAt: now, updatedAt: now })
          .where(eq(schema.simulatedApprovalState.proposalId, input.id));
        let jobId: string | null = null;
        if (input.decision === "approve") {
          jobId = await boss.send(
            SIMULATED_APPROVAL_QUEUE,
            {
              version: 1,
              approvalId: input.id,
              descriptorDigest: proposal.descriptorDigest,
            },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Local simulation job was not enqueued");
        }
        await tx.insert(schema.auditEvent).values({
          id: crypto.randomUUID(),
          targetApprovalId: input.id,
          actor: "local-reviewer:unattributed",
          operation: `simulated_approval.${targetState}`,
          details: {
            eventType: targetState,
            occurrenceId: input.occurrenceId,
            detail:
              input.decision === "approve"
                ? "Exact synthetic action approved for a local no-effect simulation only."
                : input.decision === "reject"
                  ? "Exact synthetic action rejected; no simulation was queued."
                  : "Exact synthetic action cancelled; no simulation was queued.",
            jobId,
          },
          createdAt: now,
        });
        return { id: input.id, error: null };
      });
      if (result.error) throw result.error;
      const approval = await repository.getById(result.id);
      if (!approval) throw new Error("Decided approval disappeared");
      return approval;
    },
  };
}
