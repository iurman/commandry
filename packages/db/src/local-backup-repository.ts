import { and, desc, eq, sql } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { localBackupEvidence } from "./schema";

function backupRecord(row: typeof localBackupEvidence.$inferSelect) {
  return {
    id: row.id,
    environment: "local" as const,
    sourceLabel: "Encrypted local PostgreSQL archive" as const,
    formatVersion: 1 as const,
    outcome: row.outcome,
    archiveSha256: row.archiveSha256,
    archiveBytes: row.archiveBytes,
    sourceSchemaTableCount: row.sourceSchemaTableCount,
    restoredSchemaTableCount: row.restoredSchemaTableCount,
    captureId: row.captureId,
    sourceCaptureSha256: row.sourceCaptureSha256,
    restoredCaptureSha256: row.restoredCaptureSha256,
    errorCode: row.errorCode,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  };
}

export class LocalBackupCursorError extends Error {
  constructor() {
    super("Backup cursor does not identify a stored local backup");
  }
}

export function createLocalBackupRepository(db: CommandryDatabase) {
  return {
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(localBackupEvidence)
        .where(eq(localBackupEvidence.id, id))
        .limit(1);
      return row ? backupRecord(row) : null;
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100
      )
        throw new Error("Page limit must be between 1 and 100");
      if (query.cursor) {
        const [cursor] = await db
          .select({ id: localBackupEvidence.id })
          .from(localBackupEvidence)
          .where(eq(localBackupEvidence.id, query.cursor))
          .limit(1);
        if (!cursor) throw new LocalBackupCursorError();
      }
      const rows = await db
        .select()
        .from(localBackupEvidence)
        .where(
          and(
            query.cursor
              ? sql`(${localBackupEvidence.completedAt}, ${localBackupEvidence.id}) < (select completed_at, id from local_backup_evidence where id = ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(localBackupEvidence.completedAt),
          desc(localBackupEvidence.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(backupRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
