import { and, asc, eq, gt } from "drizzle-orm";
import { SyntheticFlowReplayError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  alertEvidence,
  automationRun,
  metricSample,
  normalizedEvent,
  sourceEnvelope,
  syntheticEventImport,
  syntheticEventImportAttempt,
} from "./schema";

export function createSyntheticFlowReplayRepository(db: CommandryDatabase) {
  return {
    async read(
      importId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [source] = await db
        .select({ receipt: syntheticEventImport, envelope: sourceEnvelope })
        .from(syntheticEventImport)
        .innerJoin(
          sourceEnvelope,
          eq(sourceEnvelope.importId, syntheticEventImport.id),
        )
        .where(eq(syntheticEventImport.id, importId))
        .limit(1);
      if (!source) return null;
      const [event] = await db
        .select()
        .from(normalizedEvent)
        .where(eq(normalizedEvent.importId, importId))
        .limit(1);
      if (query.cursor) {
        const [anchor] = await db
          .select({ id: automationRun.id })
          .from(automationRun)
          .where(
            and(
              eq(automationRun.id, query.cursor),
              event ? eq(automationRun.sourceEventId, event.id) : undefined,
            ),
          )
          .limit(1);
        if (!event || !anchor)
          throw new SyntheticFlowReplayError(
            "REPLAY_CURSOR_INVALID",
            "Replay cursor does not belong to this import",
          );
      }
      const attempts = await db
        .select()
        .from(syntheticEventImportAttempt)
        .where(eq(syntheticEventImportAttempt.importId, importId))
        .orderBy(
          asc(syntheticEventImportAttempt.startedAt),
          asc(syntheticEventImportAttempt.id),
        );
      const [metric] = event
        ? await db
            .select()
            .from(metricSample)
            .where(eq(metricSample.eventId, event.id))
            .limit(1)
        : [];
      const alerts = event
        ? await db
            .select()
            .from(alertEvidence)
            .where(eq(alertEvidence.eventId, event.id))
            .orderBy(asc(alertEvidence.createdAt), asc(alertEvidence.id))
        : [];
      const runs = event
        ? await db
            .select()
            .from(automationRun)
            .where(
              and(
                eq(automationRun.sourceEventId, event.id),
                query.cursor ? gt(automationRun.id, query.cursor) : undefined,
              ),
            )
            .orderBy(asc(automationRun.id))
            .limit(query.limit + 1)
        : [];
      const visibleRuns = runs.slice(0, query.limit);
      return {
        import: {
          id: source.receipt.id,
          projectId: source.receipt.projectId,
          scenarioId: source.receipt.scenarioId,
          state: source.receipt.state,
          error: source.receipt.error,
          createdAt: source.receipt.createdAt.toISOString(),
          completedAt: source.receipt.completedAt?.toISOString() ?? null,
        },
        envelope: {
          id: source.envelope.id,
          sourceLabel: source.envelope.sourceLabel as
            "Synthetic development fixture" | "Synthetic operational fixture",
          occurredAt: source.envelope.occurredAt.toISOString(),
          receivedAt: source.envelope.receivedAt.toISOString(),
        },
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          state: attempt.state,
          startedAt: attempt.startedAt.toISOString(),
          completedAt: attempt.completedAt?.toISOString() ?? null,
        })),
        event: event
          ? {
              id: event.id,
              type: event.type,
              summary: event.summary,
              occurredAt: event.occurredAt.toISOString(),
              ingestedAt: event.ingestedAt.toISOString(),
            }
          : null,
        metric: metric
          ? {
              id: metric.id,
              name: metric.name,
              value: metric.value,
              unit: metric.unit,
              sampledAt: metric.sampledAt.toISOString(),
              recordedAt: metric.recordedAt.toISOString(),
            }
          : null,
        alertEvidence: alerts.map((evidence) => ({
          id: evidence.id,
          alertId: evidence.alertId,
          recordedAt: evidence.createdAt.toISOString(),
        })),
        automationRuns: visibleRuns.map((run) => ({
          id: run.id,
          definitionId: run.definitionId,
          state: run.state,
          createdAt: run.createdAt.toISOString(),
        })),
        nextCursor:
          runs.length > query.limit ? (visibleRuns.at(-1)?.id ?? null) : null,
      };
    },
  };
}
