import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createExecutionPacketService,
  createProjectBriefService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createKnowledgeProjectRepository } from "./knowledge-project-repository";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "one original Knowledge record informs another project with exact, auditable relationship evidence",
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
      const contexts = createKnowledgeProjectRepository(database.db);
      const briefs = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const home = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Original garden project",
      });
      const receiving = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Receiving garden project",
      });
      const unrelated = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Unrelated project",
      });
      const originalText = "Original shared garden access note";
      const source = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: originalText,
      });
      const note = await captures.fileAsNote({
        captureId: source.id,
        recordId: crypto.randomUUID(),
        projectId: home.id,
        title: "Shared garden access",
        content: "West gate is open for deliveries",
      });
      const taskSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Review receiving garden access",
      });
      const task = await captures.fileAsTask({
        captureId: taskSource.id,
        recordId: crypto.randomUUID(),
        projectId: receiving.id,
        title: "Review receiving garden access",
        description: "Use the shared note",
      });

      await assert.rejects(contexts.link(note.record.id, home.id), {
        code: "KNOWLEDGE_PROJECT_IS_PRIMARY",
      });
      await assert.rejects(
        packets.create(task.record.id, {
          selectedKnowledgeIds: [note.record.id],
          selectedResourceIds: [],
        }),
        { code: "KNOWLEDGE_NOT_IN_PROJECT" },
      );
      const connected = await contexts.link(note.record.id, receiving.id);
      assert.equal(connected.link.sourceKind, "knowledge_item");
      assert.equal(connected.link.targetKind, "project");
      assert.equal(connected.link.type, "relates_to");
      assert.equal(
        (await contexts.link(note.record.id, receiving.id)).link.id,
        connected.link.id,
      );
      assert.equal(
        (await contexts.listLinks(note.record.id, { limit: 1 })).items[0]?.link
          .id,
        connected.link.id,
      );
      const receivingList = await captures.listProjectKnowledge(receiving.id, {
        limit: 10,
      });
      assert.equal(receivingList.items[0]?.id, note.record.id);
      assert.equal(receivingList.items[0]?.projectId, home.id);
      assert.equal(receivingList.items[0]?.contextLink?.id, connected.link.id);
      assert.equal(
        (await captures.listKnowledge({ limit: 10, projectId: receiving.id }))
          .items[0]?.contextLink?.projectId,
        receiving.id,
      );
      assert.equal(
        (await captures.listProjectKnowledge(unrelated.id, { limit: 10 })).items
          .length,
        0,
      );
      const scopedSearch = await captures.search({
        q: "West gate",
        projectId: receiving.id,
        limit: 10,
      });
      assert.ok(scopedSearch.items.some((item) => item.id === note.record.id));
      assert.ok(
        !(
          await captures.search({
            q: "West gate",
            projectId: unrelated.id,
            limit: 10,
          })
        ).items.some((item) => item.id === note.record.id),
      );
      const brief = await briefs.getBrief(receiving.id);
      const fact = brief?.sections.knowledge.items.find(
        (item) => item.id === note.record.id,
      );
      assert.ok(
        fact?.evidence.some(
          (item) =>
            item.kind === "knowledge_project_link" &&
            item.id === connected.link.id &&
            item.href ===
              `/api/v1/knowledge-project-links/${connected.link.id}`,
        ),
      );
      const packet = await packets.create(task.record.id, {
        selectedKnowledgeIds: [note.record.id],
        selectedResourceIds: [],
      });
      assert.equal(
        packet.snapshot.selectedKnowledge[0]?.contextEvidence?.id,
        connected.link.id,
      );

      const archived = await contexts.archiveLink(connected.link.id);
      assert.equal(archived.lifecycle, "archived");
      assert.equal(
        (await contexts.getLink(archived.id))?.lifecycle,
        "archived",
      );
      assert.equal(
        (await contexts.listLinks(note.record.id, { limit: 10 })).items.length,
        0,
      );
      assert.equal(
        (await captures.listProjectKnowledge(receiving.id, { limit: 10 })).items
          .length,
        0,
      );
      assert.equal(
        (await briefs.getBrief(receiving.id))?.sections.knowledge.items.length,
        0,
      );
      assert.equal(
        (await packets.getById(packet.id))?.snapshot.selectedKnowledge[0]
          ?.contextEvidence?.id,
        connected.link.id,
      );
      await assert.rejects(
        packets.create(task.record.id, {
          selectedKnowledgeIds: [note.record.id],
          selectedResourceIds: [],
        }),
        { code: "KNOWLEDGE_NOT_IN_PROJECT" },
      );
      const firstAudit = await contexts.listAudit(note.record.id, { limit: 1 });
      assert.equal(
        firstAudit.items[0]?.operation,
        "knowledge.project_unlinked",
      );
      assert.ok(firstAudit.nextCursor);
      const secondAudit = await contexts.listAudit(note.record.id, {
        limit: 1,
        cursor: firstAudit.nextCursor,
      });
      assert.equal(secondAudit.items[0]?.operation, "knowledge.project_linked");
      assert.equal(secondAudit.items[0]?.linkId, connected.link.id);
      assert.equal(
        (await captures.getCapture(source.id))?.originalContent,
        originalText,
      );
      await assert.rejects(
        database.pool.query(
          "delete from knowledge_project_link where id = $1",
          [connected.link.id],
        ),
        /cannot be deleted/,
      );
      await assert.rejects(
        database.pool.query(
          "update knowledge_project_audit_event set operation = 'knowledge.project_linked' where id = $1",
          [firstAudit.items[0]!.id],
        ),
        /immutable/,
      );
    } finally {
      await database.close();
    }
  },
);
