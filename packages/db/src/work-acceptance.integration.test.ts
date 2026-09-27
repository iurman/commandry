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
import {
  auditEvent,
  workItemAcceptanceRevision,
  workItemVerification,
} from "./schema";
import { createWorkAcceptanceRepository } from "./work-acceptance-repository";
import { createWorkAttachmentRepository } from "./work-attachment-repository";
import { createWorkItemStatusRepository } from "./work-item-status-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "task acceptance revisions and manual document evidence govern local completion without rewriting source or packets",
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
      const acceptance = createWorkAcceptanceRepository(database.db);
      const status = createWorkItemStatusRepository(database.db);
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const briefs = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Acceptance evidence project",
      });
      const createTask = async (title: string) => {
        const source = await captures.createCapture({
          inputType: "text",
          originalContent: title,
        });
        return (
          await captures.fileCapture(source.id, {
            projectId: project.id,
            kind: "task",
            title,
          })
        ).record;
      };
      const task = await createTask("Ship verified local work");
      const otherTask = await createTask("Other work");
      const bytes = Buffer.from("Original local verification log\n");
      const source = await files.create({
        originalName: "verification-log.txt",
        mediaType: "text/plain",
        bytes,
      });
      const document = (
        await captures.fileCapture(source.id, {
          projectId: project.id,
          kind: "document",
          title: "Verification log",
          body: "Manual local test notes",
        })
      ).record;
      const attachment = await attachments.create(task.id, document.id);
      const foreignAttachment = await attachments.create(
        otherTask.id,
        document.id,
      );

      assert.deepEqual(await acceptance.get(task.id), {
        workItemId: task.id,
        criteria: "",
        version: 0,
        updatedAt: null,
      });
      const first = await acceptance.save(task.id, {
        expectedVersion: 0,
        criteria: "A complete local test log is attached.",
      });
      assert.equal(first.version, 1);
      await assert.rejects(
        acceptance.save(task.id, {
          expectedVersion: 0,
          criteria: "Stale edit",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "ACCEPTANCE_CONFLICT",
      );
      const optionalGate = createWorkItemStatusRepository(database.db, {
        requireAcceptanceEvidence: false,
      });
      assert.equal(
        (
          await optionalGate.changeStatus(task.id, {
            status: "done",
            expectedStatus: "open",
          })
        ).status,
        "done",
      );
      await optionalGate.changeStatus(task.id, {
        status: "open",
        expectedStatus: "done",
      });
      await assert.rejects(
        status.changeStatus(task.id, {
          status: "done",
          expectedStatus: "open",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "ACCEPTANCE_UNMET",
      );
      await assert.rejects(
        acceptance.recordVerification(task.id, {
          expectedAcceptanceVersion: 1,
          attachmentId: foreignAttachment.id,
          result: "met",
          note: "Wrong task source",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "ATTACHMENT_SCOPE",
      );
      await assert.rejects(
        database.db.insert(workItemVerification).values({
          id: crypto.randomUUID(),
          workItemId: task.id,
          acceptanceVersion: 1,
          attachmentId: foreignAttachment.id,
          documentTitle: document.title,
          sourceCaptureId: source.id,
          result: "met",
          note: "Bypass attempt",
          actor: "local-user:unattributed",
        }),
      );

      const firstReview = await acceptance.recordVerification(task.id, {
        expectedAcceptanceVersion: 1,
        attachmentId: attachment.id,
        result: "met",
        note: "The original log documents the test result.",
      });
      assert.equal(firstReview.sourceCaptureId, source.id);
      assert.equal(firstReview.sourceLabel, "Manual local acceptance review");
      const brief = await briefs.getBrief(project.id);
      const fact = brief?.sections.work.items.find(
        (item) => item.id === task.id,
      );
      assert.ok(fact?.detail.includes("Acceptance criteria v1"));
      assert.ok(fact?.detail.includes("Manual local review met"));
      assert.ok(
        fact?.evidence.some(
          (item) =>
            item.kind === "work_item_verification" &&
            item.id === firstReview.id,
        ),
      );
      const packet = await packets.create(task.id, {
        selectedKnowledgeIds: [document.id],
        selectedResourceIds: [],
      });
      assert.equal(packet.snapshot.acceptance?.criteria, first.criteria);
      assert.equal(packet.snapshot.acceptance?.latestReview?.result, "met");
      assert.equal(
        packet.snapshot.missing.acceptanceCriteria.status,
        "recorded",
      );
      assert.equal(
        (
          await status.changeStatus(task.id, {
            status: "done",
            expectedStatus: "open",
          })
        ).status,
        "done",
      );
      await assert.rejects(
        acceptance.save(task.id, {
          expectedVersion: 1,
          criteria: "Changed while done",
        }),
      );
      await status.changeStatus(task.id, {
        status: "open",
        expectedStatus: "done",
      });
      const second = await acceptance.save(task.id, {
        expectedVersion: 1,
        criteria: "A new test log covers the updated requirement.",
      });
      assert.equal(second.version, 2);
      await assert.rejects(
        status.changeStatus(task.id, {
          status: "done",
          expectedStatus: "open",
        }),
      );
      const failedReview = await acceptance.recordVerification(task.id, {
        expectedAcceptanceVersion: 2,
        attachmentId: attachment.id,
        result: "not_met",
        note: "The new requirement is still untested.",
      });
      await assert.rejects(
        status.changeStatus(task.id, {
          status: "done",
          expectedStatus: "open",
        }),
      );
      const finalReview = await acceptance.recordVerification(task.id, {
        expectedAcceptanceVersion: 2,
        attachmentId: attachment.id,
        result: "met",
        note: "The updated requirement is documented in the original file.",
      });
      assert.equal(
        (await acceptance.getVerification(finalReview.id))?.id,
        finalReview.id,
      );
      assert.equal(
        (
          await status.changeStatus(task.id, {
            status: "done",
            expectedStatus: "open",
          })
        ).status,
        "done",
      );
      const revisionPage = await acceptance.listRevisions(task.id, {
        limit: 1,
      });
      assert.equal(revisionPage.items[0]?.version, 2);
      assert.ok(revisionPage.nextCursor);
      assert.equal(
        (
          await acceptance.listRevisions(task.id, {
            limit: 1,
            cursor: revisionPage.nextCursor,
          })
        ).items[0]?.version,
        1,
      );
      const reviewPage = await acceptance.listVerifications(task.id, {
        limit: 1,
      });
      assert.equal(reviewPage.items[0]?.id, finalReview.id);
      assert.ok(reviewPage.nextCursor);
      assert.equal(
        (
          await acceptance.listVerifications(task.id, {
            limit: 1,
            cursor: reviewPage.nextCursor,
          })
        ).items[0]?.id,
        failedReview.id,
      );
      await assert.rejects(
        database.db
          .update(workItemAcceptanceRevision)
          .set({ criteria: "Mutated" })
          .where(eq(workItemAcceptanceRevision.id, revisionPage.items[0]!.id)),
      );
      await assert.rejects(
        database.db
          .delete(workItemVerification)
          .where(eq(workItemVerification.id, finalReview.id)),
      );
      assert.equal(
        (await packets.getById(packet.id))?.snapshot.acceptance?.version,
        1,
      );
      assert.deepEqual(
        Array.from((await files.getOriginal(source.id)).bytes),
        Array.from(bytes),
      );
      const operations = await database.db
        .select({ operation: auditEvent.operation })
        .from(auditEvent);
      assert.ok(
        operations.some(
          (item) => item.operation === "work_item_acceptance.revised",
        ),
      );
      assert.ok(
        operations.some(
          (item) => item.operation === "work_item_verification.recorded",
        ),
      );
    } finally {
      await database.close();
    }
  },
);
