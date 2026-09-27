import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabase } from "./client";
import { createLocalAgentRoutingRepository } from "./local-agent-routing-repository";
import {
  capture,
  executionPacket,
  localAgentProfile,
  localAgentProjectAssignment,
  localAgentRun,
  project,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "packet routing pages assigned agents and retrieves only exact-digest successful saved output",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    const repository = createLocalAgentRoutingRepository(db);
    const projectId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const packetId = crypto.randomUUID();
    const assignedIds = Array.from({ length: 3 }, () => crypto.randomUUID());
    const outsiderId = crypto.randomUUID();
    const digest = "a".repeat(64);
    const completedAt = new Date("2026-09-26T10:00:00.000Z");
    try {
      await db.insert(project).values({ id: projectId, name: "Routing test" });
      await db.insert(capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Original packet task",
        state: "filed",
        projectId,
        filedRecordKind: "task",
        filedRecordId: workItemId,
        filedAt: completedAt,
      });
      await db.insert(workItem).values({
        id: workItemId,
        projectId,
        sourceCaptureId: captureId,
        title: "Review saved context",
        description: "Inspect this packet without external actions",
      });
      await db.insert(executionPacket).values({
        id: packetId,
        workItemId,
        projectId,
        sourceCaptureId: captureId,
        packetVersion: 1,
        schemaVersion: "execution-packet/v1",
        snapshot: {},
        contentDigest: digest,
        generatedAt: completedAt,
      });
      await db.insert(localAgentProfile).values(
        [...assignedIds, outsiderId].map((id, index) => ({
          id,
          name: `Routing agent ${index}`,
        })),
      );
      await db.insert(localAgentProjectAssignment).values(
        assignedIds.map((agentId) => ({
          id: crypto.randomUUID(),
          agentId,
          projectId,
        })),
      );
      const savedResult = {
        summary: "Saved synthetic context review",
        contextReadIds: [crypto.randomUUID()],
        evidence: [
          {
            kind: "work_item",
            id: workItemId,
            href: `/api/v1/work-items/${workItemId}`,
            recordedAt: completedAt.toISOString(),
            occurredAt: null,
            sourceLabel: "Original local capture",
            isSynthetic: false,
          },
        ],
        runtime: "local-fake-v1",
        isSynthetic: true,
        verificationStatus: "unverified",
        externalActions: [],
      };
      const runRows = [
        { agentId: assignedIds[0]!, state: "queued" as const },
        {
          agentId: assignedIds[0]!,
          state: "succeeded" as const,
          result: savedResult,
          completedAt,
        },
        {
          agentId: assignedIds[0]!,
          state: "succeeded" as const,
          packetDigest: "b".repeat(64),
          result: savedResult,
          completedAt: new Date("2026-09-26T11:00:00.000Z"),
        },
        {
          agentId: outsiderId,
          state: "succeeded" as const,
          result: savedResult,
          completedAt,
        },
      ].map((input) => {
        const id = crypto.randomUUID();
        return {
          ...input,
          id,
          packetId,
          packetVersion: 1,
          packetDigest: input.packetDigest ?? digest,
          workItemId,
          projectId,
          occurrenceId: `routing:${id}`,
          requestFingerprint: id.replaceAll("-", "").repeat(2),
        };
      });
      await db.insert(localAgentRun).values(runRows);
      const seen = new Map<string, number>();
      let cursor: string | undefined;
      do {
        const page = await repository.listAssignedCandidates(projectId, {
          limit: 1,
          cursor,
        });
        for (const item of page.items)
          seen.set(item.agent.id, item.activeRunCount);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seen.size, 3);
      assert.equal(seen.has(outsiderId), false);
      assert.equal(seen.get(assignedIds[0]!), 1);
      const saved = await repository.getLatestSucceededResult({
        packetId,
        packetDigest: digest,
        agentId: assignedIds[0]!,
      });
      assert.equal(
        saved?.result && (saved.result as { summary: string }).summary,
        savedResult.summary,
      );
      assert.equal(saved?.completedAt, completedAt.toISOString());
      assert.equal(
        await repository.getLatestSucceededResult({
          packetId,
          packetDigest: "c".repeat(64),
          agentId: assignedIds[0]!,
        }),
        null,
      );
    } finally {
      await database.close();
    }
  },
);
