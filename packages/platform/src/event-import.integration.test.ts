import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  createLocalIntegrationService,
  createSyntheticEventImportProcessor,
  prepareSyntheticEventImport,
} from "@commandry/application";
import { syntheticEventImportJobV1Schema } from "@commandry/contracts";
import {
  createDatabase,
  createLocalIntegrationRepository,
  createSyntheticEventImportRepository,
  schema,
} from "@commandry/db";
import { SyntheticEventImportConflictError } from "@commandry/domain";
import {
  createPgBossProducer,
  createSyntheticEventImportSubmission,
  SYNTHETIC_EVENT_IMPORT_QUEUE,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "synthetic import submission and worker projection are atomic and replay safe",
  { timeout: 120_000 },
  async (t) => {
    const admin = new Pool({ connectionString: adminUrl, max: 2 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 2,
    });
    const producer = await createPgBossProducer({
      connectionString: runtimeUrl.toString(),
      max: 2,
    });
    const submission = createSyntheticEventImportSubmission(
      runtime.db,
      producer.boss,
    );
    const repository = createSyntheticEventImportRepository(runtime.db);
    const processor = createSyntheticEventImportProcessor(repository);
    const projectId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();

    try {
      await runtime.db.insert(schema.project).values({
        id: projectId,
        name: "Synthetic event integration project",
      });
      await runtime.db.insert(schema.resource).values({
        id: resourceId,
        kind: "service",
        name: "Synthetic event integration service",
      });
      await runtime.db.insert(schema.projectResourceLink).values({
        id: crypto.randomUUID(),
        projectId,
        resourceId,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });

      const baseInput = {
        scenarioId: "operations.monitor-down" as const,
        projectId,
        resourceId,
        occurredAt: "2026-09-25T10:00:00.000Z",
      };
      const prepare = (key: string) =>
        prepareSyntheticEventImport({ ...baseInput, occurrenceId: key });
      const firstInput = prepare(`import-integration:${crypto.randomUUID()}`);

      await t.test(
        "one occurrence commits one import, envelope, job, and audit",
        async () => {
          const first = await submission.submitOnce(firstInput);
          const repeated = await submission.submitOnce(firstInput);
          assert.equal(first.id, repeated.id);
          assert.equal(first.state, "queued");
          assert.equal(first.isSynthetic, true);
          assert.equal(first.sourceLabel, "Synthetic operational fixture");

          const runs = await runtime.db
            .select()
            .from(schema.syntheticEventImport)
            .where(
              eq(
                schema.syntheticEventImport.occurrenceId,
                firstInput.occurrenceId,
              ),
            );
          const envelopes = await runtime.db
            .select()
            .from(schema.sourceEnvelope)
            .where(eq(schema.sourceEnvelope.importId, first.id));
          assert.equal(runs.length, 1);
          assert.equal(envelopes.length, 1);
          assert.equal(
            envelopes[0]?.rawPayload.scenarioId,
            firstInput.scenarioId,
          );
          assert.equal(envelopes[0]?.isSynthetic, true);
          assert.equal(
            envelopes[0]?.occurredAt.toISOString(),
            baseInput.occurredAt,
          );

          const jobs = await admin.query<{ data: Record<string, unknown> }>(
            "SELECT data FROM pgboss.job WHERE name = $1 AND data->>'occurrenceId' = $2",
            [SYNTHETIC_EVENT_IMPORT_QUEUE, firstInput.occurrenceId],
          );
          assert.equal(jobs.rows.length, 1);
          assert.deepEqual(jobs.rows[0]?.data, {
            version: 1,
            runId: first.id,
            occurrenceId: firstInput.occurrenceId,
          });
          const audits = await runtime.db
            .select()
            .from(schema.auditEvent)
            .where(eq(schema.auditEvent.targetImportId, first.id));
          assert.equal(audits.length, 1);
          assert.equal(audits[0]?.operation, "synthetic_event_import.queued");

          await assert.rejects(
            submission.submitOnce({
              ...firstInput,
              requestFingerprint: `${firstInput.requestFingerprint}:changed`,
            }),
            SyntheticEventImportConflictError,
          );
        },
      );

      await t.test(
        "queue failure rolls back import and original envelope",
        async () => {
          const input = prepare(`import-queue-fail:${crypto.randomUUID()}`);
          const unavailableBoss = {
            send: async () => {
              throw new Error("simulated import queue failure");
            },
          } as unknown as PgBoss;
          await assert.rejects(
            createSyntheticEventImportSubmission(
              runtime.db,
              unavailableBoss,
            ).submitOnce(input),
            /simulated import queue failure/,
          );
          const runs = await runtime.db
            .select()
            .from(schema.syntheticEventImport)
            .where(
              eq(schema.syntheticEventImport.occurrenceId, input.occurrenceId),
            );
          assert.equal(runs.length, 0);
          const envelopes = await runtime.db
            .select()
            .from(schema.sourceEnvelope)
            .where(
              eq(schema.sourceEnvelope.sourceEventId, input.sourceEventId),
            );
          assert.equal(envelopes.length, 0);
        },
      );

      await t.test(
        "audit failure rolls back the import, envelope, and queued job",
        async () => {
          await admin.query(`
          CREATE FUNCTION commandry_test_reject_import_audit() RETURNS trigger AS $$
          BEGIN
            IF NEW.operation = 'synthetic_event_import.queued' THEN
              RAISE EXCEPTION 'test import audit failure';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql
        `);
          await admin.query(`
          CREATE TRIGGER commandry_test_reject_import_audit
          BEFORE INSERT ON audit_event
          FOR EACH ROW EXECUTE FUNCTION commandry_test_reject_import_audit()
        `);
          const input = prepare(`import-audit-fail:${crypto.randomUUID()}`);
          try {
            await assert.rejects(
              submission.submitOnce(input),
              (error: unknown) =>
                error instanceof Error &&
                error.cause instanceof Error &&
                error.cause.message.includes("test import audit failure"),
            );
            const runs = await runtime.db
              .select()
              .from(schema.syntheticEventImport)
              .where(
                eq(
                  schema.syntheticEventImport.occurrenceId,
                  input.occurrenceId,
                ),
              );
            const envelopes = await runtime.db
              .select()
              .from(schema.sourceEnvelope)
              .where(
                eq(schema.sourceEnvelope.sourceEventId, input.sourceEventId),
              );
            const jobs = await admin.query<{ count: string }>(
              "SELECT count(*) AS count FROM pgboss.job WHERE name = $1 AND data->>'occurrenceId' = $2",
              [SYNTHETIC_EVENT_IMPORT_QUEUE, input.occurrenceId],
            );
            assert.equal(runs.length, 0);
            assert.equal(envelopes.length, 0);
            assert.equal(Number(jobs.rows[0]?.count), 0);
          } finally {
            await admin.query(
              "DROP TRIGGER commandry_test_reject_import_audit ON audit_event",
            );
            await admin.query(
              "DROP FUNCTION commandry_test_reject_import_audit()",
            );
          }
        },
      );

      await t.test(
        "failed processing preserves evidence and retry projects once",
        async () => {
          const run = await repository.getById(
            (await submission.submitOnce(firstInput)).id,
          );
          assert.ok(run);
          const job = {
            version: 1 as const,
            runId: run.id,
            occurrenceId: firstInput.occurrenceId,
          };
          const failing = createSyntheticEventImportProcessor(
            repository,
            async () => {
              throw new Error("injected normalization failure");
            },
          );
          await assert.rejects(failing(job), /injected normalization failure/);
          const afterFailure = await repository.getById(run.id);
          assert.equal(afterFailure?.state, "failed");
          const original = await runtime.db
            .select()
            .from(schema.sourceEnvelope)
            .where(eq(schema.sourceEnvelope.importId, run.id));
          assert.equal(original.length, 1);
          assert.equal(original[0]?.sourceEventId, firstInput.sourceEventId);

          await Promise.all([processor(job), processor(job)]);
          const completed = await repository.getById(run.id);
          assert.equal(completed?.state, "succeeded");
          const events = await runtime.db
            .select()
            .from(schema.normalizedEvent)
            .where(eq(schema.normalizedEvent.importId, run.id));
          assert.equal(events.length, 1);
          assert.equal(events[0]?.type, "monitor.down");
          const evidence = await runtime.db
            .select()
            .from(schema.alertEvidence)
            .where(eq(schema.alertEvidence.eventId, events[0]!.id));
          assert.equal(evidence.length, 1);
          const audits = await runtime.db
            .select()
            .from(schema.auditEvent)
            .where(eq(schema.auditEvent.targetImportId, run.id));
          assert.equal(
            audits.filter(
              (audit) => audit.operation === "synthetic_event_import.succeeded",
            ).length,
            1,
          );
          await processor(job);
          const attempts = await runtime.db
            .select()
            .from(schema.syntheticEventImportAttempt)
            .where(eq(schema.syntheticEventImportAttempt.importId, run.id));
          assert.ok(attempts.length >= 2);
          assert.equal(
            attempts.filter((attempt) => attempt.state === "failed").length,
            1,
          );
          const [linkedResource] = await runtime.db
            .select()
            .from(schema.resource)
            .where(eq(schema.resource.id, resourceId))
            .limit(1);
          assert.equal(linkedResource?.state, null);
          assert.equal(linkedResource?.lastObservedAt, null);
        },
      );

      await t.test(
        "configured local sources bind samples and expose worker-observed sync state",
        async () => {
          const instances = createLocalIntegrationRepository(runtime.db);
          const service = createLocalIntegrationService({
            ...instances,
            ...submission,
          });
          await assert.rejects(
            service.create({
              name: "Invalid operational source",
              kind: "synthetic-operations",
              projectId,
              resourceId: null,
            }),
            { code: "RESOURCE_REQUIRED" },
          );
          const development = await service.create({
            name: "Local repository fixture",
            kind: "synthetic-development",
            projectId,
            resourceId: null,
          });
          const operations = await service.create({
            name: "Local uptime fixture",
            kind: "synthetic-operations",
            projectId,
            resourceId,
          });
          assert.equal(operations.adapterMode, "local_fixture");
          assert.equal(operations.isSynthetic, true);
          assert.equal(operations.lastAttemptAt, null);
          const firstPage = await service.list({ limit: 1, projectId });
          assert.equal(firstPage.items.length, 1);
          assert.ok(firstPage.nextCursor);
          const secondPage = await service.list({
            limit: 1,
            projectId,
            cursor: firstPage.nextCursor,
          });
          assert.equal(secondPage.items.length, 1);
          assert.notEqual(firstPage.items[0]?.id, secondPage.items[0]?.id);

          const occurrenceId = `integration-sample:${crypto.randomUUID()}`;
          const sample = {
            scenarioId: "operations.monitor-down" as const,
            occurrenceId,
            occurredAt: "2026-09-25T09:59:00.000Z",
          };
          const queued = await service.submitSample(operations.id, sample);
          const replay = await service.submitSample(operations.id, sample);
          assert.equal(replay.id, queued.id);
          assert.equal(queued.integrationInstanceId, operations.id);
          assert.equal(
            (await service.get(operations.id))?.latestImportId,
            queued.id,
          );
          await assert.rejects(service.submitSample(development.id, sample), {
            code: "SCENARIO_MISMATCH",
          });
          const finished = await processor({
            version: 1,
            runId: queued.id,
            occurrenceId,
          });
          assert.equal(finished.state, "succeeded");
          const observed = await service.get(operations.id);
          assert.ok(observed?.lastAttemptAt);
          assert.ok(observed?.lastSuccessAt);
          assert.equal(observed.lastError, null);
          assert.equal(observed.nextAttemptAt, null);
          const disabled = await service.setEnabled(operations.id, false);
          assert.equal(disabled.enabled, false);
          await assert.rejects(
            service.submitSample(operations.id, {
              ...sample,
              occurrenceId: `disabled:${crypto.randomUUID()}`,
            }),
            { code: "INTEGRATION_DISABLED" },
          );
          const audits = await instances.listAudit(operations.id, {
            limit: 10,
          });
          assert.deepEqual(
            audits.items.map((entry) => entry.operation),
            ["integration.disabled", "integration.created"],
          );
        },
      );

      await t.test(
        "pg-boss worker consumes a versioned recovery job",
        async () => {
          const input = prepareSyntheticEventImport({
            scenarioId: "operations.monitor-recovered",
            projectId,
            resourceId,
            occurrenceId: `import-recovery:${crypto.randomUUID()}`,
            occurredAt: "2026-09-25T10:01:00.000Z",
          });
          const run = await submission.submitOnce(input);
          const workerId = await producer.boss.work(
            SYNTHETIC_EVENT_IMPORT_QUEUE,
            { pollingIntervalSeconds: 0.5 },
            async ([job]) => {
              if (!job) throw new Error("pg-boss delivered no import job");
              await processor(syntheticEventImportJobV1Schema.parse(job.data));
            },
          );
          try {
            const deadline = Date.now() + 20_000;
            let completed = await repository.getById(run.id);
            while (completed?.state !== "succeeded" && Date.now() < deadline) {
              await delay(100);
              completed = await repository.getById(run.id);
            }
            assert.equal(completed?.state, "succeeded");
            const event = await runtime.db
              .select()
              .from(schema.normalizedEvent)
              .where(eq(schema.normalizedEvent.importId, run.id));
            assert.equal(event[0]?.type, "monitor.recovered");
            const alerts = await runtime.db
              .select()
              .from(schema.alertCondition)
              .where(eq(schema.alertCondition.resourceId, resourceId));
            assert.equal(alerts.length, 1);
            assert.equal(alerts[0]?.state, "resolved");
            const [linkedResource] = await runtime.db
              .select()
              .from(schema.resource)
              .where(eq(schema.resource.id, resourceId))
              .limit(1);
            assert.equal(linkedResource?.state, null);
            assert.equal(linkedResource?.lastObservedAt, null);
          } finally {
            await producer.boss.offWork(SYNTHETIC_EVENT_IMPORT_QUEUE, {
              id: workerId,
            });
          }
        },
      );
    } finally {
      await producer.close();
      await runtime.close();
      await admin.end();
    }
  },
);
