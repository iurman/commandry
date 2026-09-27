import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { CreateWorkItemRelationRequest } from "@commandry/contracts";
import { WorkRelationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { auditEvent, workItem, workItemRelation } from "./schema";

type WorkRow = typeof workItem.$inferSelect;
type RelationRow = typeof workItemRelation.$inferSelect;

function record(row: RelationRow, source: WorkRow, target: WorkRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceWorkItemId: row.sourceWorkItemId,
    sourceTitle: source.title,
    sourceStatus: source.status,
    targetWorkItemId: row.targetWorkItemId,
    targetTitle: target.title,
    targetStatus: target.status,
    type: row.type,
    state: row.state,
    sourceLabel: "Manual local work relationship" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function mappedError(cause: unknown): WorkRelationError | null {
  let current: unknown = cause;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const detail = current as Error & {
      code?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (detail.constraint === "work_item_relation_one_parent_idx")
      return new WorkRelationError(
        "PARENT_EXISTS",
        "This subtask already has a parent",
      );
    if (detail.constraint === "work_item_relation_active_unique_idx")
      return new WorkRelationError(
        "RELATION_EXISTS",
        "This work relationship already exists",
      );
    if (detail.message.includes("Work relation cycle"))
      return new WorkRelationError(
        "RELATION_CYCLE",
        "This relationship would create a cycle",
      );
    if (detail.message.includes("Work relation project mismatch"))
      return new WorkRelationError(
        "CROSS_PROJECT",
        "Work relationships must stay within one project",
      );
    current = detail.cause;
  }
  return null;
}

export function createWorkRelationsRepository(db: CommandryDatabase) {
  return {
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(workItemRelation)
        .where(eq(workItemRelation.id, id))
        .limit(1);
      if (!row) return null;
      const items = await db
        .select()
        .from(workItem)
        .where(
          inArray(workItem.id, [row.sourceWorkItemId, row.targetWorkItemId]),
        );
      return record(
        row,
        items.find((item) => item.id === row.sourceWorkItemId)!,
        items.find((item) => item.id === row.targetWorkItemId)!,
      );
    },
    async create(input: CreateWorkItemRelationRequest) {
      try {
        return await db.transaction(async (tx) => {
          const items = await tx
            .select()
            .from(workItem)
            .where(
              inArray(workItem.id, [
                input.sourceWorkItemId,
                input.targetWorkItemId,
              ]),
            );
          const source = items.find(
            (item) => item.id === input.sourceWorkItemId,
          );
          const target = items.find(
            (item) => item.id === input.targetWorkItemId,
          );
          if (!source || !target)
            throw new WorkRelationError(
              "WORK_NOT_FOUND",
              "Work item not found",
            );
          if (source.projectId !== target.projectId)
            throw new WorkRelationError(
              "CROSS_PROJECT",
              "Work relationships must stay within one project",
            );
          const [row] = await tx
            .insert(workItemRelation)
            .values({
              id: crypto.randomUUID(),
              projectId: source.projectId,
              sourceWorkItemId: source.id,
              targetWorkItemId: target.id,
              type: input.type,
              actor: "local-user:unattributed",
            })
            .returning();
          if (!row) throw new Error("Work relationship insert returned no row");
          await tx.insert(auditEvent).values({
            id: crypto.randomUUID(),
            actor: "local-user:unattributed",
            operation: "work_item_relation.created",
            details: {
              relationId: row.id,
              projectId: row.projectId,
              type: row.type,
              sourceWorkItemId: source.id,
              targetWorkItemId: target.id,
            },
          });
          return record(row, source, target);
        });
      } catch (cause) {
        throw mappedError(cause) ?? cause;
      }
    },
    async list(
      workItemId: string,
      query: {
        direction: "outgoing" | "incoming";
        limit: number;
        cursor?: string | undefined;
      },
    ) {
      const [work] = await db
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .limit(1);
      if (!work)
        throw new WorkRelationError("WORK_NOT_FOUND", "Work item not found");
      const endpoint =
        query.direction === "outgoing"
          ? workItemRelation.sourceWorkItemId
          : workItemRelation.targetWorkItemId;
      const rows = await db
        .select()
        .from(workItemRelation)
        .where(
          and(
            eq(endpoint, workItemId),
            eq(workItemRelation.state, "active"),
            query.cursor
              ? sql`(${workItemRelation.createdAt}, ${workItemRelation.id}) < (select "created_at", "id" from "work_item_relation" where "id" = ${query.cursor}::uuid and "state" = 'active' and ${query.direction === "outgoing" ? sql`"source_work_item_id"` : sql`"target_work_item_id"`} = ${workItemId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(workItemRelation.createdAt), desc(workItemRelation.id))
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      const ids = [
        ...new Set(
          visible.flatMap((row) => [
            row.sourceWorkItemId,
            row.targetWorkItemId,
          ]),
        ),
      ];
      const workRows = ids.length
        ? await db.select().from(workItem).where(inArray(workItem.id, ids))
        : [];
      const byId = new Map(workRows.map((item) => [item.id, item]));
      return {
        items: visible.map((row) =>
          record(
            row,
            byId.get(row.sourceWorkItemId)!,
            byId.get(row.targetWorkItemId)!,
          ),
        ),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async archive(id: string) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workItemRelation)
          .where(eq(workItemRelation.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new WorkRelationError(
            "RELATION_NOT_FOUND",
            "Work relationship not found",
          );
        if (current.state !== "active")
          throw new WorkRelationError(
            "RELATION_ARCHIVED",
            "Work relationship is already archived",
          );
        const [row] = await tx
          .update(workItemRelation)
          .set({ state: "archived", archivedAt: new Date() })
          .where(eq(workItemRelation.id, id))
          .returning();
        if (!row) throw new Error("Locked work relationship disappeared");
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-user:unattributed",
          operation: "work_item_relation.archived",
          details: {
            relationId: row.id,
            projectId: row.projectId,
            type: row.type,
            sourceWorkItemId: row.sourceWorkItemId,
            targetWorkItemId: row.targetWorkItemId,
          },
        });
        const items = await tx
          .select()
          .from(workItem)
          .where(
            inArray(workItem.id, [row.sourceWorkItemId, row.targetWorkItemId]),
          );
        return record(
          row,
          items.find((item) => item.id === row.sourceWorkItemId)!,
          items.find((item) => item.id === row.targetWorkItemId)!,
        );
      });
    },
  };
}
