import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  localReleasePreflightSchema,
  type LocalReleasePreflight,
} from "@commandry/contracts";
import { createLocalReleasePreflightService } from "@commandry/application";
import { createDatabase, type CommandryDatabase } from "./client";
import {
  createLocalReleasePreflightRepository,
  LocalReleasePreflightCursorError,
} from "./local-release-preflight-repository";
import { migrateDatabase } from "./migrate";
import * as schema from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

const checks: LocalReleasePreflight["checks"] = {
  postgresHealthy: true,
  webHealthy: true,
  workerHealthy: true,
  migrationExited: true,
  revisionKnown: true,
  sameImage: true,
  versionReachable: true,
  apiRead: true,
  heartbeatFresh: true,
  localEvidence: true,
};

test("local Compose preflight is evidence-linked, immutable, and cursor-paged", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  const client = await database.pool.connect();
  await client.query("begin");
  const transactionDb = drizzle({
    client,
    schema,
  }) as unknown as CommandryDatabase;
  try {
    const backupId = crypto.randomUUID();
    const recoveryId = crypto.randomUUID();
    const releaseId = crypto.randomUUID();
    const failedBackupId = crypto.randomUUID();
    const passedId = crypto.randomUUID();
    const failedId = crypto.randomUUID();
    const firstTime = new Date("2031-09-27T08:00:00.000Z");
    const laterTime = new Date("2031-09-27T09:00:00.000Z");
    const sourceDigest = "c".repeat(64);
    await client.query(
      `insert into local_backup_evidence
       (id, outcome, archive_sha256, archive_bytes, source_schema_table_count,
        restored_schema_table_count, started_at, completed_at)
       values ($1, 'passed', $2, 100, 1, 1, $3, $3),
              ($4, 'failed', null, 0, 0, 0, $3, $3)`,
      [backupId, "a".repeat(64), firstTime, failedBackupId],
    );
    await client.query(
      `insert into local_recovery_drill
       (id, outcome, source_schema_table_count, restored_schema_table_count,
        source_capture_sha256, restored_capture_sha256, backup_sha256,
        started_at, completed_at)
       values ($1, 'passed', 1, 1, $2, $2, $3, $4, $4)`,
      [recoveryId, sourceDigest, "d".repeat(64), firstTime],
    );
    await client.query(
      `insert into local_release_rehearsal
       (id, outcome, previous_revision, candidate_revision, previous_image_id,
        candidate_image_id, source_schema_table_count, isolated_schema_table_count,
        initial_web_verified, initial_worker_verified, candidate_web_verified,
        candidate_worker_verified, rollback_web_verified, rollback_worker_verified,
        started_at, completed_at)
       values ($1, 'passed', $2, $3, $4, $5, 1, 1,
               true, true, true, true, true, true, $6, $6)`,
      [
        releaseId,
        "a".repeat(40),
        "b".repeat(40),
        `sha256:${"a".repeat(64)}`,
        `sha256:${"b".repeat(64)}`,
        firstTime,
      ],
    );
    async function insertPreflight(input: {
      id: string;
      outcome: "passed" | "failed";
      evidenceId: string | null;
      heartbeatFresh: boolean;
      at: Date;
    }) {
      await client.query(
        `insert into local_release_preflight
         (id, outcome, checkout_revision, image_id, version_sha, checks,
          backup_evidence_id, recovery_evidence_id, release_evidence_id,
          error_code, started_at, completed_at)
         values ($1, $2, $3, $4, 'campaign', $5, $6, $7, $8, $9, $10, $10)`,
        [
          input.id,
          input.outcome,
          "e".repeat(40),
          `sha256:${"f".repeat(64)}`,
          JSON.stringify({ ...checks, heartbeatFresh: input.heartbeatFresh }),
          input.evidenceId,
          recoveryId,
          releaseId,
          input.heartbeatFresh ? null : "WORKER_HEARTBEAT_STALE",
          input.at,
        ],
      );
    }
    await insertPreflight({
      id: passedId,
      outcome: "passed",
      evidenceId: backupId,
      heartbeatFresh: true,
      at: firstTime,
    });
    await insertPreflight({
      id: failedId,
      outcome: "failed",
      evidenceId: backupId,
      heartbeatFresh: false,
      at: laterTime,
    });
    const repository = createLocalReleasePreflightRepository(transactionDb);
    const service = createLocalReleasePreflightService(repository);
    const firstPage = await service.list({ limit: 1 });
    assert.equal(firstPage.items[0]?.id, failedId);
    assert.equal(firstPage.nextCursor, failedId);
    const secondPage = await service.list({ limit: 1, cursor: failedId });
    assert.equal(secondPage.items[0]?.id, passedId);
    assert.equal(secondPage.nextCursor, null);
    assert.equal((await service.get(passedId))?.checks.apiRead, true);
    assert.equal(
      localReleasePreflightSchema.parse(await service.get(passedId))
        .backupEvidenceId,
      backupId,
    );
    await assert.rejects(
      service.list({ limit: 1, cursor: crypto.randomUUID() }),
      LocalReleasePreflightCursorError,
    );
    async function rejectsWithoutAborting(action: () => Promise<unknown>) {
      await client.query("savepoint expected_failure");
      await assert.rejects(action(), { code: "23514" });
      await client.query("rollback to savepoint expected_failure");
    }
    await rejectsWithoutAborting(() =>
      client.query(
        "update local_release_preflight set outcome = 'failed' where id = $1",
        [passedId],
      ),
    );
    await rejectsWithoutAborting(() =>
      client.query("delete from local_release_preflight where id = $1", [
        passedId,
      ]),
    );
    await rejectsWithoutAborting(() =>
      insertPreflight({
        id: crypto.randomUUID(),
        outcome: "passed",
        evidenceId: backupId,
        heartbeatFresh: false,
        at: laterTime,
      }),
    );
    await rejectsWithoutAborting(() =>
      insertPreflight({
        id: crypto.randomUUID(),
        outcome: "passed",
        evidenceId: failedBackupId,
        heartbeatFresh: true,
        at: laterTime,
      }),
    );
  } finally {
    await client.query("rollback");
    client.release();
    await database.pool.end();
  }
});
