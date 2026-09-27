import { and, desc, eq, sql } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { localReleaseRehearsal } from "./schema";

function record(row: typeof localReleaseRehearsal.$inferSelect) {
  return {
    id: row.id,
    environment: "local" as const,
    sourceLabel: "Isolated local application rollback rehearsal" as const,
    outcome: row.outcome,
    previousRevision: row.previousRevision,
    candidateRevision: row.candidateRevision,
    previousImageId: row.previousImageId,
    candidateImageId: row.candidateImageId,
    sourceSchemaTableCount: row.sourceSchemaTableCount,
    isolatedSchemaTableCount: row.isolatedSchemaTableCount,
    sourceCaptureSha256: row.sourceCaptureSha256,
    isolatedCaptureSha256: row.isolatedCaptureSha256,
    initialWebVerified: row.initialWebVerified,
    initialWorkerVerified: row.initialWorkerVerified,
    candidateWebVerified: row.candidateWebVerified,
    candidateWorkerVerified: row.candidateWorkerVerified,
    rollbackWebVerified: row.rollbackWebVerified,
    rollbackWorkerVerified: row.rollbackWorkerVerified,
    errorCode: row.errorCode,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  };
}

export class LocalReleaseCursorError extends Error {
  constructor() {
    super("Release cursor does not identify a stored local rehearsal");
  }
}

export function createLocalReleaseRehearsalRepository(db: CommandryDatabase) {
  return {
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(localReleaseRehearsal)
        .where(eq(localReleaseRehearsal.id, id))
        .limit(1);
      return row ? record(row) : null;
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
          .select({ id: localReleaseRehearsal.id })
          .from(localReleaseRehearsal)
          .where(eq(localReleaseRehearsal.id, query.cursor))
          .limit(1);
        if (!cursor) throw new LocalReleaseCursorError();
      }
      const rows = await db
        .select()
        .from(localReleaseRehearsal)
        .where(
          and(
            query.cursor
              ? sql`(${localReleaseRehearsal.completedAt}, ${localReleaseRehearsal.id}) < (select completed_at, id from local_release_rehearsal where id = ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(localReleaseRehearsal.completedAt),
          desc(localReleaseRehearsal.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(record),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
