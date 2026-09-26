import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createExecutionPacketService } from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createKnowledgeRevisionRepository } from "./knowledge-revision-repository";
import { migrateDatabase } from "./migrate";
import { createRecordDetailRepository } from "./record-detail-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "filed note revisions update search and live brief while source and packets stay fixed",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const captures = createCaptureRepository(database.db);
      const revisions = createKnowledgeRevisionRepository(database.db);
      const details = createRecordDetailRepository(database.db);
      const briefs = createBriefRepository(database.db);
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Note revision integration",
      });
      const original = "  Original garden note.  ";
      const source = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: original,
      });
      const filed = await captures.fileAsNote({
        captureId: source.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Garden idea",
        content: "Check the old timer",
      });
      assert.equal(filed.record.version, 1);
      const taskSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Replace timer",
      });
      const task = await captures.fileAsTask({
        captureId: taskSource.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Replace timer",
        description: "Use saved note",
      });
      const packet = await packets.create(task.record.id, {
        selectedKnowledgeIds: [filed.record.id],
        selectedResourceIds: [],
      });
      const first = await revisions.revise(filed.record.id, {
        expectedVersion: 1,
        title: "Garden timer options",
        content: "Compare the solar timer",
      });
      assert.equal(first.version, 2);
      assert.equal(first.sourceCaptureId, source.id);
      assert.equal(
        (await details.getKnowledgeItemById(first.id))?.content,
        "Compare the solar timer",
      );
      assert.equal(
        (await captures.getCapture(source.id))?.originalContent,
        original,
      );
      await assert.rejects(
        revisions.revise(filed.record.id, {
          expectedVersion: 1,
          title: "Stale title",
          content: "Stale content",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "REVISION_CONFLICT",
      );
      const search = await captures.search({
        q: "solar",
        projectId: project.id,
        limit: 10,
      });
      assert.ok(
        search.items.some(
          (item) => item.id === filed.record.id && item.kind === "note",
        ),
      );
      const live = await briefs.readProjectSnapshot(project.id, { limit: 10 });
      assert.equal(
        live?.knowledge.items.find((item) => item.id === first.id)?.content,
        "Compare the solar timer",
      );
      const beforeDigest = (await packets.getById(packet.id))?.contentDigest;
      assert.equal(beforeDigest, packet.contentDigest);
      const second = await revisions.revise(first.id, {
        expectedVersion: first.version,
        title: "Garden timer comparison",
        content: "Compare two options",
      });
      assert.equal(second.version, 3);
      assert.equal(
        (await packets.getById(packet.id))?.contentDigest,
        beforeDigest,
      );
      const history = await revisions.listRevisions(first.id, { limit: 1 });
      assert.equal(history.items[0]?.version, 3);
      assert.ok(history.nextCursor);
      const earlier = await revisions.listRevisions(first.id, {
        limit: 1,
        cursor: history.nextCursor,
      });
      assert.equal(earlier.items[0]?.version, 2);
      assert.equal(earlier.items[0]?.previousTitle, "Garden idea");
      assert.equal(earlier.items[0]?.previousContent, "Check the old timer");
      await assert.rejects(
        database.pool.query(
          "delete from knowledge_item_revision where id = $1",
          [earlier.items[0]!.id],
        ),
      );
    } finally {
      await database.pool.end();
    }
  },
);
