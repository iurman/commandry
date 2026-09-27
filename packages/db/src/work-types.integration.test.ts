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
import { migrateDatabase } from "./migrate";
import { createWorkRelationsRepository } from "./work-relations-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "original captures become typed initiatives and tasks, while audited hierarchy derives subtasks",
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
      const relations = createWorkRelationsRepository(database.db);
      const briefs = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Typed Work integration",
      });
      const initiativeSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Original improve the lab thought",
      });
      const initiative = await captures.fileAsTask({
        captureId: initiativeSource.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Improve the lab",
        description: "A broad, original project effort",
        workType: "initiative",
      });
      const taskSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Original inspect sensor thought",
      });
      const task = await captures.fileAsTask({
        captureId: taskSource.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Inspect sensor",
        description: "Collect local observations",
      });
      assert.ok("workType" in initiative.record);
      assert.ok("workType" in task.record);
      assert.equal(initiative.record.workType, "initiative");
      assert.equal(task.record.workType, "task");
      await assert.rejects(
        relations.create({
          sourceWorkItemId: task.record.id,
          targetWorkItemId: initiative.record.id,
          type: "parent_of",
        }),
        { code: "INITIATIVE_CANNOT_BE_CHILD" },
      );
      const parentLink = await relations.create({
        sourceWorkItemId: initiative.record.id,
        targetWorkItemId: task.record.id,
        type: "parent_of",
      });
      assert.equal(parentLink.state, "active");
      const current = await captures.listProjectWork(project.id, { limit: 10 });
      assert.equal(
        current.items.find((item) => item.id === task.record.id)?.workType,
        "subtask",
      );
      assert.equal(
        current.items.find((item) => item.id === initiative.record.id)
          ?.workType,
        "initiative",
      );
      const scopedSearch = await captures.search({
        q: "sensor",
        projectId: project.id,
        limit: 10,
      });
      assert.ok(
        scopedSearch.items.some(
          (item) => item.id === task.record.id && item.kind === "subtask",
        ),
      );
      const brief = await briefs.getBrief(project.id);
      const fact = brief?.sections.work.items.find(
        (item) => item.id === task.record.id,
      );
      assert.ok(fact?.detail.startsWith("Subtask. "));
      assert.ok(
        fact?.evidence.some(
          (item) => item.kind === "work_item" && item.id === task.record.id,
        ),
      );
      const packet = await packets.create(task.record.id, {
        selectedKnowledgeIds: [],
        selectedResourceIds: [],
      });
      assert.equal(packet.snapshot.objective.workType, "subtask");
      await assert.rejects(
        database.pool.query(
          "update work_item set work_type = 'initiative' where id = $1",
          [task.record.id],
        ),
        /only change through a typed parent relationship/,
      );
      await relations.archive(parentLink.id);
      assert.equal(
        (await captures.listProjectWork(project.id, { limit: 10 })).items.find(
          (item) => item.id === task.record.id,
        )?.workType,
        "task",
      );
      assert.equal(
        (await packets.getById(packet.id))?.snapshot.objective.workType,
        "subtask",
      );
      assert.equal(
        (await captures.getCapture(taskSource.id))?.originalContent,
        "Original inspect sensor thought",
      );
      assert.equal(
        (await captures.getCapture(initiativeSource.id))?.originalContent,
        "Original improve the lab thought",
      );
    } finally {
      await database.close();
    }
  },
);
