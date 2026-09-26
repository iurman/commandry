import { and, desc, eq, sql } from "drizzle-orm";
import type { ReviseKnowledgeItemRequest } from "@commandry/contracts";
import {
  KnowledgeRevisionError,
  requireKnowledgeRevision,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { knowledgeItem, knowledgeItemRevision } from "./schema";

function noteRecord(row: typeof knowledgeItem.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    kind: "note" as const,
    title: row.title,
    content: row.content,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function revisionRecord(row: typeof knowledgeItemRevision.$inferSelect) {
  return {
    id: row.id,
    knowledgeItemId: row.knowledgeItemId,
    version: row.version,
    previousTitle: row.previousTitle,
    previousContent: row.previousContent,
    title: row.title,
    content: row.content,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createKnowledgeRevisionRepository(db: CommandryDatabase) {
  return {
    async revise(id: string, input: ReviseKnowledgeItemRequest) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(knowledgeItem)
          .where(eq(knowledgeItem.id, id))
          .for("update")
          .limit(1);
        if (!current) {
          throw new KnowledgeRevisionError(
            "KNOWLEDGE_NOT_FOUND",
            "Knowledge note not found",
          );
        }
        requireKnowledgeRevision(current, input);
        const now = new Date(
          Math.max(Date.now(), current.updatedAt.getTime() + 1),
        );
        const [updated] = await tx
          .update(knowledgeItem)
          .set({
            title: input.title,
            content: input.content,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(eq(knowledgeItem.id, id))
          .returning();
        if (!updated) throw new Error("Locked knowledge note disappeared");
        await tx.insert(knowledgeItemRevision).values({
          id: crypto.randomUUID(),
          knowledgeItemId: id,
          version: updated.version,
          previousTitle: current.title,
          previousContent: current.content,
          title: updated.title,
          content: updated.content,
          actor: "local-user:unattributed",
          createdAt: now,
        });
        return noteRecord(updated);
      });
    },
    async listRevisions(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [item] = await db
        .select({ id: knowledgeItem.id })
        .from(knowledgeItem)
        .where(eq(knowledgeItem.id, id))
        .limit(1);
      if (!item) {
        throw new KnowledgeRevisionError(
          "KNOWLEDGE_NOT_FOUND",
          "Knowledge note not found",
        );
      }
      const [anchor] = query.cursor
        ? await db
            .select({ version: knowledgeItemRevision.version })
            .from(knowledgeItemRevision)
            .where(
              and(
                eq(knowledgeItemRevision.id, query.cursor),
                eq(knowledgeItemRevision.knowledgeItemId, id),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(knowledgeItemRevision)
        .where(
          and(
            eq(knowledgeItemRevision.knowledgeItemId, id),
            anchor
              ? sql`${knowledgeItemRevision.version} < ${anchor.version}`
              : undefined,
          ),
        )
        .orderBy(desc(knowledgeItemRevision.version))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(revisionRecord),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
