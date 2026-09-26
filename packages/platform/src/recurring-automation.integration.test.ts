import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createBriefRepository,
  createCatalogRepository,
  createDatabase,
  createLocalAutomationRepository,
  migrateDatabase,
  schema,
} from "@commandry/db";
import {
  createLocalAutomationProcessor,
  createProjectBriefService,
} from "@commandry/application";
import {
  createLocalAutomationSubmission,
  createPgBossProducer,
  createRecurringAutomationScheduler,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "recurring local summaries materialize one latest due occurrence with replay and overlap safety",
  { timeout: 60_000 },
  async () => {
    await migrateDatabase({
      connectionString: adminUrl,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 3,
    });
    const transport = await createPgBossProducer({
      connectionString: runtimeUrl.toString(),
      max: 2,
    });
    try {
      const project = await createCatalogRepository(database.db).createProject({
        id: crypto.randomUUID(),
        name: "Recurring local summary project",
      });
      const start = new Date(Date.now() + 5 * 60_000);
      const submission = createLocalAutomationSubmission(
        database.db,
        transport.boss,
      );
      const definition = await submission.createDefinition({
        projectId: project.id,
        name: "Bounded recurring summary",
        enabled: true,
        recurrence: { startAt: start.toISOString(), everyMinutes: 5 },
      });
      assert.equal(definition.triggerType, "recurring_interval");
      assert.equal(definition.nextRunAt, start.toISOString());
      const repository = createLocalAutomationRepository(database.db);
      assert.equal(
        (await repository.listRuns(definition.id, { limit: 10 })).items.length,
        0,
      );
      const scheduler = createRecurringAutomationScheduler(
        database.db,
        transport.boss,
      );
      assert.equal(
        await scheduler.reconcile(new Date(start.getTime() - 1_000)),
        0,
      );
      const first = await Promise.all([
        scheduler.reconcile(new Date(start.getTime() + 1_000)),
        scheduler.reconcile(new Date(start.getTime() + 1_000)),
      ]);
      assert.equal(
        first.reduce((sum, count) => sum + count, 0),
        1,
      );
      const firstRuns = (
        await repository.listRuns(definition.id, { limit: 10 })
      ).items;
      assert.equal(firstRuns.length, 1);
      assert.equal(firstRuns[0]?.trigger, "recurring");
      assert.equal(firstRuns[0]?.scheduledFor, start.toISOString());
      assert.equal(firstRuns[0]?.state, "queued");
      assert.equal(
        (await repository.getDefinition(definition.id))?.nextRunAt,
        new Date(start.getTime() + 5 * 60_000).toISOString(),
      );
      const processor = createLocalAutomationProcessor(
        repository,
        createProjectBriefService(createBriefRepository(database.db)),
      );
      const completed = await processor({
        version: 1,
        runId: firstRuns[0]!.id,
        definitionId: definition.id,
      });
      assert.equal(completed.state, "succeeded");
      assert.equal(completed.result?.isSynthetic, true);
      assert.deepEqual(completed.result?.externalActions, []);

      const late = new Date(start.getTime() + 16 * 60_000);
      assert.equal(await scheduler.reconcile(late), 1);
      assert.equal(await scheduler.reconcile(late), 0);
      const afterCatchup = (
        await repository.listRuns(definition.id, { limit: 10 })
      ).items;
      assert.equal(afterCatchup.length, 2);
      const catchup = afterCatchup.find((run) => run.id !== completed.id);
      assert.equal(
        catchup?.scheduledFor,
        new Date(start.getTime() + 15 * 60_000).toISOString(),
      );
      assert.equal(catchup?.state, "queued");
      const audit = (await repository.listAudit(definition.id, { limit: 20 }))
        .items;
      assert.ok(
        audit.some(
          (event) =>
            event.operation === "automation.occurrences_skipped" &&
            event.details.count === 2,
        ),
      );
      assert.equal(
        await scheduler.reconcile(new Date(start.getTime() + 21 * 60_000)),
        1,
      );
      const withOverlap = (
        await repository.listRuns(definition.id, { limit: 10 })
      ).items;
      assert.equal(withOverlap.length, 3);
      assert.ok(
        withOverlap.some(
          (run) =>
            run.trigger === "recurring" &&
            run.state === "skipped" &&
            run.error?.includes("Previous"),
        ),
      );

      await database.db
        .update(schema.automationDefinition)
        .set({ enabled: false })
        .where(eq(schema.automationDefinition.id, definition.id));
      assert.equal(
        await scheduler.reconcile(new Date(start.getTime() + 26 * 60_000)),
        0,
      );
      assert.equal(
        (await repository.listRuns(definition.id, { limit: 10 })).items.length,
        3,
      );
    } finally {
      await transport.close();
      await database.close();
    }
  },
);
