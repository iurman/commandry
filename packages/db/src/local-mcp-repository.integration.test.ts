import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { LocalMcpError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createLocalMcpRepository } from "./local-mcp-repository";
import {
  capture,
  executionPacket,
  localAgentProfile,
  localAgentProjectAssignment,
  localMcpAuditEvent,
  localMcpSession,
  project,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "local MCP session creation rechecks packet and assignment, persists only token digest, and pages immutable audit",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    const repository = createLocalMcpRepository(db);
    const projectId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const packetId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    const packetDigest = "a".repeat(64);
    const tokenDigest = "b".repeat(64);
    const input = {
      packetId,
      packetVersion: 1,
      packetDigest,
      projectId,
      workItemId,
      agentId,
      tokenDigest,
      ttlSeconds: 1800,
    };
    try {
      await db
        .insert(project)
        .values({ id: projectId, name: "MCP test project" });
      await db.insert(capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Original packet task",
        source: "manual-local",
        author: "local-user",
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
        title: "MCP scope work",
        description: "Local only",
      });
      await db.insert(executionPacket).values({
        id: packetId,
        workItemId,
        projectId,
        sourceCaptureId: captureId,
        packetVersion: 1,
        schemaVersion: "execution-packet/v1",
        snapshot: { task: { id: workItemId } },
        contentDigest: packetDigest,
        generatedAt: new Date(),
      });
      await db.insert(localAgentProfile).values({
        id: agentId,
        name: "Synthetic MCP agent",
      });
      await assert.rejects(
        repository.create(input),
        (error: unknown) =>
          error instanceof LocalMcpError && error.code === "AGENT_NOT_ASSIGNED",
      );
      await db.insert(localAgentProjectAssignment).values({
        id: crypto.randomUUID(),
        agentId,
        projectId,
      });
      await assert.rejects(
        repository.create({ ...input, packetDigest: "c".repeat(64) }),
        (error: unknown) =>
          error instanceof LocalMcpError && error.code === "PACKET_NOT_FOUND",
      );
      const created = await repository.create(input);
      assert.equal(created.packetId, packetId);
      assert.deepEqual(created.operations, ["project.brief.read", "work.read"]);
      assert.ok(Date.parse(created.expiresAt) > Date.parse(created.createdAt));
      const [stored] = await db
        .select()
        .from(localMcpSession)
        .where(eq(localMcpSession.id, created.id));
      assert.equal(stored?.tokenDigest, tokenDigest);
      assert.equal(JSON.stringify(created).includes(tokenDigest), false);
      assert.equal(
        (await repository.getByTokenDigest(tokenDigest))?.id,
        created.id,
      );
      assert.equal(
        (await repository.list({ limit: 1, packetId })).items[0]?.id,
        created.id,
      );
      assert.deepEqual(
        await repository.list({ limit: 1, packetId: crypto.randomUUID() }),
        {
          items: [],
          nextCursor: null,
        },
      );

      await repository.recordAudit({
        sessionId: created.id,
        operation: "work.read",
        decision: "allowed",
        code: "CONTEXT_READ_ALLOWED",
        reason: "Caller reason withheld",
      });
      await repository.recordAudit({
        sessionId: created.id,
        operation: "project.brief.read",
        decision: "denied",
        code: "PROJECT_SCOPE_DENIED",
        reason: "Caller reason withheld",
      });
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await repository.listAudit(created.id, {
          limit: 1,
          cursor,
        });
        for (const item of page.items) {
          assert.equal(seen.has(item.id), false);
          seen.add(item.id);
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seen.size, 3);
      assert.equal(
        (
          await db
            .select()
            .from(localMcpAuditEvent)
            .where(eq(localMcpAuditEvent.sessionId, created.id))
        ).length,
        3,
      );
      const revoked = await repository.revoke(created.id);
      assert.ok(revoked.revokedAt);
      assert.equal(
        (await repository.revoke(created.id)).revokedAt,
        revoked.revokedAt,
      );
      assert.equal(
        (await repository.listAudit(created.id, { limit: 10 })).items.length,
        4,
      );
      await assert.rejects(
        repository.revoke(crypto.randomUUID()),
        (error: unknown) =>
          error instanceof LocalMcpError && error.code === "SESSION_NOT_FOUND",
      );
    } finally {
      await database.close();
    }
  },
);
