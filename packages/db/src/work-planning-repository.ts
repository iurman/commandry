import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { ChangeWorkItemPlanningRequest } from "@commandry/contracts";
import {
  requireWorkPlanningChange,
  WorkPlanningError,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { workItem, workItemPlanningEvent } from "./schema";

function workRecord(row: typeof workItem.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    title: row.title,
    description: row.description,
    workType: row.workType,
    generatedFromWorkItemId: row.generatedFromWorkItemId,
    assigneeKind: row.assigneeKind,
    assigneeAgentId: row.assigneeAgentId,
    assigneeLabel: row.assigneeLabel,
    status: row.status,
    priority: row.priority,
    dueOn: row.dueOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function planningEventRecord(row: typeof workItemPlanningEvent.$inferSelect) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    previousPriority: row.previousPriority,
    nextPriority: row.nextPriority,
    previousDueOn: row.previousDueOn,
    nextDueOn: row.nextDueOn,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createWorkPlanningRepository(db: CommandryDatabase) {
  return {
    async changePlanning(id: string, input: ChangeWorkItemPlanningRequest) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, id))
          .for("update")
          .limit(1);
        if (!current) {
          throw new WorkPlanningError(
            "WORK_ITEM_NOT_FOUND",
            "Work item not found",
          );
        }
        requireWorkPlanningChange(
          {
            updatedAt: current.updatedAt.toISOString(),
            priority: current.priority,
            dueOn: current.dueOn,
          },
          input,
        );
        const now = new Date(
          Math.max(Date.now(), current.updatedAt.getTime() + 1),
        );
        const [updated] = await tx
          .update(workItem)
          .set({ priority: input.priority, dueOn: input.dueOn, updatedAt: now })
          .where(eq(workItem.id, id))
          .returning();
        if (!updated) throw new Error("Locked work item disappeared");
        await tx.insert(workItemPlanningEvent).values({
          id: crypto.randomUUID(),
          workItemId: id,
          previousPriority: current.priority,
          nextPriority: input.priority,
          previousDueOn: current.dueOn,
          nextDueOn: input.dueOn,
          actor: "local-user:unattributed",
          createdAt: now,
        });
        return workRecord(updated);
      });
    },
    async listPlanningEvents(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [item] = await db
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, id))
        .limit(1);
      if (!item)
        throw new WorkPlanningError(
          "WORK_ITEM_NOT_FOUND",
          "Work item not found",
        );
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: workItemPlanningEvent.createdAt })
            .from(workItemPlanningEvent)
            .where(
              and(
                eq(workItemPlanningEvent.id, query.cursor),
                eq(workItemPlanningEvent.workItemId, id),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workItemPlanningEvent)
        .where(
          and(
            eq(workItemPlanningEvent.workItemId, id),
            anchor
              ? sql`(${workItemPlanningEvent.createdAt}, ${workItemPlanningEvent.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workItemPlanningEvent.createdAt),
          desc(workItemPlanningEvent.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(planningEventRecord),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async listUpcoming(query: { limit: number; cursor?: string | undefined }) {
      const [anchor] = query.cursor
        ? await db
            .select({ dueOn: workItem.dueOn })
            .from(workItem)
            .where(eq(workItem.id, query.cursor))
            .limit(1)
        : [];
      if (query.cursor && !anchor?.dueOn)
        return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workItem)
        .where(
          and(
            eq(workItem.status, "open"),
            isNotNull(workItem.dueOn),
            anchor?.dueOn
              ? sql`(${workItem.dueOn}, ${workItem.id}) > (${anchor.dueOn}::date, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(asc(workItem.dueOn), asc(workItem.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(workRecord),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
