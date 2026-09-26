import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createLocalAutomationProcessor,
  createProjectBriefService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createLocalAutomationRepository } from "./local-automation-repository";
import { migrateDatabase } from "./migrate";
import { createNotificationRepository } from "./notification-repository";
import { automationDefinition, automationRun } from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "local automation worker reads one project, persists evidence and attempts, and skips disabled work",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const project = await createCatalogRepository(database.db).createProject({
        id: crypto.randomUUID(),
        name: "Automation test project",
      });
      const other = await createCatalogRepository(database.db).createProject({
        id: crypto.randomUUID(),
        name: "Other automation project",
      });
      const definitionId = crypto.randomUUID();
      await database.db.insert(automationDefinition).values({
        id: definitionId,
        projectId: project.id,
        name: "Project snapshot",
        enabled: true,
      });
      const runId = crypto.randomUUID();
      await database.db.insert(automationRun).values({
        id: runId,
        definitionId,
        projectId: project.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "on_creation",
      });
      const repository = createLocalAutomationRepository(database.db);
      const briefService = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const processor = createLocalAutomationProcessor(
        repository,
        briefService,
      );
      const completed = await processor({ version: 1, runId, definitionId });
      assert.equal(completed.state, "succeeded");
      assert.equal(completed.attempts, 1);
      assert.equal(completed.result?.sourceLabel, "Synthetic local automation");
      assert.equal(completed.result?.verificationStatus, "unverified");
      assert.deepEqual(completed.result?.externalActions, []);
      assert.deepEqual(
        completed.result?.evidence.map((item) => item.id),
        [project.id],
      );
      assert.equal(
        completed.result?.evidence.some((item) => item.id === other.id),
        false,
      );
      assert.deepEqual(
        await processor({ version: 1, runId, definitionId }),
        completed,
      );
      assert.equal(
        (await repository.listAttempts(runId, { limit: 10 })).items.length,
        1,
      );
      const operations = (
        await repository.listAudit(definitionId, { limit: 10 })
      ).items.map((event) => event.operation);
      assert.ok(operations.includes("automation.project_brief_read"));
      assert.ok(operations.includes("automation.run_succeeded"));

      const retryId = crypto.randomUUID();
      await database.db.insert(automationRun).values({
        id: retryId,
        definitionId,
        projectId: project.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "manual",
      });
      const firstAttempt = await repository.beginAttempt(retryId);
      assert.ok(firstAttempt);
      await repository.failAttempt(retryId, firstAttempt);
      const failedNotice = (
        await createNotificationRepository(database.db).list({
          limit: 10,
          view: "active",
          projectId: project.id,
        })
      ).items.find((item) => item.kind === "automation_failure");
      assert.ok(failedNotice);
      assert.equal(failedNotice.sourceLabel, "Synthetic local automation");
      const retried = await processor({
        version: 1,
        runId: retryId,
        definitionId,
      });
      assert.equal(retried.state, "succeeded");
      assert.equal(retried.attempts, 2);
      assert.equal(
        await createNotificationRepository(database.db).getById(
          failedNotice.id,
        ),
        null,
      );
      const seenAttempts: number[] = [];
      let cursor: string | null = null;
      do {
        const page = await repository.listAttempts(retryId, {
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        seenAttempts.push(...page.items.map((item) => item.ordinal));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(new Set(seenAttempts), new Set([1, 2]));

      const disabledId = crypto.randomUUID();
      await database.db.insert(automationDefinition).values({
        id: disabledId,
        projectId: other.id,
        name: "Disabled snapshot",
        enabled: false,
      });
      const skippedId = crypto.randomUUID();
      await database.db.insert(automationRun).values({
        id: skippedId,
        definitionId: disabledId,
        projectId: other.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "on_creation",
      });
      const skipped = await createLocalAutomationProcessor(repository, {
        getBrief: async () => {
          throw new Error("Disabled routine must not read");
        },
      })({ version: 1, runId: skippedId, definitionId: disabledId });
      assert.equal(skipped.state, "skipped");
      assert.equal(skipped.attempts, 0);
      assert.equal(
        (await repository.listAttempts(skippedId, { limit: 10 })).items.length,
        0,
      );
      assert.ok(
        (await repository.listAudit(disabledId, { limit: 10 })).items.some(
          (event) => event.operation === "automation.run_skipped",
        ),
      );

      const runIds: string[] = [];
      cursor = null;
      do {
        const page = await repository.listRuns(definitionId, {
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        runIds.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(new Set(runIds), new Set([runId, retryId]));
    } finally {
      await database.close();
    }
  },
);
