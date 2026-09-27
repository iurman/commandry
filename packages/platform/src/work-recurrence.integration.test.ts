import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createExecutionPacketService,
  createProjectBriefService,
  createWorkRecurrenceProcessor,
} from "@commandry/application";
import {
  createBriefRepository,
  createCaptureRepository,
  createCatalogRepository,
  createDatabase,
  createExecutionPacketRepository,
  createWorkItemStatusRepository,
  createWorkRecurrenceRepository,
  migrateDatabase,
  schema,
} from "@commandry/db";
import {
  createPgBossProducer,
  createWorkRecurrenceScheduler,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "recurring Work keeps the source, queues one due task, and records bounded catch-up",
  { timeout: 60_000 },
  async () => {
    await migrateDatabase({
      connectionString: adminUrl,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 4,
    });
    const transport = await createPgBossProducer({
      connectionString: runtimeUrl.toString(),
      max: 2,
    });
    try {
      const catalog = createCatalogRepository(database.db);
      const captures = createCaptureRepository(database.db);
      const recurrence = createWorkRecurrenceRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Recurring Work project",
      });
      const sourceCapture = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Original recurring inspection note",
      });
      const filed = await captures.fileAsTask({
        captureId: sourceCapture.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Inspect local service",
        description: "Use the preserved inspection source",
      });
      assert.ok("sourceCaptureId" in filed.record);
      const original = filed.record;
      const start = new Date(Date.now() + 5 * 60_000);
      const definition = await recurrence.createDefinition(original.id, {
        startAt: start.toISOString(),
        everyMinutes: 5,
      });
      assert.equal(definition.sourceOfTruth, "local-only");
      assert.equal(definition.projectId, project.id);
      assert.equal(definition.nextOccurrenceAt, start.toISOString());
      await assert.rejects(
        recurrence.createDefinition(original.id, {
          startAt: start.toISOString(),
          everyMinutes: 5,
        }),
        { code: "RECURRENCE_ALREADY_EXISTS" },
      );
      const scheduler = createWorkRecurrenceScheduler(
        database.db,
        transport.boss,
      );
      assert.equal(
        await scheduler.reconcile(new Date(start.getTime() - 1_000)),
        0,
      );
      const competing = await Promise.all([
        scheduler.reconcile(new Date(start.getTime() + 1_000)),
        scheduler.reconcile(new Date(start.getTime() + 1_000)),
      ]);
      assert.equal(
        competing.reduce((sum, count) => sum + count, 0),
        1,
      );
      const firstPage = await recurrence.listOccurrences(original.id, {
        limit: 1,
      });
      assert.equal(firstPage.items.length, 1);
      assert.equal(firstPage.items[0]?.scheduledFor, start.toISOString());
      assert.equal(firstPage.items[0]?.state, "queued");
      assert.equal(
        (await recurrence.getDefinitionById(definition.id))?.updatedAt,
        definition.updatedAt,
        "worker scheduling must not invalidate the user's edit revision",
      );
      const processor = createWorkRecurrenceProcessor(recurrence);
      const job = {
        version: 1 as const,
        occurrenceId: firstPage.items[0]!.id,
        definitionId: definition.id,
      };
      const generated = await processor(job);
      assert.equal(generated.state, "generated");
      assert.equal(generated.sourceLabel, "Local worker-created task");
      assert.deepEqual(generated.externalActions, []);
      assert.ok(generated.generatedWorkItemId);
      assert.equal(
        (await processor(job)).generatedWorkItemId,
        generated.generatedWorkItemId,
      );
      const [createdTask] = await database.db
        .select()
        .from(schema.workItem)
        .where(eq(schema.workItem.id, generated.generatedWorkItemId!));
      assert.equal(createdTask?.generatedFromWorkItemId, original.id);
      assert.equal(createdTask?.sourceCaptureId, sourceCapture.id);
      assert.equal(createdTask?.projectId, project.id);
      assert.equal(createdTask?.title, original.title);
      assert.equal(createdTask?.assigneeKind, "unassigned");
      assert.equal(createdTask?.dueOn, start.toISOString().slice(0, 10));
      await assert.rejects(
        database.pool.query(
          "update work_item set generated_from_work_item_id = null where id = $1",
          [createdTask!.id],
        ),
        /Generated Work source is immutable/,
      );
      const unrelatedCapture = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Unrelated source",
      });
      await assert.rejects(
        database.pool.query(
          "insert into work_item (id, project_id, source_capture_id, generated_from_work_item_id, title, description) values ($1, $2, $3, $4, $5, $6)",
          [
            crypto.randomUUID(),
            project.id,
            unrelatedCapture.id,
            original.id,
            "Forged generated task",
            "Wrong capture",
          ],
        ),
        /Generated Work must keep its original task, project, and capture/,
      );
      await assert.rejects(
        database.pool.query(
          "update work_recurrence_definition set project_id = $1 where id = $2",
          [crypto.randomUUID(), definition.id],
        ),
        /Recurring Work source and identity are immutable/,
      );
      const brief = await createProjectBriefService(
        createBriefRepository(database.db),
      ).getBrief(project.id);
      const briefFact = brief?.sections.work.items.find(
        (item) => item.id === createdTask!.id,
      );
      assert.ok(
        briefFact?.detail.includes("Local worker-created recurring task"),
      );
      assert.equal(briefFact?.sourceLabel, "Local worker-created task");
      assert.ok(
        briefFact?.evidence.some(
          (reference) =>
            reference.kind === "work_recurrence_occurrence" &&
            reference.id === generated.id &&
            reference.href ===
              `/api/v1/work-recurrence-occurrences/${generated.id}`,
        ),
      );
      const packet = await createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      ).create(createdTask!.id, {
        selectedKnowledgeIds: [],
        selectedResourceIds: [],
      });
      assert.ok(
        packet.snapshot.objective.evidence.some(
          (reference) =>
            reference.kind === "work_item" &&
            reference.id === original.id &&
            reference.sourceLabel ===
              "Original recurring Work definition source",
        ),
      );
      assert.equal(
        (await captures.getCapture(sourceCapture.id))?.originalContent,
        "Original recurring inspection note",
      );
      await createWorkItemStatusRepository(database.db).changeStatus(
        createdTask!.id,
        { expectedStatus: "open", status: "done" },
      );
      await assert.rejects(
        recurrence.createDefinition(createdTask!.id, {
          startAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          everyMinutes: 5,
        }),
        { code: "RECURRENCE_INVALID_SOURCE" },
      );

      const late = new Date(start.getTime() + 16 * 60_000);
      assert.equal(await scheduler.reconcile(late), 1);
      assert.equal(await scheduler.reconcile(late), 0);
      const latest = await recurrence.listOccurrences(original.id, {
        limit: 1,
      });
      assert.equal(
        latest.items[0]?.scheduledFor,
        new Date(start.getTime() + 15 * 60_000).toISOString(),
      );
      assert.ok(latest.nextCursor);
      assert.equal(
        (
          await recurrence.listOccurrences(original.id, {
            limit: 1,
            cursor: latest.nextCursor!,
          })
        ).items[0]?.id,
        generated.id,
      );
      const events = await recurrence.listAudit(original.id, { limit: 20 });
      assert.ok(
        events.items.some(
          (event) =>
            event.operation === "work.recurrence.occurrences_skipped" &&
            event.details.count === 2,
        ),
      );
      assert.ok(
        events.items.some(
          (event) =>
            event.operation === "work.recurrence.occurrence_generated" &&
            event.details.generatedWorkItemId === generated.generatedWorkItemId,
        ),
      );
      await assert.rejects(
        database.pool.query(
          "delete from work_recurrence_audit_event where id = $1",
          [events.items[0]!.id],
        ),
        /Recurring Work audit history is immutable/,
      );
      const paused = await recurrence.updateDefinition(original.id, {
        expectedUpdatedAt: definition.updatedAt,
        startAt: definition.startAt,
        everyMinutes: 5,
        enabled: false,
      });
      assert.equal(paused.enabled, false);
      assert.equal(
        await scheduler.reconcile(new Date(late.getTime() + 30 * 60_000)),
        0,
      );
      const resumed = await recurrence.updateDefinition(original.id, {
        expectedUpdatedAt: paused.updatedAt,
        startAt: definition.startAt,
        everyMinutes: 5,
        enabled: true,
      });
      assert.equal(resumed.enabled, true);
      assert.ok(new Date(resumed.nextOccurrenceAt) > new Date());
    } finally {
      await transport.close();
      await database.close();
    }
  },
);
