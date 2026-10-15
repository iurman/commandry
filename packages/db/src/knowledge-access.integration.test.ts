import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createKnowledgeAccessService } from "@commandry/application";
import { KnowledgeAccessError, knowledgeTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { createKnowledgeAccessRepository } from "./knowledge-access-repository";
import {
  capture,
  knowledgeItem,
  knowledgeClient,
  knowledgeClientAudit,
  project,
  knowledgeProjectLink,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "knowledge clients enforce scope, continuation, expiry, revocation and digest-only persistence",
  { timeout: 30000 },
  async () => {
    // A single connection also proves reads do not borrow a nested pool connection.
    const database = createDatabase({ connectionString, max: 1 });
    const db = database.db;
    const repository = createKnowledgeAccessRepository(db);
    const service = createKnowledgeAccessService(repository);
    const projectId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    const captureIds: string[] = [];
    const itemIds: string[] = [];
    let clientId: string | undefined;
    try {
      await db.insert(project).values([
        { id: projectId, name: "Granted project" },
        { id: otherId, name: "Other private project" },
      ]);
      for (let i = 0; i < 4; i++) {
        const cap = crypto.randomUUID();
        const id = crypto.randomUUID();
        captureIds.push(cap);
        itemIds.push(id);
        const owner = i === 3 ? otherId : projectId;
        await db.insert(capture).values({
          id: cap,
          inputType: "text",
          originalContent: "Preserved source",
          source: "manual-local",
          author: "local-user",
          projectId: owner,
        });
        await db.insert(knowledgeItem).values({
          id,
          projectId: owner,
          sourceCaptureId: cap,
          kind: "instruction",
          title: `Working conventions ${i}`,
          content:
            i === 3
              ? "Private other project"
              : "Use local tools. ".repeat(1500),
        });
      }
      await db.insert(knowledgeProjectLink).values({
        id: crypto.randomUUID(),
        knowledgeItemId: itemIds[3]!,
        projectId,
        lifecycle: "active",
      });
      const issued = await service.create(
        { name: "Kronos local agent", projectId, ttlSeconds: 3600 },
        "user:owner",
      );
      clientId = issued.client.id;
      const [stored] = await db
        .select()
        .from(knowledgeClient)
        .where(eq(knowledgeClient.id, clientId));
      assert.equal(stored!.tokenDigest, knowledgeTokenDigest(issued.token));
      assert.equal(JSON.stringify(stored).includes(issued.token), false);
      assert.equal(
        JSON.stringify(await service.list({ limit: 1 })).includes(issued.token),
        false,
      );
      assert.deepEqual(
        (await service.listProjects(issued.token)).items.map((p) => p.id),
        [projectId],
      );
      assert.equal(
        (await service.getBrief(issued.token)).brief.project.id,
        projectId,
      );
      await Promise.all([
        service.getBrief(issued.token),
        service.listProjects(issued.token),
        service.search(issued.token, { q: "", limit: 25 }),
      ]);
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await service.search(issued.token, {
          q: "conventions",
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        for (const item of page.items) {
          assert.equal(seen.has(item.id), false);
          seen.add(item.id);
          assert.equal(item.projectId, projectId);
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seen.size, 3);
      assert.equal(
        (await service.search(issued.token, { q: "%", limit: 25 })).items
          .length,
        0,
      );
      assert.equal(
        (await service.search(issued.token, { q: "Private other", limit: 25 }))
          .items.length,
        0,
      );
      const first = await service.getKnowledge(issued.token, {
        id: itemIds[0]!,
        offset: 0,
        limit: 80,
      });
      assert.equal(first.content.length, 80);
      assert.equal(first.nextOffset, 80);
      const second = await service.getKnowledge(issued.token, {
        id: itemIds[0]!,
        offset: 80,
        limit: 80,
      });
      assert.equal(second.sourceCaptureId, captureIds[0]);
      assert.equal(second.version, first.version);
      await assert.rejects(
        service.getKnowledge(issued.token, {
          id: itemIds[3]!,
          offset: 0,
          limit: 80,
        }),
        (e) => e instanceof KnowledgeAccessError && e.code === "NOT_FOUND",
      );
      await assert.rejects(
        service.authenticate(`ck_${"x".repeat(43)}`),
        (e) => e instanceof KnowledgeAccessError && e.code === "TOKEN_INVALID",
      );
      const future = createKnowledgeAccessService(
        repository,
        () => new Date(Date.now() + 8 * 86400000),
      );
      await assert.rejects(
        future.listProjects(issued.token),
        (e) => e instanceof KnowledgeAccessError && e.code === "CLIENT_EXPIRED",
      );
      const revoked = await service.revoke(clientId, "user:owner");
      assert.equal(
        (await service.revoke(clientId, "user:owner")).revokedAt,
        revoked.revokedAt,
      );
      await assert.rejects(
        service.search(issued.token, { q: "", limit: 25 }),
        (e) => e instanceof KnowledgeAccessError && e.code === "CLIENT_REVOKED",
      );
      const audit = await db
        .select()
        .from(knowledgeClientAudit)
        .where(eq(knowledgeClientAudit.clientId, clientId));
      assert.ok(
        audit.some(
          (e) => e.code === "CLIENT_EXPIRED" && e.decision === "denied",
        ),
      );
      assert.ok(
        audit.some(
          (e) => e.code === "CLIENT_REVOKED" && e.decision === "denied",
        ),
      );
      assert.ok(
        audit.some((e) => e.code === "NOT_FOUND" && e.decision === "denied"),
      );
      assert.equal(
        audit.filter((e) => e.operation === "knowledge_client.revoked").length,
        1,
      );
      assert.equal(JSON.stringify(audit).includes(issued.token), false);
      await assert.rejects(
        db
          .update(knowledgeClient)
          .set({ projectId: otherId })
          .where(eq(knowledgeClient.id, clientId)),
        (error) =>
          error instanceof Error &&
          error.cause instanceof Error &&
          /Knowledge client grant scope is immutable/.test(error.cause.message),
      );
      await assert.rejects(
        db
          .delete(knowledgeClientAudit)
          .where(eq(knowledgeClientAudit.clientId, clientId)),
        (error) =>
          error instanceof Error &&
          error.cause instanceof Error &&
          /Knowledge client audit is immutable/.test(error.cause.message),
      );
    } finally {
      // History is immutable; the harness removes the whole disposable database.
      await database.close();
    }
  },
);
