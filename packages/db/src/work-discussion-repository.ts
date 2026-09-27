import { and, desc, eq, sql } from "drizzle-orm";
import { WorkDiscussionError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { auditEvent, workItem, workItemComment } from "./schema";

function record(row: typeof workItemComment.$inferSelect) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    projectId: row.projectId,
    body: row.body,
    actor: "local-user:unattributed" as const,
    sourceLabel: "Manual local work comment" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createWorkDiscussionRepository(db: CommandryDatabase) {
  return {
    async create(workItemId: string, body: string) {
      return db.transaction(async (tx) => {
        const [work] = await tx
          .select({ id: workItem.id, projectId: workItem.projectId })
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .limit(1);
        if (!work)
          throw new WorkDiscussionError(
            "WORK_NOT_FOUND",
            "Work item not found",
          );
        const [row] = await tx
          .insert(workItemComment)
          .values({
            id: crypto.randomUUID(),
            workItemId,
            projectId: work.projectId,
            body,
            actor: "local-user:unattributed",
          })
          .returning();
        if (!row) throw new Error("Work comment insert returned no row");
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-user:unattributed",
          operation: "work_item_comment.created",
          details: { workItemId, commentId: row.id },
        });
        return record(row);
      });
    },
    async list(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [work] = await db
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .limit(1);
      if (!work)
        throw new WorkDiscussionError("WORK_NOT_FOUND", "Work item not found");
      const rows = await db
        .select()
        .from(workItemComment)
        .where(
          and(
            eq(workItemComment.workItemId, workItemId),
            query.cursor
              ? sql`(${workItemComment.createdAt}, ${workItemComment.id}) < (select "created_at", "id" from "work_item_comment" where "id" = ${query.cursor}::uuid and "work_item_id" = ${workItemId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(workItemComment.createdAt), desc(workItemComment.id))
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
