import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  WorkProjectContextError,
  requireSecondaryWorkProject,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  workItem,
  workProjectAuditEvent,
  workProjectLink,
  project,
} from "./schema";

type Page = { limit: number; cursor?: string | undefined };

function projectRecord(row: typeof project.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    type: row.type,
    lifecycle: row.lifecycle,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function linkRecord(row: typeof workProjectLink.$inferSelect) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    projectId: row.projectId,
    type: "relates_to" as const,
    inverseType: "relates_to" as const,
    sourceKind: "work_item" as const,
    targetKind: "project" as const,
    lifecycle: row.lifecycle,
    provenance: "manual" as const,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function auditRecord(row: typeof workProjectAuditEvent.$inferSelect) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    projectId: row.projectId,
    linkId: row.linkId,
    operation: row.operation,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function pageResult<R, T>(
  rows: R[],
  limit: number,
  map: (row: R) => T,
  cursor: (row: R) => string,
) {
  const visible = rows.slice(0, limit);
  return {
    items: visible.map(map),
    nextCursor: rows.length > limit ? cursor(visible.at(-1)!) : null,
  };
}

export function createWorkProjectRepository(db: CommandryDatabase) {
  return {
    async getPrimaryProjectId(workItemId: string) {
      const [item] = await db
        .select({ projectId: workItem.projectId })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .limit(1);
      return item?.projectId ?? null;
    },
    async listLinks(workItemId: string, input: Page) {
      const rows = await db
        .select({ link: workProjectLink, target: project })
        .from(workProjectLink)
        .innerJoin(project, eq(project.id, workProjectLink.projectId))
        .where(
          and(
            eq(workProjectLink.workItemId, workItemId),
            eq(workProjectLink.lifecycle, "active"),
            input.cursor ? gt(workProjectLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(workProjectLink.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ link, target }) => ({
          link: linkRecord(link),
          project: projectRecord(target),
        }),
        ({ link }) => link.id,
      );
    },
    async link(workItemId: string, projectId: string) {
      return db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .for("update")
          .limit(1);
        if (!item)
          throw new WorkProjectContextError(
            "WORK_NOT_FOUND",
            "Work record not found",
          );
        requireSecondaryWorkProject(item.projectId, projectId);
        const [target] = await tx
          .select()
          .from(project)
          .where(eq(project.id, projectId))
          .for("share")
          .limit(1);
        if (!target)
          throw new WorkProjectContextError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        const [existing] = await tx
          .select()
          .from(workProjectLink)
          .where(
            and(
              eq(workProjectLink.workItemId, workItemId),
              eq(workProjectLink.projectId, projectId),
              eq(workProjectLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        if (existing)
          return { link: linkRecord(existing), project: projectRecord(target) };
        const [saved] = await tx
          .insert(workProjectLink)
          .values({ id: crypto.randomUUID(), workItemId, projectId })
          .returning();
        if (!saved) throw new Error("Work project link insert returned no row");
        await tx.insert(workProjectAuditEvent).values({
          id: crypto.randomUUID(),
          workItemId,
          projectId,
          linkId: saved.id,
          operation: "work.project_linked",
        });
        return { link: linkRecord(saved), project: projectRecord(target) };
      });
    },
    async archiveLink(id: string) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ workItemId: workProjectLink.workItemId })
          .from(workProjectLink)
          .where(eq(workProjectLink.id, id))
          .limit(1);
        if (!candidate)
          throw new WorkProjectContextError(
            "WORK_PROJECT_LINK_NOT_FOUND",
            "Work project link not found",
          );
        await tx
          .select({ id: workItem.id })
          .from(workItem)
          .where(eq(workItem.id, candidate.workItemId))
          .for("update")
          .limit(1);
        const [current] = await tx
          .select()
          .from(workProjectLink)
          .where(eq(workProjectLink.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new WorkProjectContextError(
            "WORK_PROJECT_LINK_NOT_FOUND",
            "Work project link not found",
          );
        if (current.lifecycle === "archived") return linkRecord(current);
        const [saved] = await tx
          .update(workProjectLink)
          .set({ lifecycle: "archived", archivedAt: new Date() })
          .where(eq(workProjectLink.id, id))
          .returning();
        if (!saved) throw new Error("Work project archive returned no row");
        await tx.insert(workProjectAuditEvent).values({
          id: crypto.randomUUID(),
          workItemId: current.workItemId,
          projectId: current.projectId,
          linkId: current.id,
          operation: "work.project_unlinked",
        });
        return linkRecord(saved);
      });
    },
    async getLink(id: string) {
      const [link] = await db
        .select()
        .from(workProjectLink)
        .where(eq(workProjectLink.id, id))
        .limit(1);
      return link ? linkRecord(link) : null;
    },
    async listAudit(workItemId: string, input: Page) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: workProjectAuditEvent.createdAt })
            .from(workProjectAuditEvent)
            .where(
              and(
                eq(workProjectAuditEvent.id, input.cursor),
                eq(workProjectAuditEvent.workItemId, workItemId),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workProjectAuditEvent)
        .where(
          and(
            eq(workProjectAuditEvent.workItemId, workItemId),
            input.cursor && anchor
              ? sql`(${workProjectAuditEvent.createdAt}, ${workProjectAuditEvent.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workProjectAuditEvent.createdAt),
          desc(workProjectAuditEvent.id),
        )
        .limit(input.limit + 1);
      return pageResult(rows, input.limit, auditRecord, (row) => row.id);
    },
  };
}
