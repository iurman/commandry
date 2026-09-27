import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createCaptureService,
  createExecutionPacketService,
  createFileCaptureService,
  createProjectBriefService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createFileCaptureRepository } from "./file-capture-repository";
import { migrateDatabase } from "./migrate";
import { auditEvent, workItemAttachment } from "./schema";
import { createWorkAttachmentRepository } from "./work-attachment-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "task document attachments enforce scope and keep audited inverse, brief, and packet history",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const captures = createCaptureService(
        createCaptureRepository(database.db),
      );
      const files = createFileCaptureService(
        createFileCaptureRepository(database.db),
      );
      const attachments = createWorkAttachmentRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Attachment project",
      });
      const other = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Other attachment project",
      });
      const taskCapture = await captures.createCapture({
        inputType: "text",
        originalContent: "Review the attached survey",
      });
      const task = await captures.fileCapture(taskCapture.id, {
        projectId: project.id,
        kind: "task",
        title: "Review attached survey",
      });
      const createDocument = async (projectId: string, title: string) => {
        const bytes = Buffer.from(`Exact original ${title}\n`);
        const source = await files.create({
          originalName: `${title}.txt`,
          mediaType: "text/plain",
          bytes,
        });
        const filed = await captures.fileCapture(source.id, {
          projectId,
          kind: "document",
          title,
          body: "Local survey context",
        });
        return { source, document: filed.record, bytes };
      };
      const first = await createDocument(project.id, "Garden survey A");
      const second = await createDocument(project.id, "Garden survey B");
      const foreign = await createDocument(other.id, "Other survey");
      const noteCapture = await captures.createCapture({
        inputType: "text",
        originalContent: "A note is not a file",
      });
      const note = await captures.fileCapture(noteCapture.id, {
        projectId: project.id,
        kind: "note",
        title: "Plain note",
      });

      const firstLink = await attachments.create(
        task.record.id,
        first.document.id,
      );
      const secondLink = await attachments.create(
        task.record.id,
        second.document.id,
      );
      assert.equal(firstLink.type, "attached_document");
      assert.equal(firstLink.inverseType, "attached_to_work");
      assert.equal(firstLink.sourceCaptureId, first.source.id);
      assert.equal(firstLink.originalName, "Garden survey A.txt");
      assert.equal(firstLink.projectId, project.id);
      assert.equal(
        (await attachments.getById(firstLink.id))?.knowledgeItemId,
        first.document.id,
      );
      const pageOne = await attachments.listForWork(task.record.id, {
        limit: 1,
      });
      assert.equal(pageOne.items.length, 1);
      assert.ok(pageOne.nextCursor);
      const pageTwo = await attachments.listForWork(task.record.id, {
        limit: 1,
        cursor: pageOne.nextCursor,
      });
      assert.equal(pageTwo.items.length, 1);
      assert.notEqual(pageTwo.items[0]?.id, pageOne.items[0]?.id);
      assert.deepEqual(
        new Set([pageOne.items[0]?.id, pageTwo.items[0]?.id]),
        new Set([firstLink.id, secondLink.id]),
      );
      assert.equal(
        (await attachments.listForKnowledge(first.document.id, { limit: 10 }))
          .items[0]?.workItemId,
        task.record.id,
      );

      for (const [documentId, code] of [
        [foreign.document.id, "CROSS_PROJECT"],
        [note.record.id, "DOCUMENT_REQUIRED"],
        [first.document.id, "ATTACHMENT_EXISTS"],
      ] as const) {
        await assert.rejects(
          attachments.create(task.record.id, documentId),
          (error: unknown) =>
            error instanceof Error && "code" in error && error.code === code,
        );
      }
      await assert.rejects(
        database.db.insert(workItemAttachment).values({
          id: crypto.randomUUID(),
          projectId: project.id,
          workItemId: task.record.id,
          knowledgeItemId: foreign.document.id,
        }),
      );
      await assert.rejects(
        database.db
          .update(workItemAttachment)
          .set({ knowledgeItemId: second.document.id })
          .where(eq(workItemAttachment.id, firstLink.id)),
      );
      await assert.rejects(
        database.db
          .delete(workItemAttachment)
          .where(eq(workItemAttachment.id, firstLink.id)),
      );

      const briefBefore = await createProjectBriefService(
        createBriefRepository(database.db),
      ).getBrief(project.id);
      const workFactBefore = briefBefore?.sections.work.items.find(
        (item) => item.id === task.record.id,
      );
      assert.ok(workFactBefore?.detail.includes("Garden survey A"));
      assert.ok(
        workFactBefore?.evidence.some(
          (item) =>
            item.kind === "work_item_attachment" && item.id === firstLink.id,
        ),
      );
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const packet = await packets.create(task.record.id, {
        selectedKnowledgeIds: [first.document.id],
        selectedResourceIds: [],
      });
      assert.equal(packet.snapshot.selectedKnowledge[0]?.id, first.document.id);

      const archived = await attachments.archive(firstLink.id);
      assert.equal(archived.state, "archived");
      assert.ok(archived.archivedAt);
      assert.equal(
        (await attachments.getById(firstLink.id))?.state,
        "archived",
      );
      assert.equal(
        (await attachments.listForKnowledge(first.document.id, { limit: 10 }))
          .items.length,
        0,
      );
      const briefAfter = await createProjectBriefService(
        createBriefRepository(database.db),
      ).getBrief(project.id);
      assert.equal(
        briefAfter?.sections.work.items
          .find((item) => item.id === task.record.id)
          ?.evidence.some((item) => item.id === firstLink.id),
        false,
      );
      assert.equal(
        (await packets.getById(packet.id))?.snapshot.selectedKnowledge[0]?.id,
        first.document.id,
      );
      assert.deepEqual(
        Array.from((await files.getOriginal(first.source.id)).bytes),
        Array.from(first.bytes),
      );
      const relinked = await attachments.create(
        task.record.id,
        first.document.id,
      );
      assert.notEqual(relinked.id, firstLink.id);
      const operations = await database.db
        .select({ operation: auditEvent.operation })
        .from(auditEvent);
      assert.ok(
        operations.some(
          (item) => item.operation === "work_item_attachment.created",
        ),
      );
      assert.ok(
        operations.some(
          (item) => item.operation === "work_item_attachment.archived",
        ),
      );
    } finally {
      await database.close();
    }
  },
);
