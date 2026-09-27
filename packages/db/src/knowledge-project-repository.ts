import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  KnowledgeProjectContextError,
  requireSecondaryKnowledgeProject,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  knowledgeItem,
  knowledgeProjectAuditEvent,
  knowledgeProjectLink,
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

function linkRecord(row: typeof knowledgeProjectLink.$inferSelect) {
  return {
    id: row.id,
    knowledgeItemId: row.knowledgeItemId,
    projectId: row.projectId,
    type: "relates_to" as const,
    inverseType: "relates_to" as const,
    sourceKind: "knowledge_item" as const,
    targetKind: "project" as const,
    lifecycle: row.lifecycle,
    provenance: "manual" as const,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function auditRecord(row: typeof knowledgeProjectAuditEvent.$inferSelect) {
  return {
    id: row.id,
    knowledgeItemId: row.knowledgeItemId,
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

export function createKnowledgeProjectRepository(db: CommandryDatabase) {
  return {
    async getPrimaryProjectId(knowledgeItemId: string) {
      const [item] = await db
        .select({ projectId: knowledgeItem.projectId })
        .from(knowledgeItem)
        .where(eq(knowledgeItem.id, knowledgeItemId))
        .limit(1);
      return item?.projectId ?? null;
    },
    async listLinks(knowledgeItemId: string, input: Page) {
      const rows = await db
        .select({ link: knowledgeProjectLink, target: project })
        .from(knowledgeProjectLink)
        .innerJoin(project, eq(project.id, knowledgeProjectLink.projectId))
        .where(
          and(
            eq(knowledgeProjectLink.knowledgeItemId, knowledgeItemId),
            eq(knowledgeProjectLink.lifecycle, "active"),
            input.cursor
              ? gt(knowledgeProjectLink.id, input.cursor)
              : undefined,
          ),
        )
        .orderBy(knowledgeProjectLink.id)
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
    async link(knowledgeItemId: string, projectId: string) {
      return db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(knowledgeItem)
          .where(eq(knowledgeItem.id, knowledgeItemId))
          .for("update")
          .limit(1);
        if (!item)
          throw new KnowledgeProjectContextError(
            "KNOWLEDGE_NOT_FOUND",
            "Knowledge record not found",
          );
        requireSecondaryKnowledgeProject(item.projectId, projectId);
        const [target] = await tx
          .select()
          .from(project)
          .where(eq(project.id, projectId))
          .for("share")
          .limit(1);
        if (!target)
          throw new KnowledgeProjectContextError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        const [existing] = await tx
          .select()
          .from(knowledgeProjectLink)
          .where(
            and(
              eq(knowledgeProjectLink.knowledgeItemId, knowledgeItemId),
              eq(knowledgeProjectLink.projectId, projectId),
              eq(knowledgeProjectLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        if (existing)
          return { link: linkRecord(existing), project: projectRecord(target) };
        const [saved] = await tx
          .insert(knowledgeProjectLink)
          .values({ id: crypto.randomUUID(), knowledgeItemId, projectId })
          .returning();
        if (!saved)
          throw new Error("Knowledge project link insert returned no row");
        await tx.insert(knowledgeProjectAuditEvent).values({
          id: crypto.randomUUID(),
          knowledgeItemId,
          projectId,
          linkId: saved.id,
          operation: "knowledge.project_linked",
        });
        return { link: linkRecord(saved), project: projectRecord(target) };
      });
    },
    async archiveLink(id: string) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ knowledgeItemId: knowledgeProjectLink.knowledgeItemId })
          .from(knowledgeProjectLink)
          .where(eq(knowledgeProjectLink.id, id))
          .limit(1);
        if (!candidate)
          throw new KnowledgeProjectContextError(
            "KNOWLEDGE_PROJECT_LINK_NOT_FOUND",
            "Knowledge project link not found",
          );
        await tx
          .select({ id: knowledgeItem.id })
          .from(knowledgeItem)
          .where(eq(knowledgeItem.id, candidate.knowledgeItemId))
          .for("update")
          .limit(1);
        const [current] = await tx
          .select()
          .from(knowledgeProjectLink)
          .where(eq(knowledgeProjectLink.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new KnowledgeProjectContextError(
            "KNOWLEDGE_PROJECT_LINK_NOT_FOUND",
            "Knowledge project link not found",
          );
        if (current.lifecycle === "archived") return linkRecord(current);
        const [saved] = await tx
          .update(knowledgeProjectLink)
          .set({ lifecycle: "archived", archivedAt: new Date() })
          .where(eq(knowledgeProjectLink.id, id))
          .returning();
        if (!saved)
          throw new Error("Knowledge project archive returned no row");
        await tx.insert(knowledgeProjectAuditEvent).values({
          id: crypto.randomUUID(),
          knowledgeItemId: current.knowledgeItemId,
          projectId: current.projectId,
          linkId: current.id,
          operation: "knowledge.project_unlinked",
        });
        return linkRecord(saved);
      });
    },
    async getLink(id: string) {
      const [link] = await db
        .select()
        .from(knowledgeProjectLink)
        .where(eq(knowledgeProjectLink.id, id))
        .limit(1);
      return link ? linkRecord(link) : null;
    },
    async listAudit(knowledgeItemId: string, input: Page) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: knowledgeProjectAuditEvent.createdAt })
            .from(knowledgeProjectAuditEvent)
            .where(
              and(
                eq(knowledgeProjectAuditEvent.id, input.cursor),
                eq(knowledgeProjectAuditEvent.knowledgeItemId, knowledgeItemId),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(knowledgeProjectAuditEvent)
        .where(
          and(
            eq(knowledgeProjectAuditEvent.knowledgeItemId, knowledgeItemId),
            input.cursor && anchor
              ? sql`(${knowledgeProjectAuditEvent.createdAt}, ${knowledgeProjectAuditEvent.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(knowledgeProjectAuditEvent.createdAt),
          desc(knowledgeProjectAuditEvent.id),
        )
        .limit(input.limit + 1);
      return pageResult(rows, input.limit, auditRecord, (row) => row.id);
    },
  };
}
