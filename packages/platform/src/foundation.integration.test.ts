import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  createDatabase,
  createSyntheticRunRepository,
  migrateDatabase,
  schema,
} from "@commandry/db";
import {
  createPgBossProducer,
  createSyntheticRunSubmission,
  installPgBossSchema,
  SYNTHETIC_DEAD_LETTER_QUEUE,
  SYNTHETIC_QUEUE,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!adminUrl) throw new Error("Run this file through pnpm test:integration");

const runtimeRole = "commandry_app_integration";
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!runtimePassword)
  throw new Error("Integration runtime password was not supplied");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = runtimeRole;
runtimeUrl.password = runtimePassword;

test(
  "PostgreSQL 18 migration, transactional jobs, and run idempotency",
  { timeout: 120_000 },
  async (t) => {
    const admin = new Pool({ connectionString: adminUrl, max: 2 });
    let runtime: ReturnType<typeof createDatabase> | undefined;
    let producer: Awaited<ReturnType<typeof createPgBossProducer>> | undefined;

    try {
      await t.test(
        "reviewed Drizzle migration is repeatable on PostgreSQL 18",
        async () => {
          const version = await admin.query<{ server_version: string }>(
            "SHOW server_version",
          );
          assert.match(version.rows[0]?.server_version ?? "", /^18\./);

          const migrationsDir = resolve(
            process.cwd(),
            "packages/db/migrations",
          );
          await migrateDatabase({ connectionString: adminUrl, migrationsDir });
          await migrateDatabase({ connectionString: adminUrl, migrationsDir });

          const tables = await admin.query<{ name: string }>(
            "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
          );
          for (const name of [
            "resource",
            "synthetic_run",
            "synthetic_run_attempt",
            "synthetic_run_effect",
            "audit_event",
          ]) {
            assert.ok(
              tables.rows.some((row) => row.name === name),
              `missing ${name}`,
            );
          }
          const migrationCount = await admin.query<{ count: string }>(
            "SELECT count(*) AS count FROM drizzle.__drizzle_migrations",
          );
          const journal = JSON.parse(
            readFileSync(resolve(migrationsDir, "meta/_journal.json"), "utf8"),
          ) as { entries: unknown[] };
          assert.equal(
            Number(migrationCount.rows[0]?.count),
            journal.entries.length,
          );
        },
      );

      await t.test(
        "runtime role can enqueue without schema migration rights",
        async () => {
          await admin.query(
            `CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}'`,
          );
          await admin.query(
            `GRANT CONNECT ON DATABASE commandry_integration TO ${runtimeRole}`,
          );
          await admin.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`);
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtimeRole}`,
          );
          await admin.query(
            `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${runtimeRole}`,
          );

          await installPgBossSchema({
            connectionString: adminUrl,
            runtimeRole,
          });
          runtime = createDatabase({
            connectionString: runtimeUrl.toString(),
            max: 2,
          });
          producer = await createPgBossProducer({
            connectionString: runtimeUrl.toString(),
            max: 2,
          });

          await assert.rejects(
            runtime.pool.query(
              "CREATE TABLE commandry_runtime_must_not_create (id integer)",
            ),
            (error: unknown) =>
              error instanceof Error &&
              "code" in error &&
              error.code === "42501",
          );
        },
      );

      await t.test(
        "pg-boss retries a failing job and copies it to the dead-letter queue",
        async () => {
          assert.ok(producer);
          const queue = await admin.query<{
            retry_limit: number;
            retry_delay: number;
            retry_backoff: boolean;
            dead_letter: string;
          }>(
            "SELECT retry_limit, retry_delay, retry_backoff, dead_letter FROM pgboss.queue WHERE name = $1",
            [SYNTHETIC_QUEUE],
          );
          assert.equal(queue.rows[0]?.retry_limit, 3);
          assert.equal(queue.rows[0]?.retry_delay, 1);
          assert.equal(queue.rows[0]?.retry_backoff, true);
          assert.equal(queue.rows[0]?.dead_letter, SYNTHETIC_DEAD_LETTER_QUEUE);

          const testKey = `deadletter-${crypto.randomUUID()}`;
          const jobId = await producer.boss.send(
            SYNTHETIC_QUEUE,
            { testKey },
            { retryLimit: 1, retryDelay: 0, retryBackoff: false },
          );
          assert.ok(jobId);
          let attempts = 0;
          const workerId = await producer.boss.work(
            SYNTHETIC_QUEUE,
            { pollingIntervalSeconds: 0.5 },
            async () => {
              attempts += 1;
              throw new Error("expected integration job failure");
            },
          );
          try {
            const deadline = Date.now() + 20_000;
            let deadLetters = 0;
            while (Date.now() < deadline) {
              const result = await admin.query<{ count: string }>(
                "SELECT count(*) AS count FROM pgboss.job WHERE name = $1 AND data->>'testKey' = $2",
                [SYNTHETIC_DEAD_LETTER_QUEUE, testKey],
              );
              deadLetters = Number(result.rows[0]?.count);
              if (deadLetters > 0) break;
              await delay(100);
            }
            assert.equal(deadLetters, 1);
            assert.equal(attempts, 2);
          } finally {
            await producer.boss.offWork(SYNTHETIC_QUEUE, { id: workerId });
          }

          const moved = await producer.boss.redrive(
            SYNTHETIC_DEAD_LETTER_QUEUE,
            {
              data: { testKey },
              limit: 1,
            },
          );
          assert.equal(moved, 1);
          const redriven = await admin.query<{ id: string }>(
            "SELECT id FROM pgboss.job WHERE name = $1 AND state = 'created' AND data->>'testKey' = $2",
            [SYNTHETIC_QUEUE, testKey],
          );
          assert.equal(redriven.rows.length, 1);
          await producer.boss.deleteJob(SYNTHETIC_QUEUE, redriven.rows[0]!.id);
        },
      );

      await t.test(
        "one occurrence commits one product row and one queue job",
        async () => {
          assert.ok(runtime && producer);
          const submission = createSyntheticRunSubmission(
            runtime.db,
            producer.boss,
          );
          const occurrenceId = `integration:${crypto.randomUUID()}`;
          const first = await submission.submitOnce(occurrenceId);
          const repeated = await submission.submitOnce(occurrenceId);
          assert.equal(repeated.id, first.id);

          const runs = await runtime.db
            .select()
            .from(schema.syntheticRun)
            .where(eq(schema.syntheticRun.occurrenceId, occurrenceId));
          assert.equal(runs.length, 1);
          const jobs = await admin.query<{
            data: { version: number; runId: string; occurrenceId: string };
            state: string;
          }>(
            "SELECT data, state FROM pgboss.job WHERE name = $1 AND data->>'occurrenceId' = $2",
            [SYNTHETIC_QUEUE, occurrenceId],
          );
          assert.equal(jobs.rows.length, 1);
          assert.deepEqual(jobs.rows[0]?.data, {
            version: 1,
            runId: first.id,
            occurrenceId,
          });
          assert.equal(jobs.rows[0]?.state, "created");
          const queuedAudit = await admin.query<{ count: string }>(
            "SELECT count(*) AS count FROM audit_event WHERE target_run_id = $1 AND operation = 'synthetic_run.queued'",
            [first.id],
          );
          assert.equal(Number(queuedAudit.rows[0]?.count), 1);

          const unavailableBoss = {
            send: async () => {
              throw new Error("simulated queue failure");
            },
          } as unknown as PgBoss;
          const failedOccurrence = `integration:rollback:${crypto.randomUUID()}`;
          await assert.rejects(
            createSyntheticRunSubmission(
              runtime.db,
              unavailableBoss,
            ).submitOnce(failedOccurrence),
            /simulated queue failure/,
          );
          const rolledBack = await runtime.db
            .select()
            .from(schema.syntheticRun)
            .where(eq(schema.syntheticRun.occurrenceId, failedOccurrence));
          assert.equal(rolledBack.length, 0);

          const repository = createSyntheticRunRepository(runtime.db);
          const failedAttempt = await repository.beginAttempt(first.id);
          assert.ok(failedAttempt);
          await repository.failAttempt(first.id, failedAttempt);
          const retryAttempt = await repository.beginAttempt(first.id);
          assert.ok(retryAttempt);
          const completed = await repository.completeAttempt(
            first.id,
            retryAttempt,
            "effect-one",
          );
          assert.equal(completed.result, "effect-one");
          const repeatedCompletion = await repository.completeAttempt(
            first.id,
            retryAttempt,
            "effect-two",
          );
          assert.equal(repeatedCompletion.result, "effect-one");
          assert.equal(await repository.beginAttempt(first.id), null);

          const effects = await runtime.db
            .select()
            .from(schema.syntheticRunEffect)
            .where(eq(schema.syntheticRunEffect.runId, first.id));
          assert.equal(effects.length, 1);
          const attempts = await runtime.db
            .select()
            .from(schema.syntheticRunAttempt)
            .where(eq(schema.syntheticRunAttempt.runId, first.id));
          assert.equal(attempts.length, 2);
          const successAudit = await admin.query<{ count: string }>(
            "SELECT count(*) AS count FROM audit_event WHERE target_run_id = $1 AND operation = 'synthetic_run.succeeded'",
            [first.id],
          );
          assert.equal(Number(successAudit.rows[0]?.count), 1);
        },
      );

      await t.test(
        "an audit failure rolls back the row and already-enqueued job",
        async () => {
          assert.ok(runtime && producer);
          await admin.query(`
        CREATE FUNCTION commandry_test_reject_queue_audit() RETURNS trigger AS $$
        BEGIN
          IF NEW.operation = 'synthetic_run.queued' THEN
            RAISE EXCEPTION 'test audit failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
          await admin.query(`
        CREATE TRIGGER commandry_test_reject_queue_audit
        BEFORE INSERT ON audit_event
        FOR EACH ROW EXECUTE FUNCTION commandry_test_reject_queue_audit()
      `);

          const occurrenceId = `integration:audit-rollback:${crypto.randomUUID()}`;
          try {
            await assert.rejects(
              createSyntheticRunSubmission(
                runtime.db,
                producer.boss,
              ).submitOnce(occurrenceId),
              (error: unknown) =>
                error instanceof Error &&
                error.cause instanceof Error &&
                error.cause.message.includes("test audit failure"),
            );
            const runs = await admin.query<{ count: string }>(
              "SELECT count(*) AS count FROM synthetic_run WHERE occurrence_id = $1",
              [occurrenceId],
            );
            const jobs = await admin.query<{ count: string }>(
              "SELECT count(*) AS count FROM pgboss.job WHERE name = $1 AND data->>'occurrenceId' = $2",
              [SYNTHETIC_QUEUE, occurrenceId],
            );
            assert.equal(Number(runs.rows[0]?.count), 0);
            assert.equal(Number(jobs.rows[0]?.count), 0);
          } finally {
            await admin.query(
              "DROP TRIGGER commandry_test_reject_queue_audit ON audit_event",
            );
            await admin.query(
              "DROP FUNCTION commandry_test_reject_queue_audit()",
            );
          }
        },
      );
    } finally {
      if (producer) await producer.close();
      if (runtime) await runtime.close();
      await admin.end();
    }
  },
);
