import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  decideSyntheticMonitorAlert,
  syntheticScenario,
  type SyntheticScenarioId,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createNotificationRepository } from "./notification-repository";
import { createSyntheticEventImportRepository } from "./synthetic-event-repository";
import {
  alertCondition,
  normalizedEvent,
  project,
  resource,
  sourceEnvelope,
  syntheticEventImport,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test("synthetic evidence projects replay-safe activity and one time-ordered monitor condition", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  const repository = createSyntheticEventImportRepository(database.db);
  const notifications = createNotificationRepository(database.db);
  const projectId = crypto.randomUUID();
  const otherProjectId = crypto.randomUUID();
  const resourceId = crypto.randomUUID();
  const fixture = `event-repository:${crypto.randomUUID()}`;
  try {
    await database.db.insert(project).values([
      { id: projectId, name: "Event projection project" },
      { id: otherProjectId, name: "Other event project" },
    ]);
    await database.db.insert(resource).values({
      id: resourceId,
      kind: "service",
      name: "Event projection service",
    });

    async function projectOne(
      scenarioId: SyntheticScenarioId,
      occurredAt: string,
      targetProjectId = projectId,
    ) {
      const scenario = syntheticScenario(scenarioId);
      const importId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();
      const occurrenceId = `${fixture}:${importId}`;
      await database.db.insert(syntheticEventImport).values({
        id: importId,
        occurrenceId,
        requestFingerprint: fixture,
        scenarioId,
        projectId: targetProjectId,
        resourceId: scenario.requiresResource ? resourceId : null,
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
          projectId: targetProjectId,
          resourceId: scenario.requiresResource ? resourceId : null,
          occurrenceId,
          occurredAt,
        },
        occurredAt: new Date(occurredAt),
      });
      const attemptId = await repository.beginAttempt(importId);
      assert.ok(attemptId);
      const completed = await repository.completeProjection(
        importId,
        attemptId,
        {
          type: scenario.eventType,
          projectId: targetProjectId,
          resourceId: scenario.requiresResource ? resourceId : null,
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
      assert.equal(completed.state, "succeeded");
      assert.equal(completed.isSynthetic, true);
      assert.ok(completed.eventId);
      return { importId, envelopeId, eventId: completed.eventId };
    }

    const down = await projectOne(
      "operations.monitor-down",
      "2026-09-25T10:00:00.000Z",
    );
    const alert = (await repository.listAlerts({ limit: 10, projectId }))
      .items[0];
    assert.ok(alert);
    assert.equal(alert.state, "open");
    assert.equal(alert.evidenceEventIds.length, 1);
    assert.match(alert.reason, /Synthetic monitor-down evidence/);
    const firstNotice = (
      await notifications.list({ limit: 10, view: "active", projectId })
    ).items[0];
    assert.ok(firstNotice);
    assert.equal(firstNotice.kind, "synthetic_alert");
    assert.equal(firstNotice.priority, "critical");
    assert.equal(firstNotice.isSynthetic, true);
    const acknowledged = await notifications.changeState(firstNotice.id, {
      action: "acknowledge",
      expectedVersion: 0,
    });
    assert.equal(acknowledged.state, "acknowledged");
    await assert.rejects(
      notifications.changeState(firstNotice.id, {
        action: "dismiss",
        expectedVersion: 0,
      }),
      { code: "NOTIFICATION_STALE" },
    );
    const repeat = await projectOne(
      "operations.monitor-down",
      "2026-09-25T11:00:00.000Z",
    );
    const recovered = await projectOne(
      "operations.monitor-recovered",
      "2026-09-25T12:00:00.000Z",
    );
    const stale = await projectOne(
      "operations.monitor-down",
      "2026-09-25T09:00:00.000Z",
    );
    const resolved = (await repository.listAlerts({ limit: 10, projectId }))
      .items[0];
    assert.ok(resolved);
    assert.equal(resolved.id, alert.id);
    assert.equal(resolved.state, "resolved");
    const recoveryNotice = (
      await notifications.list({ limit: 10, view: "active", projectId })
    ).items[0];
    assert.ok(recoveryNotice);
    assert.equal(recoveryNotice.priority, "informational");
    assert.notEqual(recoveryNotice.id, firstNotice.id);
    const snoozed = await notifications.changeState(recoveryNotice.id, {
      action: "snooze",
      expectedVersion: 0,
      snoozedUntil: new Date(Date.now() + 60_000).toISOString(),
    });
    assert.equal(snoozed.state, "snoozed");
    assert.equal(
      (await notifications.list({ limit: 10, view: "active", projectId })).items
        .length,
      0,
    );
    assert.equal(
      (await notifications.list({ limit: 10, view: "all", projectId })).items[0]
        ?.state,
      "snoozed",
    );
    const restored = await notifications.changeState(recoveryNotice.id, {
      action: "restore",
      expectedVersion: 1,
    });
    assert.equal(restored.state, "unread");
    assert.equal(
      (await notifications.listAudit(recoveryNotice.id, { limit: 10 })).items
        .length,
      2,
    );
    await assert.rejects(
      database.pool.query(
        "delete from notification_audit_event where notification_id = $1",
        [recoveryNotice.id],
      ),
      /Notification audit events are immutable/,
    );
    assert.equal(resolved.lastObservedAt, "2026-09-25T12:00:00.000Z");
    assert.deepEqual(
      new Set(resolved.evidenceEventIds),
      new Set([down.eventId, repeat.eventId, recovered.eventId, stale.eventId]),
    );
    assert.equal(
      (await repository.listAlerts({ limit: 10, projectId, state: "open" }))
        .items.length,
      0,
    );
    assert.equal(
      (
        await database.db
          .select()
          .from(alertCondition)
          .where(eq(alertCondition.projectId, projectId))
      ).length,
      1,
    );

    await projectOne(
      "development.pr-merged",
      "2026-09-25T13:00:00.000Z",
      otherProjectId,
    );
    const eventIds: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await repository.listEvents({
        limit: 1,
        projectId,
        ...(cursor && { cursor }),
      });
      eventIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(eventIds.length, 4);
    assert.equal(new Set(eventIds).size, 4);
    assert.equal(
      (await repository.listEvents({ limit: 10, projectId: otherProjectId }))
        .items.length,
      1,
    );
    await projectOne(
      "operations.monitor-recovered",
      "2026-09-25T12:00:00.000Z",
      otherProjectId,
    );
    await projectOne(
      "operations.monitor-down",
      "2026-09-25T09:00:00.000Z",
      otherProjectId,
    );
    assert.equal(
      (await repository.listAlerts({ limit: 10, projectId: otherProjectId }))
        .items.length,
      0,
    );
    await projectOne(
      "operations.monitor-down",
      "2026-09-25T13:00:00.000Z",
      otherProjectId,
    );
    assert.equal(
      (
        await repository.listAlerts({
          limit: 10,
          projectId: otherProjectId,
          state: "open",
        })
      ).items.length,
      1,
    );
    assert.equal(
      (await repository.getEventById(down.eventId!))?.evidenceHref,
      `/api/v1/source-envelopes/${down.envelopeId}`,
    );
    assert.equal(
      (await repository.getSourceEnvelopeById(down.envelopeId))?.sourceEventId,
      `${fixture}:${down.importId}`,
    );
    await assert.rejects(
      database.pool.query(
        "update source_envelope set raw_payload = '{}'::jsonb where id = $1",
        [down.envelopeId],
      ),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "23514",
    );
    await assert.rejects(
      database.pool.query("delete from source_envelope where id = $1", [
        down.envelopeId,
      ]),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "23514",
    );
    assert.equal(
      (
        await database.db
          .select()
          .from(normalizedEvent)
          .where(eq(normalizedEvent.importId, down.importId))
      ).length,
      1,
    );
    const [untouched] = await database.db
      .select({
        state: resource.state,
        lastObservedAt: resource.lastObservedAt,
      })
      .from(resource)
      .where(eq(resource.id, resourceId));
    assert.equal(untouched?.state, null);
    assert.equal(untouched?.lastObservedAt, null);
    await projectOne("operations.monitor-down", "2026-09-25T14:00:00.000Z");
    const reopened = (
      await notifications.list({ limit: 10, view: "active", projectId })
    ).items[0];
    assert.ok(reopened);
    assert.equal(reopened.priority, "critical");
    assert.notEqual(reopened.id, firstNotice.id);
    assert.equal(reopened.state, "unread");
    const notificationIds: string[] = [];
    let notificationCursor: string | null = null;
    do {
      const page = await notifications.list({
        limit: 1,
        view: "all",
        ...(notificationCursor ? { cursor: notificationCursor } : {}),
      });
      notificationIds.push(...page.items.map((item) => item.id));
      notificationCursor = page.nextCursor;
    } while (notificationCursor);
    assert.equal(notificationIds.length, new Set(notificationIds).size);
    assert.ok(notificationIds.includes(reopened.id));
    assert.ok(notificationIds.some((id) => id !== reopened.id));
  } finally {
    await database.close();
  }
});
