import { and, desc, eq, sql } from "drizzle-orm";
import type { ChangeWorkItemStatusRequest } from "@commandry/contracts";
import {
  requireWorkItemStatusChange,
  WorkItemStatusError,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  workItem,
  workItemAcceptance,
  workItemStatusEvent,
  workItemVerification,
} from "./schema";

function workRecord(row: typeof workItem.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    title: row.title,
    description: row.description,
    workType: row.workType,
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

function eventRecord(row: typeof workItemStatusEvent.$inferSelect) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    previousStatus: row.previousStatus,
    nextStatus: row.nextStatus,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createWorkItemStatusRepository(
  db: CommandryDatabase,
  options: { requireAcceptanceEvidence?: boolean } = {},
) {
  return {
    async changeStatus(id: string, input: ChangeWorkItemStatusRequest) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, id))
          .for("update")
          .limit(1);
        if (!current) {
          throw new WorkItemStatusError(
            "WORK_ITEM_NOT_FOUND",
            "Work item not found",
          );
        }
        requireWorkItemStatusChange(
          current.status,
          input.expectedStatus,
          input.status,
        );
        if (
          input.status === "done" &&
          (options.requireAcceptanceEvidence ?? true)
        ) {
          const [acceptance] = await tx
            .select()
            .from(workItemAcceptance)
            .where(eq(workItemAcceptance.workItemId, id))
            .limit(1);
          if (acceptance?.criteria.trim()) {
            const [latestReview] = await tx
              .select()
              .from(workItemVerification)
              .where(
                and(
                  eq(workItemVerification.workItemId, id),
                  eq(
                    workItemVerification.acceptanceVersion,
                    acceptance.version,
                  ),
                ),
              )
              .orderBy(
                desc(workItemVerification.createdAt),
                desc(workItemVerification.id),
              )
              .limit(1);
            if (latestReview?.result !== "met")
              throw new WorkItemStatusError(
                "ACCEPTANCE_UNMET",
                "Record a current 'met' review with an attached document before marking this task done",
              );
          }
        }
        const now = new Date();
        const [updated] = await tx
          .update(workItem)
          .set({ status: input.status, updatedAt: now })
          .where(eq(workItem.id, id))
          .returning();
        if (!updated) throw new Error("Locked work item disappeared");
        await tx.insert(workItemStatusEvent).values({
          id: crypto.randomUUID(),
          workItemId: id,
          previousStatus: current.status,
          nextStatus: input.status,
          actor: "local-user:unattributed",
          createdAt: now,
        });
        return workRecord(updated);
      });
    },
    async listStatusEvents(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [item] = await db
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, id))
        .limit(1);
      if (!item) {
        throw new WorkItemStatusError(
          "WORK_ITEM_NOT_FOUND",
          "Work item not found",
        );
      }
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: workItemStatusEvent.createdAt })
            .from(workItemStatusEvent)
            .where(
              and(
                eq(workItemStatusEvent.id, query.cursor),
                eq(workItemStatusEvent.workItemId, id),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workItemStatusEvent)
        .where(
          and(
            eq(workItemStatusEvent.workItemId, id),
            anchor
              ? sql`(${workItemStatusEvent.createdAt}, ${workItemStatusEvent.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workItemStatusEvent.createdAt),
          desc(workItemStatusEvent.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(eventRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
