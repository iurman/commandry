import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { canonicalPacketJson, ExecutionPacketError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createRecordDetailRepository } from "./record-detail-repository";
import {
  auditEvent,
  capture,
  executionPacket,
  knowledgeItem,
  project,
  projectResourceLink,
  resource,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "execution packets validate project scope and preserve immutable versioned snapshots",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 4 });
    const db = database.db;
    const packetRepository = createExecutionPacketRepository(db);
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const taskCaptureId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const noteCaptureId = crypto.randomUUID();
    const noteId = crypto.randomUUID();
    const otherNoteCaptureId = crypto.randomUUID();
    const otherNoteId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();
    const otherResourceId = crypto.randomUUID();
    const archivedResourceId = crypto.randomUUID();
    const orderedLinkIds = [crypto.randomUUID(), crypto.randomUUID()].sort();
    const laterLinkId = orderedLinkIds[0]!;
    const earlierLinkId = orderedLinkIds[1]!;
    const archivedLinkId = crypto.randomUUID();
    const earlierLinkAt = new Date("2026-09-25T09:00:00.000Z");
    const laterLinkAt = new Date("2026-09-25T10:00:00.000Z");

    try {
      await db.insert(project).values([
        { id: projectId, name: "Packet project", summary: "Local context" },
        { id: otherProjectId, name: "Different packet project" },
      ]);
      await db.insert(capture).values([
        {
          id: taskCaptureId,
          inputType: "text",
          originalContent: "Original task thought",
          source: "manual-local",
          author: "local-user",
          state: "filed",
          projectId,
          filedRecordKind: "task",
          filedRecordId: taskId,
          filedAt: new Date(),
        },
        {
          id: noteCaptureId,
          inputType: "text",
          originalContent: "Original relevant note",
          source: "manual-local",
          author: "local-user",
          state: "filed",
          projectId,
          filedRecordKind: "note",
          filedRecordId: noteId,
          filedAt: new Date(),
        },
        {
          id: otherNoteCaptureId,
          inputType: "text",
          originalContent: "Other project private note",
          source: "manual-local",
          author: "local-user",
          state: "filed",
          projectId: otherProjectId,
          filedRecordKind: "note",
          filedRecordId: otherNoteId,
          filedAt: new Date(),
        },
      ]);
      await db.insert(workItem).values({
        id: taskId,
        projectId,
        sourceCaptureId: taskCaptureId,
        title: "Packet task",
        description: "Prepare a local review packet",
      });
      await db.insert(knowledgeItem).values([
        {
          id: noteId,
          projectId,
          sourceCaptureId: noteCaptureId,
          title: "Relevant note",
          content: "Evidence for packet selection",
        },
        {
          id: otherNoteId,
          projectId: otherProjectId,
          sourceCaptureId: otherNoteCaptureId,
          title: "Other note",
          content: "Must not enter packet",
        },
      ]);
      await db.insert(resource).values([
        { id: resourceId, kind: "service", name: "Selected local resource" },
        {
          id: otherResourceId,
          kind: "service",
          name: "Other project resource",
        },
        { id: archivedResourceId, kind: "service", name: "Archived resource" },
      ]);
      await db.insert(projectResourceLink).values([
        {
          id: laterLinkId,
          projectId,
          resourceId,
          type: "supports",
          sourceKind: "resource",
          targetKind: "project",
          lifecycle: "active",
          createdAt: laterLinkAt,
        },
        {
          id: earlierLinkId,
          projectId,
          resourceId,
          type: "relates_to",
          sourceKind: "project",
          targetKind: "resource",
          lifecycle: "active",
          createdAt: earlierLinkAt,
        },
        {
          id: crypto.randomUUID(),
          projectId: otherProjectId,
          resourceId: otherResourceId,
          type: "supports",
          sourceKind: "resource",
          targetKind: "project",
          lifecycle: "active",
        },
        {
          id: archivedLinkId,
          projectId,
          resourceId: archivedResourceId,
          type: "supports",
          sourceKind: "resource",
          targetKind: "project",
          lifecycle: "archived",
        },
      ]);

      const build = (bundle: {
        id: string;
        packetVersion: number;
        generatedAt: string;
        project: { id: string; name: string };
        workItem: { id: string; title: string; sourceCaptureId: string };
        sourceCapture: { id: string; createdAt: string };
        knowledge: Array<{ id: string; title: string }>;
        resources: Array<{
          resourceId: string;
          linkId: string;
          linkType: "supports" | "relates_to";
          linkedAt: string;
        }>;
      }) => {
        const snapshot = {
          task: {
            id: bundle.workItem.id,
            title: bundle.workItem.title,
            sourceCaptureId: bundle.sourceCapture.id,
          },
          project: {
            id: bundle.project.id,
            name: bundle.project.name,
          },
          selectedKnowledge: bundle.knowledge.map((item) => ({
            id: item.id,
            title: item.title,
          })),
          selectedResources: bundle.resources.map((selected) => ({
            id: selected.resourceId,
            linkId: selected.linkId,
            linkType: selected.linkType,
            linkedAt: selected.linkedAt,
          })),
          generatedAt: bundle.generatedAt,
          packetVersion: bundle.packetVersion,
        };
        return {
          snapshot,
          contentDigest: createHash("sha256")
            .update(canonicalPacketJson(snapshot))
            .digest("hex"),
        };
      };

      const first = await packetRepository.create(
        {
          workItemId: taskId,
          selectedKnowledgeIds: [noteId],
          selectedResourceIds: [resourceId],
        },
        build,
      );
      assert.equal(first.packetVersion, 1);
      assert.equal(first.schemaVersion, "execution-packet/v1");
      assert.equal(first.projectId, projectId);
      assert.equal(first.sourceCaptureId, taskCaptureId);
      const creationAudit = await db
        .select()
        .from(auditEvent)
        .where(sql`${auditEvent.details}->>'packetId' = ${first.id}`);
      assert.equal(creationAudit.length, 1);
      assert.equal(creationAudit[0]?.operation, "execution_packet.created");
      assert.deepEqual(
        (first.snapshot as { selectedKnowledge: unknown[] }).selectedKnowledge,
        [{ id: noteId, title: "Relevant note" }],
      );
      assert.deepEqual(
        (
          first.snapshot as {
            selectedResources: Array<{
              id: string;
              linkId: string;
              linkType: string;
              linkedAt: string;
            }>;
          }
        ).selectedResources,
        [
          {
            id: resourceId,
            linkId: earlierLinkId,
            linkType: "relates_to",
            linkedAt: earlierLinkAt.toISOString(),
          },
        ],
      );
      const details = createRecordDetailRepository(db);
      assert.deepEqual(
        await details.getProjectResourceLinkById(earlierLinkId),
        {
          id: earlierLinkId,
          projectId,
          resourceId,
          type: "relates_to",
          lifecycle: "active",
          createdAt: earlierLinkAt.toISOString(),
        },
      );
      assert.equal(
        (await details.getProjectResourceLinkById(archivedLinkId))?.lifecycle,
        "archived",
      );
      const savedSnapshot = structuredClone(first.snapshot);
      assert.deepEqual(
        (await packetRepository.getById(first.id))?.snapshot,
        savedSnapshot,
      );

      await db
        .update(workItem)
        .set({ title: "Task edited after packet" })
        .where(eq(workItem.id, taskId));
      await db
        .update(knowledgeItem)
        .set({ title: "Note edited after packet" })
        .where(eq(knowledgeItem.id, noteId));
      await db
        .update(resource)
        .set({ name: "Resource edited after packet" })
        .where(eq(resource.id, resourceId));
      assert.deepEqual(
        (await packetRepository.getById(first.id))?.snapshot,
        savedSnapshot,
      );

      await assert.rejects(
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [otherNoteId],
            selectedResourceIds: [],
          },
          build,
        ),
        (error: unknown) =>
          error instanceof ExecutionPacketError &&
          error.code === "KNOWLEDGE_NOT_IN_PROJECT",
      );
      await assert.rejects(
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [],
            selectedResourceIds: [otherResourceId],
          },
          build,
        ),
        (error: unknown) =>
          error instanceof ExecutionPacketError &&
          error.code === "RESOURCE_NOT_IN_PROJECT",
      );
      await assert.rejects(
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [],
            selectedResourceIds: [archivedResourceId],
          },
          build,
        ),
        (error: unknown) =>
          error instanceof ExecutionPacketError &&
          error.code === "RESOURCE_NOT_IN_PROJECT",
      );
      await assert.rejects(
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [noteId, noteId],
            selectedResourceIds: [],
          },
          build,
        ),
        (error: unknown) =>
          error instanceof ExecutionPacketError &&
          error.code === "INVALID_SELECTION",
      );
      await assert.rejects(
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [],
            selectedResourceIds: [],
          },
          () => ({ snapshot: { wrong: true }, contentDigest: "0".repeat(64) }),
        ),
        (error: unknown) =>
          error instanceof ExecutionPacketError &&
          error.code === "INVALID_SELECTION",
      );
      const beforeConcurrent = await db
        .select()
        .from(executionPacket)
        .where(eq(executionPacket.workItemId, taskId));
      assert.equal(beforeConcurrent.length, 1);

      const [second, third] = await Promise.all([
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [],
            selectedResourceIds: [],
          },
          build,
        ),
        packetRepository.create(
          {
            workItemId: taskId,
            selectedKnowledgeIds: [noteId],
            selectedResourceIds: [resourceId],
          },
          build,
        ),
      ]);
      assert.deepEqual(
        [second.packetVersion, third.packetVersion].sort(),
        [2, 3],
      );
      const selectedAgain = [second, third].find(
        (packet) =>
          (packet.snapshot as { selectedResources: unknown[] })
            .selectedResources.length === 1,
      );
      assert.ok(selectedAgain);
      assert.deepEqual(
        (selectedAgain.snapshot as { selectedResources: unknown[] })
          .selectedResources,
        (first.snapshot as { selectedResources: unknown[] }).selectedResources,
      );
      const packetPage = await packetRepository.listForWorkItem(taskId, {
        limit: 1,
      });
      assert.equal(packetPage.items[0]?.packetVersion, 3);
      assert.ok(packetPage.nextCursor);
      const packetPageTwo = await packetRepository.listForWorkItem(taskId, {
        limit: 1,
        cursor: packetPage.nextCursor!,
      });
      assert.equal(packetPageTwo.items[0]?.packetVersion, 2);
      const packetPageThree = await packetRepository.listForWorkItem(taskId, {
        limit: 1,
        cursor: packetPageTwo.nextCursor!,
      });
      assert.equal(packetPageThree.items[0]?.packetVersion, 1);
      assert.equal(packetPageThree.nextCursor, null);

      await assert.rejects(
        db
          .update(executionPacket)
          .set({ contentDigest: "a".repeat(64) })
          .where(eq(executionPacket.id, first.id)),
        (error: unknown) =>
          error instanceof Error &&
          String(error.cause ?? error).includes(
            "execution packets are immutable",
          ),
      );
      await assert.rejects(
        db.delete(executionPacket).where(eq(executionPacket.id, first.id)),
        (error: unknown) =>
          error instanceof Error &&
          String(error.cause ?? error).includes(
            "execution packets are immutable",
          ),
      );
      assert.equal(
        (
          await db
            .select()
            .from(executionPacket)
            .where(eq(executionPacket.workItemId, taskId))
        ).length,
        3,
      );
      assert.equal(await packetRepository.getById(crypto.randomUUID()), null);
    } finally {
      await database.close();
    }
  },
);
