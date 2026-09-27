import { and, desc, eq, sql } from "drizzle-orm";
import {
  requireWorkAssignmentChange,
  WorkAssignmentError,
} from "@commandry/domain";
import type { ChangeWorkAssignmentRequest } from "@commandry/contracts";
import type { CommandryDatabase } from "./client";
import {
  localAgentProfile,
  localAgentProjectAssignment,
  project,
  workItem,
  workItemAssignmentEvent,
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

function eventRecord(row: typeof workItemAssignmentEvent.$inferSelect) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    previousKind: row.previousKind,
    nextKind: row.nextKind,
    previousAgentId: row.previousAgentId,
    nextAgentId: row.nextAgentId,
    previousLabel: row.previousLabel,
    nextLabel: row.nextLabel,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function agentRecord(row: typeof localAgentProfile.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    runtime: "local-fake-v1" as const,
    sourceLabel: "Synthetic local agent" as const,
    isSynthetic: true as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Page limit must be between 1 and 100");
  }
  return limit;
}

export function createWorkAssignmentRepository(db: CommandryDatabase) {
  return {
    async getAssignmentEventById(id: string) {
      const [row] = await db
        .select()
        .from(workItemAssignmentEvent)
        .where(eq(workItemAssignmentEvent.id, id))
        .limit(1);
      return row ? eventRecord(row) : null;
    },
    async changeAssignment(
      workItemId: string,
      input: ChangeWorkAssignmentRequest,
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .for("update")
          .limit(1);
        if (!current) {
          throw new WorkAssignmentError(
            "WORK_ITEM_NOT_FOUND",
            "Work item not found",
          );
        }
        requireWorkAssignmentChange(
          {
            updatedAt: current.updatedAt.toISOString(),
            assigneeKind: current.assigneeKind,
            assigneeAgentId: current.assigneeAgentId,
          },
          input,
        );
        let nextLabel: string | null = null;
        if (input.assigneeKind === "local_user") {
          nextLabel = "Local user (unattributed)";
        } else if (input.assigneeKind === "agent") {
          const [eligible] = await tx
            .select({ agent: localAgentProfile })
            .from(localAgentProjectAssignment)
            .innerJoin(
              localAgentProfile,
              eq(localAgentProfile.id, localAgentProjectAssignment.agentId),
            )
            .where(
              and(
                eq(localAgentProjectAssignment.agentId, input.agentId!),
                eq(localAgentProjectAssignment.projectId, current.projectId),
              ),
            )
            .limit(1);
          if (!eligible) {
            throw new WorkAssignmentError(
              "AGENT_NOT_IN_PROJECT",
              "Agent must have this work item's primary project scope",
            );
          }
          nextLabel = `Synthetic local agent: ${eligible.agent.name}`;
        }
        const now = new Date(
          Math.max(Date.now(), current.updatedAt.getTime() + 1),
        );
        const [updated] = await tx
          .update(workItem)
          .set({
            assigneeKind: input.assigneeKind,
            assigneeAgentId: input.agentId,
            assigneeLabel: nextLabel,
            updatedAt: now,
          })
          .where(eq(workItem.id, workItemId))
          .returning();
        if (!updated) throw new Error("Locked work item disappeared");
        await tx.insert(workItemAssignmentEvent).values({
          id: crypto.randomUUID(),
          workItemId,
          previousKind: current.assigneeKind,
          nextKind: input.assigneeKind,
          previousAgentId: current.assigneeAgentId,
          nextAgentId: input.agentId,
          previousLabel: current.assigneeLabel,
          nextLabel,
          actor: "local-user:unattributed",
          createdAt: now,
        });
        return workRecord(updated);
      });
    },
    async listAssignmentEvents(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const [item] = await db
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .limit(1);
      if (!item) {
        throw new WorkAssignmentError(
          "WORK_ITEM_NOT_FOUND",
          "Work item not found",
        );
      }
      const rows = await db
        .select()
        .from(workItemAssignmentEvent)
        .where(
          and(
            eq(workItemAssignmentEvent.workItemId, workItemId),
            query.cursor
              ? sql`(${workItemAssignmentEvent.createdAt}, ${workItemAssignmentEvent.id}) < (select created_at, id from work_item_assignment_event where id = ${query.cursor}::uuid and work_item_id = ${workItemId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workItemAssignmentEvent.createdAt),
          desc(workItemAssignmentEvent.id),
        )
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(eventRecord),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async listEligibleAgents(
      projectId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const [owner] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      if (!owner) {
        throw new WorkAssignmentError("PROJECT_NOT_FOUND", "Project not found");
      }
      const rows = await db
        .select({ agent: localAgentProfile })
        .from(localAgentProjectAssignment)
        .innerJoin(
          localAgentProfile,
          eq(localAgentProfile.id, localAgentProjectAssignment.agentId),
        )
        .where(
          and(
            eq(localAgentProjectAssignment.projectId, projectId),
            query.cursor
              ? sql`(${localAgentProfile.createdAt}, ${localAgentProfile.id}) < (select created_at, id from local_agent_profile where id = ${query.cursor}::uuid and exists (select 1 from local_agent_project_assignment where agent_id = ${query.cursor}::uuid and project_id = ${projectId}::uuid))`
              : undefined,
          ),
        )
        .orderBy(desc(localAgentProfile.createdAt), desc(localAgentProfile.id))
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(({ agent }) => agentRecord(agent)),
        nextCursor:
          rows.length > limit ? (visible.at(-1)?.agent.id ?? null) : null,
      };
    },
  };
}
