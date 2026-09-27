import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createLocalAutomationProcessor,
  createProjectBriefService,
  createSyntheticEventImportProcessor,
  prepareSyntheticEventImport,
} from "@commandry/application";
import {
  createBriefRepository,
  createCatalogRepository,
  createDatabase,
  createLocalAutomationRepository,
  createSyntheticEventImportRepository,
  migrateDatabase,
} from "@commandry/db";
import {
  createLocalAutomationSubmission,
  createPgBossProducer,
  createSyntheticConditionAutomationReconciler,
  createSyntheticEventAutomationReconciler,
  createSyntheticEventImportSubmission,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "synthetic event automation links one source to one governed local run",
  { timeout: 90_000 },
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
      const catalog = createCatalogRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Synthetic event automation project",
      });
      const otherProject = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Other project",
      });
      const resource = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "service",
        name: "Synthetic monitor service",
      });
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: project.id,
        resourceId: resource.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: otherProject.id,
        resourceId: resource.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
      const submission = createLocalAutomationSubmission(
        database.db,
        transport.boss,
      );
      const definition = await submission.createDefinition({
        projectId: project.id,
        name: "Investigate synthetic monitor down",
        enabled: true,
        eventType: "monitor.down",
      });
      assert.equal(definition.triggerType, "synthetic_event");
      assert.equal(definition.eventType, "monitor.down");
      assert.equal(definition.nextRunAt, null);
      const automationRepository = createLocalAutomationRepository(database.db);
      assert.equal(
        (await automationRepository.listRuns(definition.id, { limit: 10 }))
          .items.length,
        0,
      );
      const eventRepository = createSyntheticEventImportRepository(database.db);
      const eventSubmission = createSyntheticEventImportSubmission(
        database.db,
        transport.boss,
      );
      const eventProcessor =
        createSyntheticEventImportProcessor(eventRepository);
      const reconciler = createSyntheticEventAutomationReconciler(
        database.db,
        transport.boss,
      );
      async function importEvent(input: {
        projectId: string;
        scenarioId: "operations.monitor-down" | "operations.monitor-recovered";
        sequence: number;
      }) {
        const queued = await eventSubmission.submitOnce(
          prepareSyntheticEventImport({
            occurrenceId: `event-automation:${crypto.randomUUID()}`,
            projectId: input.projectId,
            resourceId: resource.id,
            scenarioId: input.scenarioId,
            occurredAt: new Date(
              Date.UTC(2026, 8, 26, 12, input.sequence),
            ).toISOString(),
          }),
        );
        const completed = await eventProcessor({
          version: 1,
          runId: queued.id,
          occurrenceId: queued.occurrenceId,
        });
        assert.equal(completed.state, "succeeded");
        assert.ok(completed.eventId);
        return completed.eventId;
      }

      const firstEventId = await importEvent({
        projectId: project.id,
        scenarioId: "operations.monitor-down",
        sequence: 0,
      });
      const concurrent = await Promise.all([
        reconciler.reconcileEvent(firstEventId),
        reconciler.reconcileEvent(firstEventId),
      ]);
      assert.equal(concurrent[0]! + concurrent[1]!, 1);
      const firstRuns = (
        await automationRepository.listRuns(definition.id, { limit: 10 })
      ).items;
      assert.equal(firstRuns.length, 1);
      assert.equal(firstRuns[0]?.trigger, "synthetic_event");
      assert.equal(firstRuns[0]?.sourceEventId, firstEventId);
      assert.equal(firstRuns[0]?.state, "queued");

      const secondEventId = await importEvent({
        projectId: project.id,
        scenarioId: "operations.monitor-down",
        sequence: 1,
      });
      assert.equal(await reconciler.reconcileEvent(secondEventId), 1);
      const overlap = (
        await automationRepository.listRuns(definition.id, { limit: 10 })
      ).items.find((run) => run.sourceEventId === secondEventId);
      assert.equal(overlap?.state, "skipped");
      assert.match(overlap?.error ?? "", /Previous/);

      const processor = createLocalAutomationProcessor(
        automationRepository,
        createProjectBriefService(createBriefRepository(database.db)),
        eventRepository,
      );
      const completedRun = await processor({
        version: 1,
        runId: firstRuns[0]!.id,
        definitionId: definition.id,
      });
      assert.equal(completedRun.state, "succeeded");
      assert.equal(completedRun.result?.verificationStatus, "unverified");
      assert.deepEqual(completedRun.result?.externalActions, []);
      assert.ok(
        completedRun.result?.evidence.some(
          (item) =>
            item.kind === "event" &&
            item.id === firstEventId &&
            item.isSynthetic,
        ),
      );

      const recoveredId = await importEvent({
        projectId: project.id,
        scenarioId: "operations.monitor-recovered",
        sequence: 2,
      });
      assert.equal(await reconciler.reconcileEvent(recoveredId), 0);
      const otherEventId = await importEvent({
        projectId: otherProject.id,
        scenarioId: "operations.monitor-down",
        sequence: 3,
      });
      assert.equal(await reconciler.reconcileEvent(otherEventId), 0);

      await submission.setEnabled(definition.id, {
        expectedEnabled: true,
        enabled: false,
      });
      const disabledEventId = await importEvent({
        projectId: project.id,
        scenarioId: "operations.monitor-down",
        sequence: 4,
      });
      assert.equal(await reconciler.reconcileEvent(disabledEventId), 1);
      await submission.setEnabled(definition.id, {
        expectedEnabled: false,
        enabled: true,
      });
      assert.equal(await reconciler.reconcileEvent(disabledEventId), 0);
      const disabledRun = (
        await automationRepository.listRuns(definition.id, { limit: 10 })
      ).items.find((run) => run.sourceEventId === disabledEventId);
      assert.equal(disabledRun?.state, "skipped");
      assert.match(disabledRun?.error ?? "", /Disabled/);
      const audit = (
        await automationRepository.listAudit(definition.id, {
          limit: 30,
        })
      ).items;
      assert.ok(
        audit.some(
          (item) =>
            item.operation === "automation.run_queued" &&
            item.details.sourceEventId === firstEventId,
        ),
      );
      assert.ok(
        audit.some(
          (item) =>
            item.operation === "automation.project_brief_read" &&
            item.runId === completedRun.id,
        ),
      );
    } finally {
      await transport.close();
      await database.close();
    }
  },
);

test(
  "synthetic availability condition crosses once, retains exact metric evidence, and records skips",
  { timeout: 90_000 },
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
      const catalog = createCatalogRepository(database.db);
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Synthetic condition automation project",
      });
      const resource = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "service",
        name: "Synthetic condition service",
      });
      const submission = createLocalAutomationSubmission(
        database.db,
        transport.boss,
      );
      const condition = {
        resourceId: resource.id,
        metricName: "external_availability" as const,
        operator: "lte" as const,
        thresholdPercent: 50,
      };
      await assert.rejects(
        submission.createDefinition({
          projectId: project.id,
          name: "Unlinked condition",
          enabled: true,
          condition,
        }),
        { code: "AUTOMATION_INVALID_CONDITION" },
      );
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: project.id,
        resourceId: resource.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
      const definition = await submission.createDefinition({
        projectId: project.id,
        name: "Review synthetic availability drop",
        enabled: true,
        condition,
      });
      assert.equal(definition.triggerType, "synthetic_condition");
      assert.deepEqual(definition.condition, condition);
      const repository = createLocalAutomationRepository(database.db);
      const eventRepository = createSyntheticEventImportRepository(database.db);
      const eventSubmission = createSyntheticEventImportSubmission(
        database.db,
        transport.boss,
      );
      const eventProcessor =
        createSyntheticEventImportProcessor(eventRepository);
      const reconciler = createSyntheticConditionAutomationReconciler(
        database.db,
        transport.boss,
      );
      async function importSample(
        scenarioId: "operations.monitor-down" | "operations.monitor-recovered",
        sequence: number,
      ) {
        const queued = await eventSubmission.submitOnce(
          prepareSyntheticEventImport({
            occurrenceId: `condition-automation:${crypto.randomUUID()}`,
            projectId: project.id,
            resourceId: resource.id,
            scenarioId,
            occurredAt: new Date(
              Date.UTC(2026, 8, 26, 13, sequence),
            ).toISOString(),
          }),
        );
        const completed = await eventProcessor({
          version: 1,
          runId: queued.id,
          occurrenceId: queued.occurrenceId,
        });
        assert.equal(completed.state, "succeeded");
        assert.ok(completed.eventId);
        return completed.eventId;
      }
      const firstEvent = await importSample("operations.monitor-down", 0);
      const concurrent = await Promise.all([
        reconciler.reconcileEvent(firstEvent),
        reconciler.reconcileEvent(firstEvent),
      ]);
      assert.equal(concurrent[0]! + concurrent[1]!, 1);
      const [firstRun] = (
        await repository.listRuns(definition.id, { limit: 10 })
      ).items;
      assert.equal(firstRun?.state, "queued");
      assert.equal(firstRun?.trigger, "synthetic_condition");
      assert.equal(firstRun?.sourceEventId, firstEvent);
      assert.ok(firstRun?.sourceMetricSampleId);
      const sample = await eventRepository.getMetricSampleById(
        firstRun!.sourceMetricSampleId!,
      );
      assert.ok(sample);
      assert.equal(sample?.value, 0);
      assert.equal(sample?.eventId, firstEvent);
      const processor = createLocalAutomationProcessor(
        repository,
        createProjectBriefService(createBriefRepository(database.db)),
        eventRepository,
      );
      const completed = await processor({
        version: 1,
        runId: firstRun!.id,
        definitionId: definition.id,
      });
      assert.equal(completed.state, "succeeded");
      assert.match(completed.result?.summary ?? "", /at-or-below 50%/);
      assert.ok(
        completed.result?.evidence.some(
          (item) =>
            item.kind === "metric_sample" &&
            item.id === sample?.id &&
            item.href === `/api/v1/metrics/${sample.id}` &&
            item.isSynthetic,
        ),
      );
      assert.deepEqual(completed.result?.externalActions, []);
      const heldLow = await importSample("operations.monitor-down", 1);
      assert.equal(await reconciler.reconcileEvent(heldLow), 0);
      const recovered = await importSample("operations.monitor-recovered", 2);
      assert.equal(await reconciler.reconcileEvent(recovered), 0);
      const secondDrop = await importSample("operations.monitor-down", 3);
      assert.equal(await reconciler.reconcileEvent(secondDrop), 1);
      const secondRun = (
        await repository.listRuns(definition.id, { limit: 10 })
      ).items.find((run) => run.sourceEventId === secondDrop);
      assert.equal(secondRun?.state, "queued");
      const secondRecovery = await importSample(
        "operations.monitor-recovered",
        4,
      );
      assert.equal(await reconciler.reconcileEvent(secondRecovery), 0);
      const overlappingDrop = await importSample("operations.monitor-down", 5);
      assert.equal(await reconciler.reconcileEvent(overlappingDrop), 1);
      assert.equal(
        (await repository.listRuns(definition.id, { limit: 10 })).items.find(
          (run) => run.sourceEventId === overlappingDrop,
        )?.state,
        "skipped",
      );
      const thirdRecovery = await importSample(
        "operations.monitor-recovered",
        6,
      );
      assert.equal(await reconciler.reconcileEvent(thirdRecovery), 0);
      await submission.setEnabled(definition.id, {
        expectedEnabled: true,
        enabled: false,
      });
      const disabledDrop = await importSample("operations.monitor-down", 7);
      assert.equal(await reconciler.reconcileEvent(disabledDrop), 1);
      assert.equal(await reconciler.reconcileEvent(disabledDrop), 0);
      const disabledRun = (
        await repository.listRuns(definition.id, { limit: 10 })
      ).items.find((run) => run.sourceEventId === disabledDrop);
      assert.equal(disabledRun?.state, "skipped");
      assert.match(disabledRun?.error ?? "", /Disabled/);
      const audit = (await repository.listAudit(definition.id, { limit: 30 }))
        .items;
      assert.ok(
        audit.some(
          (item) =>
            item.operation === "automation.run_queued" &&
            item.details.metricSampleId === sample?.id,
        ),
      );
      assert.ok(
        audit.some(
          (item) =>
            item.operation === "automation.run_skipped" &&
            item.details.sourceEventId === overlappingDrop,
        ),
      );
    } finally {
      await transport.close();
      await database.close();
    }
  },
);
