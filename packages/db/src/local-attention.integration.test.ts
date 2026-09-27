import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createLocalAttentionService,
  createResourceTopologyService,
} from "@commandry/application";
import { createDatabase } from "./client";
import { createLocalAttentionRepository } from "./local-attention-repository";
import { createResourceTopologyRepository } from "./resource-topology-repository";
import { migrateDatabase } from "./migrate";
import {
  integrationInstance,
  metricSample,
  normalizedEvent,
  project,
  projectResourceLink,
  resource,
  resourceDependency,
  sourceEnvelope,
  syntheticEventImport,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("local attention reconciles evidence, preferences, resolution, and paged history", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 3 });
  const projectId = crypto.randomUUID();
  const resourceId = crypto.randomUUID();
  const dependentId = crypto.randomUUID();
  const staleIntegrationId = crypto.randomUUID();
  const metricIntegrationId = crypto.randomUUID();
  const service = createLocalAttentionService(
    createLocalAttentionRepository(database.db),
  );
  const original = await service.getSettings();
  try {
    await database.db.insert(project).values({
      id: projectId,
      name: "Local attention evidence",
    });
    await database.db.insert(resource).values({
      id: resourceId,
      kind: "service",
      name: "Synthetic availability target",
    });
    await database.db.insert(resource).values({
      id: dependentId,
      kind: "service",
      name: "Synthetic dependent service",
    });
    await database.db.insert(resourceDependency).values({
      id: crypto.randomUUID(),
      requiredResourceId: resourceId,
      dependentResourceId: dependentId,
    });
    await database.db.insert(projectResourceLink).values({
      id: crypto.randomUUID(),
      projectId,
      resourceId: dependentId,
      type: "supports",
      sourceKind: "resource",
      targetKind: "project",
    });
    await database.db.insert(integrationInstance).values([
      {
        id: staleIntegrationId,
        name: "Synthetic stale development feed",
        kind: "synthetic-development",
        projectId,
        freshnessWindowMinutes: 60,
      },
      {
        id: metricIntegrationId,
        name: "Synthetic availability feed",
        kind: "synthetic-operations",
        projectId,
        resourceId,
        freshnessWindowMinutes: 60,
      },
    ]);
    async function observation(
      kind: "development" | "operations",
      integrationId: string,
      at: Date,
      value?: number,
    ) {
      const importId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();
      const sourceKind =
        kind === "development"
          ? ("synthetic-development" as const)
          : ("synthetic-operations" as const);
      const scenarioId =
        kind === "development"
          ? ("development.pr-merged" as const)
          : value === 100
            ? ("operations.monitor-recovered" as const)
            : ("operations.monitor-down" as const);
      await database.db.insert(syntheticEventImport).values({
        id: importId,
        occurrenceId: `attention:${importId}`,
        requestFingerprint: "a".repeat(64),
        scenarioId,
        projectId,
        integrationInstanceId: integrationId,
        resourceId: kind === "operations" ? resourceId : null,
        state: "succeeded",
        completedAt: new Date(),
      });
      await database.db.insert(sourceEnvelope).values({
        id: envelopeId,
        importId,
        sourceKind,
        sourceLabel: `Synthetic ${kind} fixture`,
        sourceSchemaVersion: "synthetic-fixture/v1",
        sourceEventId: `attention:${envelopeId}`,
        rawPayload: { scenarioId },
        occurredAt: at,
      });
      if (kind === "operations" && value !== undefined) {
        const eventId = crypto.randomUUID();
        await database.db.insert(normalizedEvent).values({
          id: eventId,
          importId,
          sourceEnvelopeId: envelopeId,
          type: value === 100 ? "monitor.recovered" : "monitor.down",
          projectId,
          resourceId,
          severity: value === 100 ? "info" : "critical",
          summary: "Synthetic availability sample",
          occurredAt: at,
          sourceKind,
          sourceLabel: "Synthetic operational fixture",
          processingVersion: "synthetic-projection/v1",
        });
        const metricId = crypto.randomUUID();
        await database.db.insert(metricSample).values({
          id: metricId,
          eventId,
          sourceEnvelopeId: envelopeId,
          projectId,
          resourceId,
          name: "external_availability",
          unit: "percent",
          value,
          sampledAt: at,
          sourceKind,
          sourceLabel: "Synthetic operational fixture",
          isSynthetic: true,
        });
        return metricId;
      }
      return envelopeId;
    }

    const asOf = new Date();
    const staleEvidence = await observation(
      "development",
      staleIntegrationId,
      new Date(asOf.getTime() - 2 * 60 * 60_000),
    );
    const earlierMetric = await observation(
      "operations",
      metricIntegrationId,
      new Date(asOf.getTime() - 10 * 60_000),
      100,
    );
    const latestMetric = await observation(
      "operations",
      metricIntegrationId,
      new Date(asOf.getTime() - 5 * 60_000),
      50,
    );
    const configured = await service.updateSettings({
      expectedVersion: original.version,
      staleSourceEnabled: true,
      metricDropEnabled: true,
      metricDropPoints: 25,
    });
    const firstEvaluation = await service.evaluate(asOf);
    assert.ok(firstEvaluation.activated >= 2);
    const first = await service.listSignals({
      view: "active",
      projectId,
      limit: 1,
    });
    assert.equal(first.items.length, 1);
    assert.ok(first.nextCursor);
    const second = await service.listSignals({
      view: "active",
      projectId,
      limit: 1,
      cursor: first.nextCursor,
    });
    const signals = [...first.items, ...second.items];
    assert.equal(signals.length, 2);
    assert.equal(new Set(signals.map((signal) => signal.id)).size, 2);
    assert.ok(
      signals.some(
        (signal) =>
          signal.ruleId === "source_stale" &&
          signal.evidenceHref.endsWith(staleEvidence),
      ),
    );
    assert.ok(
      signals.some(
        (signal) =>
          signal.ruleId === "metric_drop" &&
          signal.evidenceHref.endsWith(latestMetric) &&
          signal.previousEvidenceHref?.endsWith(earlierMetric),
      ),
    );
    assert.ok(signals.every((signal) => signal.realHealth === "unknown"));
    const resourceSignals = await service.listSignals({
      view: "active",
      resourceId,
      limit: 10,
    });
    assert.deepEqual(
      resourceSignals.items.map((signal) => signal.ruleId),
      ["metric_drop"],
    );
    const impact = await createResourceTopologyService(
      createResourceTopologyRepository(database.db),
    ).listImpact(resourceId, { limit: 10 });
    assert.equal(impact.items[0]?.resource.id, dependentId);
    assert.equal(impact.items[0]?.projects[0]?.id, projectId);
    assert.equal(impact.latestSyntheticDrop?.previousValue, 100);
    assert.equal(impact.latestSyntheticDrop?.latestValue, 50);
    assert.equal(
      impact.latestSyntheticDrop?.evidenceHref,
      `/api/v1/metrics/${latestMetric}`,
    );
    assert.equal(impact.realHealth, "unknown");
    const metricSignal = signals.find(
      (signal) => signal.ruleId === "metric_drop",
    )!;
    const snoozed = await service.reviewSignal(metricSignal.id, {
      expectedEvidenceId: latestMetric,
      expectedReviewEventId: null,
      quality: "noisy",
      disposition: "snoozed",
      snoozedUntil: new Date(asOf.getTime() + 60 * 60_000).toISOString(),
      note: "Expected local synthetic replay",
    });
    assert.equal(snoozed.review?.quality, "noisy");
    assert.equal(snoozed.review?.effectiveDisposition, "snoozed");
    assert.equal(
      (await service.listSignals({ view: "active", resourceId, limit: 10 }))
        .items.length,
      0,
    );
    assert.equal(
      (await service.listSignals({ view: "all", resourceId, limit: 10 }))
        .items[0]?.review?.note,
      "Expected local synthetic replay",
    );
    await assert.rejects(
      service.reviewSignal(metricSignal.id, {
        expectedEvidenceId: latestMetric,
        expectedReviewEventId: null,
        quality: "useful",
        disposition: "visible",
        snoozedUntil: null,
        note: null,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "SIGNAL_REVIEW_STALE",
    );
    const restored = await service.reviewSignal(metricSignal.id, {
      expectedEvidenceId: latestMetric,
      expectedReviewEventId: snoozed.review!.eventId,
      quality: "noisy",
      disposition: "visible",
      snoozedUntil: null,
      note: "Expected local synthetic replay",
    });
    assert.equal(restored.review?.effectiveDisposition, "visible");
    assert.equal(
      (await service.listSignals({ view: "active", resourceId, limit: 10 }))
        .items.length,
      1,
    );
    const dismissed = await service.reviewSignal(metricSignal.id, {
      expectedEvidenceId: latestMetric,
      expectedReviewEventId: restored.review!.eventId,
      quality: "noisy",
      disposition: "dismissed",
      snoozedUntil: null,
      note: "Suppress this synthetic sample only",
    });
    assert.equal(dismissed.review?.effectiveDisposition, "dismissed");
    assert.equal(
      (await service.listSignals({ view: "active", resourceId, limit: 10 }))
        .items.length,
      0,
    );
    const replacementMetric = await observation(
      "operations",
      metricIntegrationId,
      new Date(asOf.getTime() + 60_000),
      0,
    );
    await service.evaluate(new Date(asOf.getTime() + 60_000));
    const refreshed = (
      await service.listSignals({ view: "active", resourceId, limit: 10 })
    ).items[0];
    assert.equal(refreshed?.evidenceId, replacementMetric);
    assert.equal(refreshed?.review, null);
    await assert.rejects(
      service.reviewSignal(metricSignal.id, {
        expectedEvidenceId: latestMetric,
        expectedReviewEventId: dismissed.review!.eventId,
        quality: null,
        disposition: "visible",
        snoozedUntil: null,
        note: null,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "SIGNAL_REVIEW_STALE",
    );
    const useful = await service.reviewSignal(metricSignal.id, {
      expectedEvidenceId: replacementMetric,
      expectedReviewEventId: null,
      quality: "useful",
      disposition: "visible",
      snoozedUntil: null,
      note: "New evidence deserves review",
    });
    assert.equal(useful.review?.quality, "useful");
    await assert.rejects(
      service.updateSettings({
        expectedVersion: original.version,
        staleSourceEnabled: false,
        metricDropEnabled: false,
        metricDropPoints: 25,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "SETTINGS_STALE",
    );
    await service.updateSettings({
      expectedVersion: configured.version,
      staleSourceEnabled: true,
      metricDropEnabled: false,
      metricDropPoints: 25,
    });
    await service.evaluate(asOf);
    assert.deepEqual(
      (
        await service.listSignals({ view: "active", projectId, limit: 10 })
      ).items.map((signal) => signal.ruleId),
      ["source_stale"],
    );
    await observation("development", staleIntegrationId, asOf);
    await service.evaluate(asOf);
    assert.equal(
      (await service.listSignals({ view: "active", projectId, limit: 10 }))
        .items.length,
      0,
    );
    const history = await service.listSignals({
      view: "all",
      projectId,
      limit: 10,
    });
    assert.deepEqual(
      new Set(history.items.map((signal) => signal.state)),
      new Set(["resolved"]),
    );
    const audit = await service.listAudit({ limit: 100 });
    assert.ok(
      audit.items.some(
        (item) => item.operation === "local_attention.rules_changed",
      ),
    );
    assert.ok(
      audit.items.some((item) => item.operation === "local_attention.resolved"),
    );
    assert.ok(
      audit.items.some(
        (item) =>
          item.operation === "local_attention.reviewed" &&
          item.details.evidenceId === latestMetric &&
          item.details.disposition === "dismissed",
      ),
    );
  } finally {
    const latest = await service.getSettings();
    await service.updateSettings({
      expectedVersion: latest.version,
      staleSourceEnabled: original.staleSourceEnabled,
      metricDropEnabled: original.metricDropEnabled,
      metricDropPoints: original.metricDropPoints,
    });
    await database.close();
  }
});
