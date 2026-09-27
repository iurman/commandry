import { desc, eq, sql } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { localReleasePreflight } from "./schema";

function record(row: typeof localReleasePreflight.$inferSelect) {
  return {
    id: row.id,
    environment: "local" as const,
    sourceLabel: "Local Compose release preflight" as const,
    outcome: row.outcome,
    checkoutRevision: row.checkoutRevision,
    imageId: row.imageId,
    versionSha: row.versionSha,
    checks: row.checks,
    backupEvidenceId: row.backupEvidenceId,
    recoveryEvidenceId: row.recoveryEvidenceId,
    releaseEvidenceId: row.releaseEvidenceId,
    errorCode: row.errorCode,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt.toISOString(),
  };
}

export class LocalReleasePreflightCursorError extends Error {
  constructor() {
    super("Preflight cursor does not identify a stored local check");
  }
}

export function createLocalReleasePreflightRepository(db: CommandryDatabase) {
  return {
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(localReleasePreflight)
        .where(eq(localReleasePreflight.id, id))
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
          .select({ id: localReleasePreflight.id })
          .from(localReleasePreflight)
          .where(eq(localReleasePreflight.id, query.cursor))
          .limit(1);
        if (!cursor) throw new LocalReleasePreflightCursorError();
      }
      const rows = await db
        .select()
        .from(localReleasePreflight)
        .where(
          query.cursor
            ? sql`(${localReleasePreflight.completedAt}, ${localReleasePreflight.id}) < (select completed_at, id from local_release_preflight where id = ${query.cursor}::uuid)`
            : undefined,
        )
        .orderBy(
          desc(localReleasePreflight.completedAt),
          desc(localReleasePreflight.id),
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
