import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { createProjectAgentFindingsService } from "@commandry/application";
import { createDatabase } from "./client";
import { createProjectAgentFindingsRepository } from "./project-agent-findings-repository";
import {
  capture,
  executionPacket,
  localAgentProfile,
  localAgentRun,
  project,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "project agent findings page exact saved fake results across microsecond timestamps",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    const service = createProjectAgentFindingsService(
      createProjectAgentFindingsRepository(db),
    );
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const packetId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const olderRunId = crypto.randomUUID();
    const newerRunId = crypto.randomUUID();
    try {
      await db.insert(project).values([
        { id: projectId, name: "Finding project" },
        { id: otherProjectId, name: "Other finding project" },
      ]);
      await db.insert(capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Review the local finding",
      });
      await db.insert(workItem).values({
        id: workItemId,
        projectId,
        sourceCaptureId: captureId,
        title: "Finding task",
        description: "Read one source",
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
        name: "Finding fake reader",
      });
      const savedResult = {
        summary: "A saved local fake finding.",
        contextReadIds: [workItemId],
        evidence: [
          {
            kind: "work_item",
            id: workItemId,
            href: `/api/v1/work-items/${workItemId}`,
            recordedAt: "2026-09-27T10:00:00.000Z",
            occurredAt: null,
            sourceLabel: "Original local task",
            isSynthetic: false,
          },
        ],
        runtime: "local-fake-v1",
        isSynthetic: true,
        verificationStatus: "unverified",
        externalActions: [],
      };
      await db.insert(localAgentRun).values([
        {
          id: olderRunId,
          agentId,
          packetId,
          packetVersion: 1,
          packetDigest: "a".repeat(64),
          workItemId,
          projectId,
          occurrenceId: crypto.randomUUID(),
          requestFingerprint: "b".repeat(64),
          state: "succeeded",
          result: savedResult,
          completedAt: sql`'2026-09-27T10:00:00.123123Z'::timestamptz`,
        },
        {
          id: newerRunId,
          agentId,
          packetId,
          packetVersion: 1,
          packetDigest: "a".repeat(64),
          workItemId,
          projectId,
          occurrenceId: crypto.randomUUID(),
          requestFingerprint: "c".repeat(64),
          state: "succeeded",
          result: savedResult,
          completedAt: sql`'2026-09-27T10:00:00.123456Z'::timestamptz`,
        },
      ]);
      const first = await service.list(projectId, { limit: 1 });
      assert.equal(first.items[0]?.runId, newerRunId);
      assert.equal(first.items[0]?.evidence[0]?.id, workItemId);
      assert.equal(first.items[0]?.packetDigest, "a".repeat(64));
      assert.equal(first.nextCursor, newerRunId);
      const second = await service.list(projectId, {
        limit: 1,
        cursor: first.nextCursor!,
      });
      assert.equal(second.items[0]?.runId, olderRunId);
      assert.equal(second.nextCursor, null);
      assert.deepEqual(
        (await service.list(otherProjectId, { limit: 10 })).items,
        [],
      );
      await assert.rejects(
        service.list(otherProjectId, { limit: 10, cursor: newerRunId }),
        { code: "INVALID_CURSOR" },
      );
    } finally {
      await database.close();
    }
  },
);
