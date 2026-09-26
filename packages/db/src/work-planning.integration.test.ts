import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createWorkPlanningRepository } from "./work-planning-repository";
import { createWorkItemStatusRepository } from "./work-item-status-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "task dates and priority are audited and upcoming work pages across projects",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const projects = createCatalogRepository(database.db);
      const captures = createCaptureRepository(database.db);
      const planning = createWorkPlanningRepository(database.db);
      const status = createWorkItemStatusRepository(database.db);
      const firstProject = await projects.createProject({
        id: crypto.randomUUID(),
        name: "Planning integration one",
      });
      const secondProject = await projects.createProject({
        id: crypto.randomUUID(),
        name: "Planning integration two",
      });
      const original = "  Preserve exact task source.  ";
      const tasks = [];
      for (const [index, projectId] of [
        firstProject.id,
        secondProject.id,
        firstProject.id,
      ].entries()) {
        const capture = await captures.createCapture({
          id: crypto.randomUUID(),
          inputType: "text",
          originalContent: `${original}${index}`,
        });
        const filed = await captures.fileAsTask({
          captureId: capture.id,
          recordId: crypto.randomUUID(),
          projectId,
          title: `Planning task ${index}`,
          description: "A local task",
        });
        assert.ok("status" in filed.record);
        tasks.push({ item: filed.record, capture });
      }
      const [first, second, undated] = tasks;
      assert.ok(first && second && undated);
      const firstSaved = await planning.changePlanning(first.item.id, {
        expectedUpdatedAt: first.item.updatedAt,
        priority: "high",
        dueOn: "2026-10-01",
      });
      assert.equal(firstSaved.priority, "high");
      assert.equal(firstSaved.dueOn, "2026-10-01");
      assert.equal(firstSaved.sourceCaptureId, first.capture.id);
      const secondSaved = await planning.changePlanning(second.item.id, {
        expectedUpdatedAt: second.item.updatedAt,
        priority: "low",
        dueOn: "2026-09-28",
      });
      await assert.rejects(
        planning.changePlanning(first.item.id, {
          expectedUpdatedAt: first.item.updatedAt,
          priority: "normal",
          dueOn: null,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "PLANNING_CONFLICT",
      );
      assert.equal(
        (await planning.listUpcoming({ limit: 1 })).items[0]?.id,
        secondSaved.id,
      );
      const page = await planning.listUpcoming({ limit: 1 });
      assert.equal(page.nextCursor, secondSaved.id);
      const next = await planning.listUpcoming({
        limit: 1,
        cursor: page.nextCursor!,
      });
      assert.equal(next.items[0]?.id, firstSaved.id);
      assert.equal(next.nextCursor, null);
      assert.equal(
        (await planning.listUpcoming({ limit: 10 })).items.some(
          (item) => item.id === undated.item.id,
        ),
        false,
      );
      const revised = await planning.changePlanning(first.item.id, {
        expectedUpdatedAt: firstSaved.updatedAt,
        priority: null,
        dueOn: null,
      });
      assert.equal(revised.priority, null);
      assert.equal(revised.dueOn, null);
      const history = await planning.listPlanningEvents(first.item.id, {
        limit: 1,
      });
      assert.equal(history.items.length, 1);
      assert.ok(history.nextCursor);
      assert.equal(
        (
          await planning.listPlanningEvents(first.item.id, {
            limit: 1,
            cursor: history.nextCursor,
          })
        ).items.length,
        1,
      );
      await assert.rejects(
        database.pool.query(
          "delete from work_item_planning_event where id = $1",
          [history.items[0]!.id],
        ),
      );
      assert.equal(
        (await captures.getCapture(first.capture.id))?.originalContent,
        `${original}0`,
      );
      await status.changeStatus(second.item.id, {
        expectedStatus: "open",
        status: "done",
      });
      assert.equal(
        (await planning.listUpcoming({ limit: 10 })).items.length,
        0,
      );
      await assert.rejects(
        database.pool.query(
          "update work_item set priority = 'urgent' where id = $1",
          [first.item.id],
        ),
      );
    } finally {
      await database.pool.end();
    }
  },
);
