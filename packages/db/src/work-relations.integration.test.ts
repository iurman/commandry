import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createCaptureService,
  createProjectBriefService,
  createWorkRelationsService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { project, workItemRelation } from "./schema";
import { createWorkRelationsRepository } from "./work-relations-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "work hierarchy and blocking links preserve scope, prevent cycles, page, and explain the live brief",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    try {
      const projectId = crypto.randomUUID();
      const otherProjectId = crypto.randomUUID();
      await db.insert(project).values([
        { id: projectId, name: "Related work" },
        { id: otherProjectId, name: "Other work" },
      ]);
      const capture = createCaptureService(createCaptureRepository(db));
      async function task(name: string, owningProjectId = projectId) {
        const source = await capture.createCapture({
          inputType: "text",
          originalContent: `Original source for ${name}`,
        });
        const filed = await capture.fileCapture(source.id, {
          projectId: owningProjectId,
          kind: "task",
          title: name,
        });
        return filed.record.id;
      }
      const parent = await task("Parent plan");
      const child = await task("Child investigation");
      const grandchild = await task("Grandchild check");
      const alternateParent = await task("Alternate parent");
      const other = await task("Unrelated scope", otherProjectId);
      const relations = createWorkRelationsService(
        createWorkRelationsRepository(db),
      );
      const parentLink = await relations.create({
        type: "parent_of",
        sourceWorkItemId: parent,
        targetWorkItemId: child,
      });
      await relations.create({
        type: "parent_of",
        sourceWorkItemId: child,
        targetWorkItemId: grandchild,
      });
      await assert.rejects(
        relations.create({
          type: "parent_of",
          sourceWorkItemId: grandchild,
          targetWorkItemId: parent,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "RELATION_CYCLE",
      );
      await assert.rejects(
        relations.create({
          type: "parent_of",
          sourceWorkItemId: alternateParent,
          targetWorkItemId: child,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "PARENT_EXISTS",
      );
      await assert.rejects(
        relations.create({
          type: "blocks",
          sourceWorkItemId: parent,
          targetWorkItemId: other,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CROSS_PROJECT",
      );
      await assert.rejects(
        relations.create({
          type: "blocks",
          sourceWorkItemId: parent,
          targetWorkItemId: parent,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "RELATION_SELF",
      );
      const blocker = await relations.create({
        type: "blocks",
        sourceWorkItemId: child,
        targetWorkItemId: parent,
      });
      await relations.create({
        type: "blocks",
        sourceWorkItemId: grandchild,
        targetWorkItemId: parent,
      });
      await assert.rejects(
        relations.create({
          type: "blocks",
          sourceWorkItemId: parent,
          targetWorkItemId: child,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "RELATION_CYCLE",
      );
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await relations.list(parent, {
          direction: "incoming",
          limit: 1,
          cursor,
        });
        for (const item of page.items) seen.add(item.id);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      assert.equal(seen.size, 2);
      assert.ok(seen.has(blocker.id));
      const brief = await createProjectBriefService(
        createBriefRepository(db),
      ).getBrief(projectId);
      const fact = brief?.sections.work.items.find(
        (item) => item.id === parent,
      );
      assert.ok(fact?.detail.includes("Blocked by"));
      assert.ok(fact?.detail.includes("Child investigation"));
      assert.ok(
        fact?.evidence.some(
          (item) =>
            item.id === blocker.id && item.kind === "work_item_relation",
        ),
      );
      assert.equal(
        brief?.nextActions.items.some((item) =>
          item.text.includes("Parent plan"),
        ),
        false,
      );
      assert.equal((await relations.getById(parentLink.id))?.state, "active");
      const archived = await relations.archive(parentLink.id);
      assert.equal(archived.state, "archived");
      assert.equal((await relations.getById(parentLink.id))?.state, "archived");
      await assert.rejects(
        relations.archive(parentLink.id),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "RELATION_ARCHIVED",
      );
      await assert.rejects(
        db
          .delete(workItemRelation)
          .where(eq(workItemRelation.id, parentLink.id)),
      );
      await assert.rejects(
        db
          .update(workItemRelation)
          .set({ type: "blocks" })
          .where(eq(workItemRelation.id, blocker.id)),
      );
      const replaced = await relations.create({
        type: "parent_of",
        sourceWorkItemId: parent,
        targetWorkItemId: child,
      });
      assert.notEqual(replaced.id, parentLink.id);
    } finally {
      await database.close();
    }
  },
);
