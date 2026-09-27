import assert from "node:assert/strict";
import { test } from "node:test";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createWorkAssignmentRepository } from "./work-assignment-repository";
import { createWorkPlanningRepository } from "./work-planning-repository";
import { createWorkItemStatusRepository } from "./work-item-status-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("focused Work queries page the same persisted tasks used by list and board", async () => {
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const catalog = createCatalogRepository(database.db);
    const captures = createCaptureRepository(database.db);
    const planning = createWorkPlanningRepository(database.db);
    const assignments = createWorkAssignmentRepository(database.db);
    const statuses = createWorkItemStatusRepository(database.db);
    const project = await catalog.createProject({
      id: crypto.randomUUID(),
      name: `Focused Work ${crypto.randomUUID()}`,
    });
    const tasks = [];
    for (const [index, priority, dueOn] of [
      [0, "high", "2026-09-30"],
      [1, "normal", "2026-10-01"],
      [2, "low", "2026-10-02"],
      [3, null, null],
    ] as const) {
      const capture = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: `Original focused source ${index}`,
      });
      const filed = await captures.fileAsTask({
        captureId: capture.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: `Focused task ${index}`,
        description: "One durable task across views",
      });
      assert.ok("status" in filed.record);
      let task = filed.record;
      if (priority && dueOn) {
        task = await planning.changePlanning(task.id, {
          expectedUpdatedAt: task.updatedAt,
          priority,
          dueOn,
        });
      }
      tasks.push(task);
    }
    const [overdue, today, upcoming, undated] = tasks;
    assert.ok(overdue && today && upcoming && undated);
    await assignments.changeAssignment(today.id, {
      expectedUpdatedAt: today.updatedAt,
      assigneeKind: "local_user",
      agentId: null,
    });
    await statuses.changeStatus(undated.id, {
      expectedStatus: "open",
      status: "done",
    });
    const common = { projectId: project.id, asOf: "2026-10-01" };
    const high = await captures.listWork({
      ...common,
      status: "open",
      priority: "high",
      due: "overdue",
      assignee: "unassigned",
      limit: 10,
    });
    assert.deepEqual(
      high.items.map((item) => item.id),
      [overdue.id],
    );
    const dueToday = await captures.listWork({
      ...common,
      status: "open",
      due: "today",
      assignee: "local_user",
      limit: 10,
    });
    assert.deepEqual(
      dueToday.items.map((item) => item.id),
      [today.id],
    );
    const future = await captures.listWork({
      ...common,
      due: "upcoming",
      limit: 10,
    });
    assert.deepEqual(
      future.items.map((item) => item.id),
      [upcoming.id],
    );
    const done = await captures.listWork({
      ...common,
      status: "done",
      priority: "unset",
      due: "undated",
      limit: 10,
    });
    assert.deepEqual(
      done.items.map((item) => item.id),
      [undated.id],
    );
    const collected = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await captures.listWork({
        ...common,
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      for (const item of page.items) {
        assert.equal(collected.has(item.id), false);
        collected.add(item.id);
      }
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(
      collected,
      new Set([overdue.id, today.id, upcoming.id, undated.id]),
    );
  } finally {
    await database.pool.end();
  }
});
