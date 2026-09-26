import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createMorningDigestService } from "@commandry/application";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createMorningDigestRepository } from "./morning-digest-repository";
import {
  automationDefinition,
  automationRun,
  capture,
  executionPacket,
  localAgentProfile,
  localAgentRun,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "morning digest pages automation and agent outcomes across a bounded UTC window",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Morning digest project",
      });
      const other = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Other morning project",
      });
      const definitionId = crypto.randomUUID();
      await database.db.insert(automationDefinition).values({
        id: definitionId,
        projectId: project.id,
        name: "Synthetic project summary",
        enabled: true,
      });
      const otherDefinitionId = crypto.randomUUID();
      await database.db.insert(automationDefinition).values({
        id: otherDefinitionId,
        projectId: other.id,
        name: "Other synthetic summary",
        enabled: true,
      });
      const source = crypto.randomUUID();
      const taskId = crypto.randomUUID();
      const packetId = crypto.randomUUID();
      const agentId = crypto.randomUUID();
      await database.db.insert(capture).values({
        id: source,
        inputType: "text",
        originalContent: "Original morning digest test source",
        state: "filed",
        projectId: project.id,
        filedRecordKind: "task",
        filedRecordId: taskId,
        filedAt: new Date("2026-09-25T10:00:00Z"),
      });
      await database.db.insert(workItem).values({
        id: taskId,
        projectId: project.id,
        sourceCaptureId: source,
        title: "Review local morning outcome",
        description: "Use exact saved packet evidence",
      });
      await database.db.insert(executionPacket).values({
        id: packetId,
        workItemId: taskId,
        projectId: project.id,
        sourceCaptureId: source,
        packetVersion: 1,
        schemaVersion: "execution-packet/v1",
        snapshot: {},
        contentDigest: "a".repeat(64),
        generatedAt: new Date("2026-09-25T11:00:00Z"),
      });
      await database.db.insert(localAgentProfile).values({
        id: agentId,
        name: "Synthetic local reviewer",
      });
      const evidence = {
        kind: "project",
        id: project.id,
        href: `/api/v1/projects/${project.id}`,
        recordedAt: "2026-09-26T05:00:00.000Z",
        occurredAt: null,
        sourceLabel: "Local project",
        isSynthetic: false,
      };
      const successId = crypto.randomUUID();
      const failedId = crypto.randomUUID();
      const skippedId = crypto.randomUUID();
      const otherId = crypto.randomUUID();
      await database.db.insert(automationRun).values([
        {
          id: successId,
          definitionId,
          projectId: project.id,
          occurrenceId: crypto.randomUUID(),
          trigger: "manual",
          state: "succeeded",
          result: {
            summary: "Synthetic project summary completed for review.",
            asOf: "2026-09-26T06:00:00.000Z",
            evidence: [evidence],
            sourceLabel: "Synthetic local automation",
            isSynthetic: true,
            verificationStatus: "unverified",
            externalActions: [],
          },
          completedAt: new Date("2026-09-26T06:00:00Z"),
        },
        {
          id: failedId,
          definitionId,
          projectId: project.id,
          occurrenceId: crypto.randomUUID(),
          trigger: "manual",
          state: "failed",
          error: "Local project summary attempt failed",
          completedAt: new Date("2026-09-26T05:30:00Z"),
        },
        {
          id: skippedId,
          definitionId,
          projectId: project.id,
          occurrenceId: crypto.randomUUID(),
          trigger: "manual",
          state: "skipped",
          error: "Disabled before execution",
          completedAt: new Date("2026-09-26T05:00:00Z"),
        },
        {
          id: otherId,
          definitionId: otherDefinitionId,
          projectId: other.id,
          occurrenceId: crypto.randomUUID(),
          trigger: "manual",
          state: "succeeded",
          completedAt: new Date("2026-09-26T06:30:00Z"),
        },
      ]);
      const agentRunId = crypto.randomUUID();
      await database.db.insert(localAgentRun).values({
        id: agentRunId,
        agentId,
        packetId,
        packetVersion: 1,
        packetDigest: "a".repeat(64),
        workItemId: taskId,
        projectId: project.id,
        occurrenceId: `morning-digest:${crypto.randomUUID()}`,
        requestFingerprint: "b".repeat(64),
        state: "succeeded",
        result: {
          summary: "Fake local agent review completed.",
          contextReadIds: [],
          evidence: [evidence],
          runtime: "local-fake-v1",
          isSynthetic: true,
          verificationStatus: "unverified",
          externalActions: [],
        },
        completedAt: new Date("2026-09-26T06:00:00Z"),
      });

      const service = createMorningDigestService(
        createMorningDigestRepository(database.db),
      );
      const query = {
        from: "2026-09-26T05:00:00.000Z",
        to: "2026-09-26T07:00:00.000Z",
        projectId: project.id,
        limit: 1,
      };
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await service.list({ ...query, cursor });
        assert.ok(page.items.length <= 1);
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.deepEqual(ids, [successId, agentRunId, failedId, skippedId]);
      const all = await service.list({ ...query, limit: 10 });
      assert.deepEqual(
        all.items.map((item) => item.outcome),
        ["awaiting_review", "awaiting_review", "failed", "skipped"],
      );
      assert.equal(all.items[0]?.sourceEvidenceHref, evidence.href);
      assert.equal(
        all.items[1]?.sourceEvidenceHref,
        `/api/v1/execution-packets/${packetId}`,
      );
      assert.equal(all.items[1]?.href, `/agent-runs/${agentRunId}`);
      assert.ok(all.items.every((item) => item.isSynthetic));
      assert.ok(
        all.items.every((item) => item.verificationStatus === "unverified"),
      );
      assert.equal(
        (
          await service.list({
            ...query,
            from: "2026-09-26T05:00:01Z",
            limit: 10,
          })
        ).items.some((item) => item.id === skippedId),
        false,
      );
      assert.equal(
        (await service.list({ ...query, projectId: other.id, limit: 10 }))
          .items[0]?.id,
        otherId,
      );
      await assert.rejects(
        service.list({ ...query, to: query.from, limit: 10 }),
        /window/,
      );
      await assert.rejects(
        service.list({ ...query, cursor: "bad", limit: 10 }),
        /cursor/,
      );
    } finally {
      await database.close();
    }
  },
);
