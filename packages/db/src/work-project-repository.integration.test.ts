import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createProjectBriefService } from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createWorkItemStatusRepository } from "./work-item-status-repository";
import { createWorkProjectRepository } from "./work-project-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "one source-backed Work item has shared status and exact context evidence across projects",
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
      const contexts = createWorkProjectRepository(database.db);
      const status = createWorkItemStatusRepository(database.db);
      const briefs = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const primary = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Primary Work context",
      });
      const receiving = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Receiving Work context",
      });
      const second = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Second Work context",
      });
      const unrelated = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Unrelated Work context",
      });
      const original = "Original shared antenna inspection source";
      const capture = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: original,
      });
      const filed = await captures.fileAsTask({
        captureId: capture.id,
        recordId: crypto.randomUUID(),
        projectId: primary.id,
        title: "Inspect shared antenna",
        description: "Record the antenna condition",
      });
      const task = filed.record;
      assert.ok("status" in task);

      await assert.rejects(contexts.link(task.id, primary.id), {
        code: "WORK_PROJECT_IS_PRIMARY",
      });
      const connected = await contexts.link(task.id, receiving.id);
      assert.equal(connected.link.sourceKind, "work_item");
      assert.equal(connected.link.targetKind, "project");
      assert.equal(connected.link.type, "relates_to");
      assert.equal(
        (await contexts.link(task.id, receiving.id)).link.id,
        connected.link.id,
      );
      const otherLink = await contexts.link(task.id, second.id);
      const firstPage = await contexts.listLinks(task.id, { limit: 1 });
      assert.ok(firstPage.nextCursor);
      const secondPage = await contexts.listLinks(task.id, {
        limit: 1,
        cursor: firstPage.nextCursor!,
      });
      assert.deepEqual(
        new Set(
          [...firstPage.items, ...secondPage.items].map((item) => item.link.id),
        ),
        new Set([connected.link.id, otherLink.link.id]),
      );
      assert.equal(
        (await captures.listProjectWork(primary.id, { limit: 10 })).items[0]
          ?.contextLink,
        null,
      );
      const receivingWork = await captures.listProjectWork(receiving.id, {
        limit: 10,
      });
      assert.equal(receivingWork.items[0]?.id, task.id);
      assert.equal(receivingWork.items[0]?.projectId, primary.id);
      assert.equal(receivingWork.items[0]?.contextLink?.id, connected.link.id);
      assert.equal(
        (await captures.listWork({ limit: 10, projectId: receiving.id }))
          .items[0]?.contextLink?.id,
        connected.link.id,
      );
      assert.equal(
        (await captures.listProjectWork(unrelated.id, { limit: 10 })).items
          .length,
        0,
      );
      assert.ok(
        (
          await captures.search({
            q: "antenna",
            projectId: receiving.id,
            limit: 10,
          })
        ).items.some((item) => item.id === task.id),
      );
      assert.ok(
        !(
          await captures.search({
            q: "antenna",
            projectId: unrelated.id,
            limit: 10,
          })
        ).items.some((item) => item.id === task.id),
      );
      const brief = await briefs.getBrief(receiving.id);
      const briefItem = brief?.sections.work.items.find(
        (item) => item.id === task.id,
      );
      assert.ok(
        briefItem?.evidence.some(
          (item) =>
            item.kind === "work_project_link" &&
            item.id === connected.link.id &&
            item.href === `/api/v1/work-project-links/${connected.link.id}`,
        ),
      );

      await status.changeStatus(task.id, {
        expectedStatus: "open",
        status: "done",
      });
      assert.equal(
        (await captures.listProjectWork(primary.id, { limit: 10 })).items[0]
          ?.status,
        "done",
      );
      assert.equal(
        (await captures.listProjectWork(receiving.id, { limit: 10 })).items[0]
          ?.status,
        "done",
      );
      assert.equal(
        (
          await captures.listWork({
            limit: 10,
            projectId: receiving.id,
            status: "done",
          })
        ).items[0]?.id,
        task.id,
      );
      assert.equal(
        (await briefs.getBrief(receiving.id))?.sections.work.items.length,
        0,
      );
      await assert.rejects(
        database.pool.query(
          "update work_item set project_id = $1 where id = $2",
          [receiving.id, task.id],
        ),
        /immutable/,
      );
      await assert.rejects(
        database.pool.query(
          "update work_item set source_capture_id = $1 where id = $2",
          [crypto.randomUUID(), task.id],
        ),
        /immutable/,
      );
      await assert.rejects(
        database.pool.query(
          "update work_project_link set project_id = $1 where id = $2",
          [unrelated.id, connected.link.id],
        ),
        /only transition/,
      );
      const archived = await contexts.archiveLink(connected.link.id);
      assert.equal(archived.lifecycle, "archived");
      assert.equal(
        (await contexts.getLink(archived.id))?.id,
        connected.link.id,
      );
      assert.equal(
        (await captures.listProjectWork(receiving.id, { limit: 10 })).items
          .length,
        0,
      );
      assert.equal(
        (await captures.listProjectWork(second.id, { limit: 10 })).items[0]?.id,
        task.id,
      );
      assert.equal(
        (await captures.getCapture(capture.id))?.originalContent,
        original,
      );
      const auditPage = await contexts.listAudit(task.id, { limit: 1 });
      assert.equal(auditPage.items[0]?.operation, "work.project_unlinked");
      assert.ok(auditPage.nextCursor);
      const earlier = await contexts.listAudit(task.id, {
        limit: 1,
        cursor: auditPage.nextCursor!,
      });
      assert.ok(earlier.items[0]);
      await assert.rejects(
        database.pool.query("delete from work_project_link where id = $1", [
          connected.link.id,
        ]),
        /cannot be deleted/,
      );
      await assert.rejects(
        database.pool.query(
          "delete from work_project_audit_event where id = $1",
          [auditPage.items[0]!.id],
        ),
        /immutable/,
      );
    } finally {
      await database.close();
    }
  },
);
