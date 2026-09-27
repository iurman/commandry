import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import {
  decideSyntheticMonitorAlert,
  SYNTHETIC_MONITOR_RULE_ID,
  syntheticMonitorReason,
  syntheticAvailabilitySample,
  type SyntheticEventType,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  alertCondition,
  alertEvidence,
  auditEvent,
  normalizedEvent,
  metricSample,
  project,
  projectResourceLink,
  resource,
  sourceEnvelope,
  syntheticEventImport,
  syntheticEventImportAttempt,
} from "./schema";

type EventPageQuery = {
  limit: number;
  cursor?: string | undefined;
  projectId?: string | undefined;
  resourceId?: string | undefined;
};

type SourceLabel =
  "Synthetic development fixture" | "Synthetic operational fixture";

function metricRecord(
  sample: typeof metricSample.$inferSelect,
  resourceName: string,
) {
  return {
    id: sample.id,
    eventId: sample.eventId,
    projectId: sample.projectId,
    resourceId: sample.resourceId,
    resourceName,
    name: "external_availability" as const,
    unit: "percent" as const,
    value: sample.value,
    sampledAt: sample.sampledAt.toISOString(),
    recordedAt: sample.recordedAt.toISOString(),
    sourceEnvelopeId: sample.sourceEnvelopeId,
    evidenceHref: `/api/v1/source-envelopes/${sample.sourceEnvelopeId}`,
    sourceLabel: "Synthetic operational fixture" as const,
    isSynthetic: true as const,
  };
}

function envelopeRecord(row: typeof sourceEnvelope.$inferSelect) {
  return {
    id: row.id,
    importId: row.importId,
    sourceKind: row.sourceKind,
    sourceLabel: row.sourceLabel as SourceLabel,
    sourceSchemaVersion: row.sourceSchemaVersion as "synthetic-fixture/v1",
    sourceEventId: row.sourceEventId,
    rawPayload: row.rawPayload,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    isSynthetic: true as const,
  };
}

function importRecord(
  run: typeof syntheticEventImport.$inferSelect,
  envelope: typeof sourceEnvelope.$inferSelect,
  event: typeof normalizedEvent.$inferSelect | null,
) {
  return {
    id: run.id,
    occurrenceId: run.occurrenceId,
    scenarioId: run.scenarioId,
    projectId: run.projectId,
    integrationInstanceId: run.integrationInstanceId,
    resourceId: run.resourceId,
    sourceKind: envelope.sourceKind,
    sourceLabel: envelope.sourceLabel as SourceLabel,
    isSynthetic: true as const,
    state: run.state,
    attempts: run.attempts,
    error: run.error,
    sourceEnvelopeId: envelope.id,
    eventId: event?.id ?? null,
    occurredAt: envelope.occurredAt.toISOString(),
    receivedAt: envelope.receivedAt.toISOString(),
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function eventRecord(
  row: typeof normalizedEvent.$inferSelect,
  alertId: string | null,
) {
  return {
    id: row.id,
    type: row.type,
    summary: row.summary,
    severity: row.severity,
    projectId: row.projectId,
    resourceId: row.resourceId,
    occurredAt: row.occurredAt.toISOString(),
    ingestedAt: row.ingestedAt.toISOString(),
    sourceEnvelopeId: row.sourceEnvelopeId,
    sourceKind: row.sourceKind,
    sourceLabel: row.sourceLabel as SourceLabel,
    isSynthetic: true as const,
    processingVersion: row.processingVersion as "synthetic-projection/v1",
    alertId,
    evidenceHref: `/api/v1/source-envelopes/${row.sourceEnvelopeId}`,
  };
}

export function createSyntheticEventImportRepository(db: CommandryDatabase) {
  async function getById(id: string) {
    const [row] = await db
      .select({
        run: syntheticEventImport,
        envelope: sourceEnvelope,
        event: normalizedEvent,
      })
      .from(syntheticEventImport)
      .innerJoin(
        sourceEnvelope,
        eq(sourceEnvelope.importId, syntheticEventImport.id),
      )
      .leftJoin(
        normalizedEvent,
        eq(normalizedEvent.importId, syntheticEventImport.id),
      )
      .where(eq(syntheticEventImport.id, id))
      .limit(1);
    return row ? importRecord(row.run, row.envelope, row.event) : null;
  }

  async function alertRecord(row: typeof alertCondition.$inferSelect) {
    const evidence = await db
      .select({ eventId: alertEvidence.eventId })
      .from(alertEvidence)
      .where(eq(alertEvidence.alertId, row.id))
      .orderBy(alertEvidence.createdAt, alertEvidence.eventId);
    return {
      id: row.id,
      state: row.state,
      severity: "critical" as const,
      ruleId: SYNTHETIC_MONITOR_RULE_ID,
      reason: row.reason,
      projectId: row.projectId,
      resourceId: row.resourceId,
      firstObservedAt: row.firstObservedAt.toISOString(),
      lastObservedAt: row.lastObservedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      lastEventId: row.lastEventId,
      evidenceEventIds: evidence.map((item) => item.eventId),
      sourceKind: "synthetic-operations" as const,
      sourceLabel: "Synthetic operational fixture" as const,
      isSynthetic: true as const,
    };
  }

  return {
    getById,
    async list(input: { limit: number; cursor?: string | undefined }) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: syntheticEventImport.createdAt })
            .from(syntheticEventImport)
            .where(eq(syntheticEventImport.id, input.cursor))
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({
          run: syntheticEventImport,
          envelope: sourceEnvelope,
          event: normalizedEvent,
        })
        .from(syntheticEventImport)
        .innerJoin(
          sourceEnvelope,
          eq(sourceEnvelope.importId, syntheticEventImport.id),
        )
        .leftJoin(
          normalizedEvent,
          eq(normalizedEvent.importId, syntheticEventImport.id),
        )
        .where(
          anchor
            ? sql`(${syntheticEventImport.createdAt}, ${syntheticEventImport.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
            : undefined,
        )
        .orderBy(
          desc(syntheticEventImport.createdAt),
          desc(syntheticEventImport.id),
        )
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map((row) =>
          importRecord(row.run, row.envelope, row.event),
        ),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.run.id ?? null) : null,
      };
    },
    async projectExists(projectId: string) {
      const rows = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      return rows.length === 1;
    },
    async resourceExists(resourceId: string) {
      const rows = await db
        .select({ id: resource.id })
        .from(resource)
        .where(eq(resource.id, resourceId))
        .limit(1);
      return rows.length === 1;
    },
    async resourceLinkedToProject(resourceId: string, projectId: string) {
      const rows = await db
        .select({ id: projectResourceLink.id })
        .from(projectResourceLink)
        .where(
          and(
            eq(projectResourceLink.projectId, projectId),
            eq(projectResourceLink.resourceId, resourceId),
            eq(projectResourceLink.lifecycle, "active"),
          ),
        )
        .limit(1);
      return rows.length === 1;
    },
    async getSourceEnvelope(importId: string) {
      const [row] = await db
        .select()
        .from(sourceEnvelope)
        .where(eq(sourceEnvelope.importId, importId))
        .limit(1);
      return row ? envelopeRecord(row) : null;
    },
    async getSourceEnvelopeById(id: string) {
      const [row] = await db
        .select()
        .from(sourceEnvelope)
        .where(eq(sourceEnvelope.id, id))
        .limit(1);
      return row ? envelopeRecord(row) : null;
    },
    async beginAttempt(id: string) {
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(syntheticEventImport)
          .where(eq(syntheticEventImport.id, id))
          .for("update");
        if (!run) throw new Error("Synthetic event import not found");
        if (run.state === "succeeded") return null;
        const attemptId = crypto.randomUUID();
        await tx
          .update(syntheticEventImport)
          .set({
            state: "running",
            attempts: sql`${syntheticEventImport.attempts} + 1`,
            startedAt: new Date(),
            error: null,
          })
          .where(eq(syntheticEventImport.id, id));
        await tx.insert(syntheticEventImportAttempt).values({
          id: attemptId,
          importId: id,
          state: "running",
        });
        return attemptId;
      });
    },
    async completeProjection(
      importId: string,
      attemptId: string,
      projection: {
        type: SyntheticEventType;
        projectId: string;
        resourceId: string | null;
        sourceEnvelopeId: string;
        sourceKind: "synthetic-development" | "synthetic-operations";
        sourceLabel:
          "Synthetic development fixture" | "Synthetic operational fixture";
        severity: "info" | "critical";
        summary: string;
        occurredAt: string;
        processingVersion: "synthetic-projection/v1";
      },
      decideAlert: typeof decideSyntheticMonitorAlert,
    ) {
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(syntheticEventImport)
          .where(eq(syntheticEventImport.id, importId))
          .for("update");
        if (!run) throw new Error("Synthetic event import not found");
        if (run.state === "succeeded") {
          await tx
            .update(syntheticEventImportAttempt)
            .set({ state: "succeeded", completedAt: new Date(), error: null })
            .where(eq(syntheticEventImportAttempt.id, attemptId));
          return;
        }
        if (
          run.projectId !== projection.projectId ||
          run.resourceId !== projection.resourceId
        ) {
          throw new Error("Projection target does not match import");
        }
        const [envelope] = await tx
          .select()
          .from(sourceEnvelope)
          .where(eq(sourceEnvelope.importId, importId))
          .limit(1);
        if (!envelope || envelope.id !== projection.sourceEnvelopeId) {
          throw new Error("Projection source does not match envelope");
        }

        const [inserted] = await tx
          .insert(normalizedEvent)
          .values({
            id: crypto.randomUUID(),
            importId,
            sourceEnvelopeId: envelope.id,
            type: projection.type,
            projectId: run.projectId,
            resourceId: run.resourceId,
            severity: projection.severity,
            summary: projection.summary,
            occurredAt: new Date(projection.occurredAt),
            sourceKind: projection.sourceKind,
            sourceLabel: projection.sourceLabel,
            processingVersion: projection.processingVersion,
            isSynthetic: true,
          })
          .onConflictDoNothing({ target: normalizedEvent.importId })
          .returning();
        const event =
          inserted ??
          (
            await tx
              .select()
              .from(normalizedEvent)
              .where(eq(normalizedEvent.importId, importId))
              .limit(1)
          )[0];
        if (!event) throw new Error("Normalized event could not be stored");

        const syntheticMetric = syntheticAvailabilitySample(projection.type);
        if (inserted && projection.resourceId && syntheticMetric) {
          await tx
            .insert(metricSample)
            .values({
              id: crypto.randomUUID(),
              eventId: event.id,
              sourceEnvelopeId: envelope.id,
              projectId: run.projectId,
              resourceId: projection.resourceId,
              name: syntheticMetric.name,
              unit: syntheticMetric.unit,
              value: syntheticMetric.value,
              sampledAt: event.occurredAt,
              sourceKind: "synthetic-operations",
              sourceLabel: syntheticMetric.source,
              isSynthetic: true,
            })
            .onConflictDoNothing({ target: metricSample.eventId });
        }

        if (
          inserted &&
          projection.resourceId &&
          projection.type !== "git.pull_request.merged"
        ) {
          const conditionKey = `${SYNTHETIC_MONITOR_RULE_ID}:${run.projectId}:${projection.resourceId}`;
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${conditionKey}))`,
          );
          const [current] = await tx
            .select()
            .from(alertCondition)
            .where(
              and(
                eq(alertCondition.ruleId, SYNTHETIC_MONITOR_RULE_ID),
                eq(alertCondition.projectId, run.projectId),
                eq(alertCondition.resourceId, projection.resourceId),
              ),
            )
            .for("update")
            .limit(1);
          const [newerObservedEvent] = current
            ? []
            : await tx
                .select({ id: normalizedEvent.id })
                .from(normalizedEvent)
                .where(
                  and(
                    eq(normalizedEvent.projectId, run.projectId),
                    eq(normalizedEvent.resourceId, projection.resourceId),
                    inArray(normalizedEvent.type, [
                      "monitor.down",
                      "monitor.recovered",
                    ]),
                    gte(normalizedEvent.occurredAt, event.occurredAt),
                    ne(normalizedEvent.id, event.id),
                  ),
                )
                .limit(1);
          const decision = newerObservedEvent
            ? "ignore"
            : decideAlert(
                current
                  ? {
                      state: current.state,
                      lastObservedAt: current.lastObservedAt.toISOString(),
                    }
                  : null,
                { type: projection.type, occurredAt: projection.occurredAt },
              );
          let linkedAlertId = current?.id ?? null;
          if (decision === "open" && !current) {
            linkedAlertId = crypto.randomUUID();
            await tx.insert(alertCondition).values({
              id: linkedAlertId,
              ruleId: SYNTHETIC_MONITOR_RULE_ID,
              projectId: run.projectId,
              resourceId: projection.resourceId,
              state: "open",
              severity: "critical",
              reason: syntheticMonitorReason("open"),
              firstObservedAt: event.occurredAt,
              lastObservedAt: event.occurredAt,
              resolvedAt: null,
              lastEventId: event.id,
              sourceKind: "synthetic-operations",
              sourceLabel: "Synthetic operational fixture",
              isSynthetic: true,
            });
          } else if (
            current &&
            (decision === "open" || decision === "refresh")
          ) {
            await tx
              .update(alertCondition)
              .set({
                state: "open",
                cycle:
                  decision === "open" && current.state === "resolved"
                    ? current.cycle + 1
                    : current.cycle,
                reason: syntheticMonitorReason("open"),
                lastObservedAt: event.occurredAt,
                lastEventId: event.id,
                resolvedAt: null,
                updatedAt: new Date(),
              })
              .where(eq(alertCondition.id, current.id));
          } else if (current && decision === "resolve") {
            await tx
              .update(alertCondition)
              .set({
                state: "resolved",
                reason: syntheticMonitorReason("resolved"),
                lastObservedAt: event.occurredAt,
                lastEventId: event.id,
                resolvedAt: event.occurredAt,
                updatedAt: new Date(),
              })
              .where(eq(alertCondition.id, current.id));
          }
          if (linkedAlertId) {
            await tx
              .insert(alertEvidence)
              .values({
                id: crypto.randomUUID(),
                alertId: linkedAlertId,
                eventId: event.id,
              })
              .onConflictDoNothing({
                target: [alertEvidence.alertId, alertEvidence.eventId],
              });
          }
        }

        await tx
          .update(syntheticEventImportAttempt)
          .set({ state: "succeeded", completedAt: new Date(), error: null })
          .where(eq(syntheticEventImportAttempt.id, attemptId));
        await tx
          .update(syntheticEventImport)
          .set({ state: "succeeded", error: null, completedAt: new Date() })
          .where(eq(syntheticEventImport.id, importId));
        if (inserted) {
          await tx.insert(auditEvent).values({
            id: crypto.randomUUID(),
            actor: "system:synthetic-event-worker",
            operation: "synthetic_event_import.succeeded",
            targetImportId: importId,
            details: { eventId: event.id },
          });
        }
      });
      const completed = await getById(importId);
      if (!completed) throw new Error("Completed import disappeared");
      return completed;
    },
    async failAttempt(importId: string, attemptId: string) {
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(syntheticEventImport)
          .where(eq(syntheticEventImport.id, importId))
          .for("update");
        if (!run) throw new Error("Synthetic event import not found");
        await tx
          .update(syntheticEventImportAttempt)
          .set({
            state: "failed",
            error: "Synthetic projection attempt failed",
            completedAt: new Date(),
          })
          .where(eq(syntheticEventImportAttempt.id, attemptId));
        if (run.state !== "succeeded") {
          await tx
            .update(syntheticEventImport)
            .set({
              state: "failed",
              error: "Synthetic projection attempt failed",
            })
            .where(eq(syntheticEventImport.id, importId));
        }
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:synthetic-event-worker",
          operation: "synthetic_event_import.attempt_failed",
          targetImportId: importId,
          details: { attemptId },
        });
      });
    },
    async getEventById(id: string) {
      const [row] = await db
        .select({ event: normalizedEvent, evidence: alertEvidence })
        .from(normalizedEvent)
        .leftJoin(alertEvidence, eq(alertEvidence.eventId, normalizedEvent.id))
        .where(eq(normalizedEvent.id, id))
        .limit(1);
      return row ? eventRecord(row.event, row.evidence?.alertId ?? null) : null;
    },
    async listEvents(input: EventPageQuery) {
      const [anchor] = input.cursor
        ? await db
            .select({ occurredAt: normalizedEvent.occurredAt })
            .from(normalizedEvent)
            .where(eq(normalizedEvent.id, input.cursor))
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({ event: normalizedEvent, evidence: alertEvidence })
        .from(normalizedEvent)
        .leftJoin(alertEvidence, eq(alertEvidence.eventId, normalizedEvent.id))
        .where(
          and(
            input.projectId
              ? eq(normalizedEvent.projectId, input.projectId)
              : undefined,
            input.resourceId
              ? eq(normalizedEvent.resourceId, input.resourceId)
              : undefined,
            anchor
              ? sql`(${normalizedEvent.occurredAt}, ${normalizedEvent.id}) < (${anchor.occurredAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(normalizedEvent.occurredAt), desc(normalizedEvent.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map((row) =>
          eventRecord(row.event, row.evidence?.alertId ?? null),
        ),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.event.id ?? null) : null,
      };
    },
    async listMetrics(input: EventPageQuery) {
      const [anchor] = input.cursor
        ? await db
            .select({ sampledAt: metricSample.sampledAt })
            .from(metricSample)
            .where(eq(metricSample.id, input.cursor))
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({ sample: metricSample, resourceName: resource.name })
        .from(metricSample)
        .innerJoin(resource, eq(resource.id, metricSample.resourceId))
        .where(
          and(
            eq(metricSample.sourceKind, "synthetic-operations"),
            eq(metricSample.sourceLabel, "Synthetic operational fixture"),
            eq(metricSample.isSynthetic, true),
            eq(metricSample.name, "external_availability"),
            eq(metricSample.unit, "percent"),
            input.projectId
              ? eq(metricSample.projectId, input.projectId)
              : undefined,
            input.resourceId
              ? eq(metricSample.resourceId, input.resourceId)
              : undefined,
            anchor
              ? sql`(${metricSample.sampledAt}, ${metricSample.id}) < (${anchor.sampledAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(metricSample.sampledAt), desc(metricSample.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ sample, resourceName }) =>
          metricRecord(sample, resourceName),
        ),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.sample.id ?? null) : null,
      };
    },
    async getMetricSampleById(id: string) {
      const [row] = await db
        .select({ sample: metricSample, resourceName: resource.name })
        .from(metricSample)
        .innerJoin(resource, eq(resource.id, metricSample.resourceId))
        .where(eq(metricSample.id, id))
        .limit(1);
      return row ? metricRecord(row.sample, row.resourceName) : null;
    },
    async getAlertById(id: string) {
      const [row] = await db
        .select()
        .from(alertCondition)
        .where(eq(alertCondition.id, id))
        .limit(1);
      return row ? alertRecord(row) : null;
    },
    async listAlerts(
      input: EventPageQuery & { state?: "open" | "resolved" | undefined },
    ) {
      const [anchor] = input.cursor
        ? await db
            .select({ updatedAt: alertCondition.updatedAt })
            .from(alertCondition)
            .where(eq(alertCondition.id, input.cursor))
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(alertCondition)
        .where(
          and(
            input.projectId
              ? eq(alertCondition.projectId, input.projectId)
              : undefined,
            input.resourceId
              ? eq(alertCondition.resourceId, input.resourceId)
              : undefined,
            input.state ? eq(alertCondition.state, input.state) : undefined,
            anchor
              ? sql`(${alertCondition.updatedAt}, ${alertCondition.id}) < (${anchor.updatedAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(alertCondition.updatedAt), desc(alertCondition.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: await Promise.all(page.map(alertRecord)),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
