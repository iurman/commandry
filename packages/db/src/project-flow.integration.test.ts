import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { createProjectFlowService } from "@commandry/application";
import { createDatabase } from "./client";
import { createProjectFlowRepository } from "./project-flow-repository";
import {
  automationDefinition,
  automationRun,
  capture,
  executionPacket,
  localAgentProfile,
  localAgentRun,
  normalizedEvent,
  project,
  projectResourceLink,
  resource,
  sourceEnvelope,
  syntheticEventImport,
  system,
  systemProjectLink,
  systemResourceLink,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "project flow pages real relationships and labeled synthetic worker records without cross-project leakage",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    const service = createProjectFlowService(createProjectFlowRepository(db));
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const systemId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();
    const systemProjectLinkId = crypto.randomUUID();
    const systemResourceLinkId = crypto.randomUUID();
    const projectResourceLinkId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const packetId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const definitionId = crypto.randomUUID();
    const importId = crypto.randomUUID();
    const envelopeId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    try {
      await db.insert(project).values([
        { id: projectId, name: "Flow project" },
        { id: otherProjectId, name: "Other flow project" },
      ]);
      await db.insert(system).values({ id: systemId, name: "Flow system" });
      await db.insert(resource).values({
        id: resourceId,
        name: "Flow resource",
        kind: "service",
      });
      await db.insert(systemProjectLink).values({
        id: systemProjectLinkId,
        systemId,
        projectId,
        createdAt: sql`'2099-01-01T00:00:00.123456Z'::timestamptz`,
      });
      await db.insert(systemResourceLink).values({
        id: systemResourceLinkId,
        systemId,
        resourceId,
        createdAt: sql`'2099-01-01T00:00:00.123123Z'::timestamptz`,
      });
      await db.insert(projectResourceLink).values([
        {
          id: projectResourceLinkId,
          projectId,
          resourceId,
          type: "supports",
          sourceKind: "resource",
          targetKind: "project",
          createdAt: sql`'2099-01-01T00:00:00.123001Z'::timestamptz`,
        },
        {
          id: crypto.randomUUID(),
          projectId: otherProjectId,
          resourceId,
          type: "relates_to",
          sourceKind: "project",
          targetKind: "resource",
        },
      ]);
      await db.insert(automationDefinition).values({
        id: definitionId,
        projectId,
        name: "Flow summary",
      });
      await db.insert(automationRun).values({
        id: crypto.randomUUID(),
        definitionId,
        projectId,
        occurrenceId: crypto.randomUUID(),
        trigger: "manual",
      });
      await db.insert(capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Original flow work",
        state: "filed",
        projectId,
        filedRecordKind: "task",
        filedRecordId: workItemId,
        filedAt: new Date(),
      });
      await db.insert(workItem).values({
        id: workItemId,
        projectId,
        sourceCaptureId: captureId,
        title: "Flow work",
        description: "Review local flow",
      });
      await db.insert(executionPacket).values({
        id: packetId,
        workItemId,
        projectId,
        sourceCaptureId: captureId,
        packetVersion: 1,
        schemaVersion: "execution-packet/v1",
        snapshot: {},
        contentDigest: "a".repeat(64),
        generatedAt: new Date(),
      });
      await db.insert(localAgentProfile).values({
        id: agentId,
        name: "Flow fake reader",
      });
      await db.insert(localAgentRun).values({
        id: crypto.randomUUID(),
        agentId,
        packetId,
        packetVersion: 1,
        packetDigest: "a".repeat(64),
        workItemId,
        projectId,
        occurrenceId: crypto.randomUUID(),
        requestFingerprint: "b".repeat(64),
      });
      await db.insert(syntheticEventImport).values({
        id: importId,
        occurrenceId: crypto.randomUUID(),
        requestFingerprint: "c".repeat(64),
        scenarioId: "operations.monitor-down",
        projectId,
        resourceId,
        state: "succeeded",
        completedAt: new Date(),
      });
      await db.insert(sourceEnvelope).values({
        id: envelopeId,
        importId,
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        sourceSchemaVersion: "synthetic-fixture/v1",
        sourceEventId: `flow:${envelopeId}`,
        rawPayload: { scenarioId: "operations.monitor-down" },
        occurredAt: new Date(),
      });
      await db.insert(normalizedEvent).values({
        id: eventId,
        importId,
        sourceEnvelopeId: envelopeId,
        type: "monitor.down",
        projectId,
        resourceId,
        severity: "critical",
        summary: "Synthetic monitor down",
        occurredAt: new Date(),
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        processingVersion: "synthetic-projection/v1",
      });
      await db.insert(automationRun).values({
        id: crypto.randomUUID(),
        definitionId,
        projectId,
        occurrenceId: crypto.randomUUID(),
        trigger: "synthetic_event",
        sourceEventId: eventId,
      });
      const kinds = new Set<string>();
      const ids = new Set<string>();
      const automationSources = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await service.list(projectId, {
          limit: 2,
          ...(cursor ? { cursor } : {}),
        });
        assert.equal(page.mode, "historical-local-snapshot");
        for (const item of page.items) {
          assert.equal(ids.has(item.id), false);
          ids.add(item.id);
          kinds.add(item.kind);
          if (item.kind === "automation_run")
            automationSources.add(`${item.isSynthetic}:${item.sourceLabel}`);
          assert.ok(item.sourceHref.startsWith("/api/v1/"));
          assert.ok(
            item.related.every((entry) => entry.href.startsWith("/api/v1/")),
          );
        }
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(
        kinds,
        new Set([
          "system_link",
          "resource_link",
          "system_resource_link",
          "synthetic_event",
          "local_agent_run",
          "automation_run",
        ]),
      );
      assert.equal(ids.size, 7);
      assert.deepEqual(
        automationSources,
        new Set([
          "false:Local automation run",
          "true:Synthetic-triggered local automation run",
        ]),
      );
      const other = await service.list(otherProjectId, { limit: 20 });
      assert.deepEqual(
        other.items.map((item) => item.kind),
        ["resource_link"],
      );
    } finally {
      await database.close();
    }
  },
);
