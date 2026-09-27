import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createDatabase } from "./client";
import { createLocalRecoveryRepository } from "./local-recovery-repository";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("local restore evidence is immutable and every drill remains reachable", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  try {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const firstTime = new Date("2026-09-26T08:00:00.000Z");
    const secondTime = new Date("2026-09-26T09:00:00.000Z");
    await database.pool.query(
      `INSERT INTO local_recovery_drill
       (id, outcome, source_schema_table_count, restored_schema_table_count,
        source_capture_sha256, restored_capture_sha256, backup_sha256,
        started_at, completed_at)
       VALUES ($1, 'passed', 77, 77, $2, $2, $3, $4, $4)`,
      [firstId, "a".repeat(64), "b".repeat(64), firstTime],
    );
    await database.pool.query(
      `INSERT INTO local_recovery_drill
       (id, outcome, error_code, started_at, completed_at)
       VALUES ($1, 'failed', 'BACKUP_RESTORE', $2, $2)`,
      [secondId, secondTime],
    );
    const repository = createLocalRecoveryRepository(database.db);
    assert.equal((await repository.latest())?.id, secondId);
    const firstPage = await repository.list({ limit: 1 });
    assert.equal(firstPage.items[0]?.id, secondId);
    assert.equal(firstPage.nextCursor, secondId);
    const cursor = firstPage.nextCursor;
    assert.ok(cursor);
    const secondPage = await repository.list({
      limit: 1,
      cursor,
    });
    assert.equal(secondPage.items[0]?.id, firstId);
    assert.equal(secondPage.nextCursor, null);
    assert.equal(
      (await repository.getById(firstId))?.backupSha256,
      "b".repeat(64),
    );

    await assert.rejects(
      database.pool.query(
        "UPDATE local_recovery_drill SET outcome = 'failed' WHERE id = $1",
        [firstId],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query("DELETE FROM local_recovery_drill WHERE id = $1", [
        firstId,
      ]),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query(
        `INSERT INTO local_recovery_drill
         (id, outcome, source_schema_table_count, restored_schema_table_count,
          source_capture_sha256, restored_capture_sha256, backup_sha256,
          started_at, completed_at)
         VALUES ($1, 'passed', 77, 76, $2, $2, $3, $4, $4)`,
        [crypto.randomUUID(), "a".repeat(64), "b".repeat(64), firstTime],
      ),
      { code: "23514" },
    );
  } finally {
    await database.pool.end();
  }
});
