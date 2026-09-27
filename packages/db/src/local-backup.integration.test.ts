import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createDatabase } from "./client";
import {
  createLocalBackupRepository,
  LocalBackupCursorError,
} from "./local-backup-repository";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("encrypted local backup evidence is immutable and cursor-paged", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  try {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const firstTime = new Date("2026-09-27T08:00:00.000Z");
    const secondTime = new Date("2026-09-27T09:00:00.000Z");
    await database.pool.query(
      `INSERT INTO local_backup_evidence
       (id, outcome, archive_sha256, archive_bytes,
        source_schema_table_count, restored_schema_table_count,
        capture_id, source_capture_sha256, restored_capture_sha256,
        started_at, completed_at)
       VALUES ($1, 'passed', $2, 1200, 80, 80, $3, $4, $4, $5, $5)`,
      [firstId, "a".repeat(64), crypto.randomUUID(), "b".repeat(64), firstTime],
    );
    await database.pool.query(
      `INSERT INTO local_backup_evidence
       (id, outcome, error_code, started_at, completed_at)
       VALUES ($1, 'failed', 'ARCHIVE_REOPEN', $2, $2)`,
      [secondId, secondTime],
    );
    const repository = createLocalBackupRepository(database.db);
    const firstPage = await repository.list({ limit: 1 });
    assert.equal(firstPage.items[0]?.id, secondId);
    assert.equal(firstPage.nextCursor, secondId);
    const secondPage = await repository.list({
      limit: 1,
      cursor: secondId,
    });
    assert.equal(secondPage.items[0]?.id, firstId);
    assert.equal(secondPage.nextCursor, null);
    assert.equal(
      (await repository.getById(firstId))?.archiveSha256,
      "a".repeat(64),
    );
    await assert.rejects(
      repository.list({ limit: 1, cursor: crypto.randomUUID() }),
      LocalBackupCursorError,
    );
    await assert.rejects(
      database.pool.query(
        "UPDATE local_backup_evidence SET outcome = 'failed' WHERE id = $1",
        [firstId],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query("DELETE FROM local_backup_evidence WHERE id = $1", [
        firstId,
      ]),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query(
        `INSERT INTO local_backup_evidence
         (id, outcome, archive_sha256, archive_bytes,
          source_schema_table_count, restored_schema_table_count,
          started_at, completed_at)
         VALUES ($1, 'passed', $2, 1200, 80, 79, $3, $3)`,
        [crypto.randomUUID(), "c".repeat(64), secondTime],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query(
        `INSERT INTO local_backup_evidence
         (id, outcome, archive_bytes, source_schema_table_count,
          restored_schema_table_count, started_at, completed_at)
         VALUES ($1, 'passed', 1200, 80, 80, $2, $2)`,
        [crypto.randomUUID(), secondTime],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      database.pool.query(
        `INSERT INTO local_backup_evidence
         (id, outcome, archive_sha256, archive_bytes,
          source_schema_table_count, restored_schema_table_count,
          capture_id, started_at, completed_at)
         VALUES ($1, 'passed', $2, 1200, 80, 80, $3, $4, $4)`,
        [crypto.randomUUID(), "c".repeat(64), crypto.randomUUID(), secondTime],
      ),
      { code: "23514" },
    );
  } finally {
    await database.pool.end();
  }
});
