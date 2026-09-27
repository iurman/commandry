import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createCaptureService,
  createProjectBriefService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createDatabase } from "./client";
import { knowledgeItem, project, workItemComment } from "./schema";
import { createWorkDiscussionRepository } from "./work-discussion-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "filed links preserve their original URL while work discussion pages, searches, and remains immutable",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const captureRepository = createCaptureRepository(db);
    const captureService = createCaptureService(captureRepository);
    const discussion = createWorkDiscussionRepository(db);
    try {
      await db.insert(project).values([
        { id: projectId, name: "Knowledge link integration" },
        { id: otherProjectId, name: "Another context" },
      ]);
      const source = await captureService.createCapture({
        inputType: "url",
        originalContent: "https://example.test/field-guide?token=private#plan",
      });
      const linked = await captureService.fileCapture(source.id, {
        projectId,
        kind: "link",
        title: "Field guide reference",
        body: "Use this guide when planning the task.",
      });
      assert.equal(linked.capture.originalContent, source.originalContent);
      assert.deepEqual(linked.capture.filedRecord, {
        kind: "link",
        id: linked.record.id,
      });
      if (!("kind" in linked.record) || linked.record.kind !== "link")
        throw new Error("Expected link record");
      assert.equal(linked.record.url, "https://example.test/field-guide");
      await assert.rejects(
        db
          .update(knowledgeItem)
          .set({ url: "https://changed.test/" })
          .where(eq(knowledgeItem.id, linked.record.id)),
      );
      assert.equal(
        (await captureService.listProjectKnowledge(projectId, { limit: 10 }))
          .items[0]?.id,
        linked.record.id,
      );
      assert.equal(
        (await captureService.listKnowledge({ limit: 10, projectId })).items[0]
          ?.kind,
        "link",
      );
      const foundLink = await captureService.search({
        q: "field guide",
        projectId,
        limit: 20,
      });
      assert.ok(
        foundLink.items.some(
          (item) => item.id === linked.record.id && item.kind === "link",
        ),
      );
      assert.ok(
        !foundLink.items.some(
          (item) =>
            item.id === linked.record.id && item.href.includes("private"),
        ),
      );
      const brief = await createProjectBriefService(
        createBriefRepository(db),
      ).getBrief(projectId);
      assert.ok(brief);
      assert.ok(
        brief.sections.knowledge.items.some(
          (item) =>
            item.id === linked.record.id &&
            item.sourceLabel === "Manual local knowledge link" &&
            item.evidence.some(
              (evidence) =>
                evidence.href === `/api/v1/knowledge-items/${linked.record.id}`,
            ),
        ),
      );

      const taskCapture = await captureService.createCapture({
        inputType: "text",
        originalContent: "Review the field guide and record comments.",
      });
      const task = await captureService.fileCapture(taskCapture.id, {
        projectId,
        kind: "task",
        title: "Review field guide",
      });
      const createdIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const comment = await discussion.create(
          task.record.id,
          `Evidence thread ${index} is still local.`,
        );
        assert.equal(comment.projectId, projectId);
        assert.equal(comment.sourceLabel, "Manual local work comment");
        createdIds.push(comment.id);
      }
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await discussion.list(task.record.id, {
          limit: 1,
          cursor,
        });
        for (const comment of page.items) {
          assert.equal(seen.has(comment.id), false);
          seen.add(comment.id);
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.deepEqual(seen, new Set(createdIds));
      await assert.rejects(
        discussion.create(crypto.randomUUID(), "No such task"),
        (error: unknown) =>
          Boolean(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "WORK_NOT_FOUND",
          ),
      );
      await assert.rejects(
        db
          .update(workItemComment)
          .set({ body: "Changed after posting" })
          .where(eq(workItemComment.id, createdIds[0]!)),
      );
      await assert.rejects(
        db.insert(workItemComment).values({
          id: crypto.randomUUID(),
          workItemId: task.record.id,
          projectId: otherProjectId,
          body: "Wrong project",
          actor: "local-user:unattributed",
        }),
      );
      const foundComment = await captureService.search({
        q: "thread",
        projectId,
        limit: 20,
      });
      assert.ok(
        foundComment.items.some(
          (item) =>
            item.kind === "comment" &&
            item.href === `/work-items/${task.record.id}#discussion`,
        ),
      );
      assert.equal(
        (
          await captureService.search({
            q: "thread",
            projectId: otherProjectId,
            limit: 20,
          })
        ).items.some((item) => item.kind === "comment"),
        false,
      );
    } finally {
      await database.close();
    }
  },
);
