import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createSyntheticFlowReplayService } from "@commandry/application";
import {
  decideSyntheticMonitorAlert,
  syntheticScenario,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import {
  automationDefinition,
  automationRun,
  project,
  resource,
  sourceEnvelope,
  syntheticEventImport,
} from "./schema";
import { createSyntheticEventImportRepository } from "./synthetic-event-repository";
import { createSyntheticFlowReplayRepository } from "./synthetic-flow-replay-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "historical synthetic replay joins exact source, projection, alert, and paged automation records",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const projectId = crypto.randomUUID();
      const resourceId = crypto.randomUUID();
      const importId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();
      const occurrenceId = `replay:${crypto.randomUUID()}`;
      const scenarioId = "operations.monitor-down" as const;
      const scenario = syntheticScenario(scenarioId);
      const occurredAt = "2026-09-27T10:00:00.000Z";
      await database.db.insert(project).values({
        id: projectId,
        name: "Replay test project",
      });
      await database.db.insert(resource).values({
        id: resourceId,
        kind: "service",
        name: "Replay test resource",
      });
      await database.db.insert(syntheticEventImport).values({
        id: importId,
        occurrenceId,
        requestFingerprint: occurrenceId,
        scenarioId,
        projectId,
        resourceId,
      });
      await database.db.insert(sourceEnvelope).values({
        id: envelopeId,
        importId,
        sourceKind: scenario.sourceKind,
        sourceLabel: scenario.sourceLabel,
        sourceSchemaVersion: "synthetic-fixture/v1",
        sourceEventId: occurrenceId,
        rawPayload: {
          scenarioId,
          projectId,
          resourceId,
          occurrenceId,
          occurredAt,
        },
        occurredAt: new Date(occurredAt),
      });
      const importer = createSyntheticEventImportRepository(database.db);
      const attemptId = await importer.beginAttempt(importId);
      assert.ok(attemptId);
      const completed = await importer.completeProjection(
        importId,
        attemptId,
        {
          type: scenario.eventType,
          projectId,
          resourceId,
          sourceEnvelopeId: envelopeId,
          sourceKind: scenario.sourceKind,
          sourceLabel: scenario.sourceLabel,
          severity: scenario.severity,
          summary: scenario.summary,
          occurredAt,
          processingVersion: "synthetic-projection/v1",
        },
        decideSyntheticMonitorAlert,
      );
      assert.ok(completed.eventId);
      const definitionIds = [crypto.randomUUID(), crypto.randomUUID()];
      await database.db.insert(automationDefinition).values(
        definitionIds.map((id, index) => ({
          id,
          projectId,
          name: `Replay linked routine ${index + 1}`,
          triggerType: "synthetic_event" as const,
          eventType: "monitor.down" as const,
          enabled: true,
        })),
      );
      const runIds = [crypto.randomUUID(), crypto.randomUUID()].sort();
      await database.db.insert(automationRun).values(
        runIds.map((id, index) => ({
          id,
          definitionId: definitionIds[index]!,
          projectId,
          occurrenceId: crypto.randomUUID(),
          trigger: "synthetic_event" as const,
          sourceEventId: completed.eventId!,
        })),
      );
      const service = createSyntheticFlowReplayService(
        createSyntheticFlowReplayRepository(database.db),
      );
      const first = await service.get(importId, { limit: 1 });
      assert.ok(first);
      assert.equal(first.mode, "historical_replay");
      assert.equal(first.isSynthetic, true);
      assert.equal(first.nextCursor, runIds[0]);
      for (const kind of [
        "source_received",
        "attempt_started",
        "event_projected",
        "metric_projected",
        "alert_evidence",
        "automation_queued",
      ])
        assert.ok(
          first.stages.some((stage) => stage.kind === kind),
          kind,
        );
      assert.ok(
        first.stages.some(
          (stage) =>
            stage.href === `/api/v1/source-envelopes/${envelopeId}` &&
            stage.occurredAt === occurredAt,
        ),
      );
      assert.ok(
        first.stages.every(
          (stage, index) =>
            index === 0 ||
            first.stages[index - 1]!.recordedAt <= stage.recordedAt,
        ),
      );
      const second = await service.get(importId, {
        limit: 1,
        cursor: first.nextCursor,
      });
      assert.equal(second?.nextCursor, null);
      assert.ok(
        second?.stages.some(
          (stage) => stage.id === `automation-run:${runIds[1]}`,
        ),
      );
      await assert.rejects(
        service.get(importId, { limit: 1, cursor: crypto.randomUUID() }),
        /does not belong/,
      );
      assert.equal(await service.get(crypto.randomUUID(), { limit: 1 }), null);
    } finally {
      await database.close();
    }
  },
);
