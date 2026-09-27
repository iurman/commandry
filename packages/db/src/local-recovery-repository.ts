import { and, desc, eq, sql } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { localRecoveryDrill } from "./schema";

function drillRecord(row: typeof localRecoveryDrill.$inferSelect) {
  return {
    id: row.id,
    environment: "local" as const,
    sourceLabel: "Local disposable PostgreSQL restore rehearsal" as const,
    outcome: row.outcome,
    sourceSchemaTableCount: row.sourceSchemaTableCount,
    restoredSchemaTableCount: row.restoredSchemaTableCount,
    sourceCaptureSha256: row.sourceCaptureSha256,
    restoredCaptureSha256: row.restoredCaptureSha256,
    backupSha256: row.backupSha256,
    errorCode: row.errorCode,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  };
}

export function createLocalRecoveryRepository(db: CommandryDatabase) {
  return {
    async latest() {
      const [row] = await db
        .select()
        .from(localRecoveryDrill)
        .orderBy(
          desc(localRecoveryDrill.completedAt),
          desc(localRecoveryDrill.id),
        )
        .limit(1);
      return row ? drillRecord(row) : null;
    },
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(localRecoveryDrill)
        .where(eq(localRecoveryDrill.id, id))
        .limit(1);
      return row ? drillRecord(row) : null;
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100
      )
        throw new Error("Page limit must be between 1 and 100");
      const rows = await db
        .select()
        .from(localRecoveryDrill)
        .where(
          and(
            query.cursor
              ? sql`(${localRecoveryDrill.completedAt}, ${localRecoveryDrill.id}) < (select completed_at, id from local_recovery_drill where id = ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(localRecoveryDrill.completedAt),
          desc(localRecoveryDrill.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(drillRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
