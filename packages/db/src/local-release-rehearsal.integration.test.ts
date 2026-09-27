import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createDatabase } from "./client";
import {
  createLocalReleaseRehearsalRepository,
  LocalReleaseCursorError,
} from "./local-release-rehearsal-repository";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("local release and code rollback evidence is immutable and cursor-paged", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  try {
    const passedId = crypto.randomUUID();
    const failedId = crypto.randomUUID();
    const passedTime = new Date("2031-09-27T08:00:00.000Z");
    const failedTime = new Date("2031-09-27T09:00:00.000Z");
    await database.pool.query(
      `insert into local_release_rehearsal
       (id, outcome, previous_revision, candidate_revision, previous_image_id,
        candidate_image_id, source_schema_table_count, isolated_schema_table_count,
        source_capture_sha256, isolated_capture_sha256, initial_web_verified,
        initial_worker_verified, candidate_web_verified, candidate_worker_verified,
        rollback_web_verified, rollback_worker_verified, started_at, completed_at)
       values ($1, 'passed', $2, $3, $4, $5, 87, 87, $6, $6,
               true, true, true, true, true, true, $7, $7)`,
      [
        passedId,
        "a".repeat(40),
        "b".repeat(40),
        `sha256:${"a".repeat(64)}`,
        `sha256:${"b".repeat(64)}`,
        "c".repeat(64),
        passedTime,
      ],
    );
    await database.pool.query(
      `insert into local_release_rehearsal
       (id, outcome, error_code, started_at, completed_at)
       values ($1, 'failed', 'CANDIDATE_WORKER_VERIFY', $2, $2)`,
      [failedId, failedTime],
    );
    const repository = createLocalReleaseRehearsalRepository(database.db);
    const firstPage = await repository.list({ limit: 1 });
    assert.equal(firstPage.items[0]?.id, failedId);
    assert.equal(firstPage.nextCursor, failedId);
    const secondPage = await repository.list({ limit: 1, cursor: failedId });
    assert.equal(secondPage.items[0]?.id, passedId);
    assert.equal(secondPage.nextCursor, null);
    assert.equal(
      (await repository.getById(passedId))?.rollbackWebVerified,
      true,
    );
    await assert.rejects(
      repository.list({ limit: 1, cursor: crypto.randomUUID() }),
      LocalReleaseCursorError,
    );
    await assert.rejects(
      database.pool.query(
        "update local_release_rehearsal set outcome = 'failed' where id = $1",
        [passedId],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query("delete from local_release_rehearsal where id = $1", [
        passedId,
      ]),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query(
        `insert into local_release_rehearsal
         (id, outcome, previous_revision, candidate_revision, previous_image_id,
          candidate_image_id, source_schema_table_count, isolated_schema_table_count,
          initial_web_verified, initial_worker_verified, candidate_web_verified,
          candidate_worker_verified, rollback_web_verified, rollback_worker_verified,
          started_at, completed_at)
         values ($1, 'passed', $2, $3, $4, $5, 87, 87,
                 true, true, true, true, true, false, $6, $6)`,
        [
          crypto.randomUUID(),
          "a".repeat(40),
          "b".repeat(40),
          `sha256:${"a".repeat(64)}`,
          `sha256:${"b".repeat(64)}`,
          passedTime,
        ],
      ),
      { code: "23514" },
    );
  } finally {
    await database.pool.end();
  }
});
