import { and, desc, eq, sql } from "drizzle-orm";
import {
  savedViewAuditEventSchema,
  savedViewSchema,
  type SavedViewDefinition,
} from "@commandry/contracts";
import { SavedViewError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { project, savedView, savedViewAuditEvent } from "./schema";

function record(row: typeof savedView.$inferSelect) {
  return savedViewSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  });
}

function auditRecord(row: typeof savedViewAuditEvent.$inferSelect) {
  return savedViewAuditEventSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  });
}

export function createSavedViewRepository(db: CommandryDatabase) {
  return {
    async projectExists(projectId: string) {
      const [row] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      return Boolean(row);
    },
    async get(id: string) {
      const [row] = await db
        .select()
        .from(savedView)
        .where(eq(savedView.id, id))
        .limit(1);
      return row ? record(row) : null;
    },
    async list(input: {
      surface: "work" | "knowledge";
      limit: number;
      cursor?: string | undefined;
    }) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: savedView.createdAt })
            .from(savedView)
            .where(
              and(
                eq(savedView.id, input.cursor),
                eq(savedView.surface, input.surface),
                eq(savedView.lifecycle, "active"),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(savedView)
        .where(
          and(
            eq(savedView.surface, input.surface),
            eq(savedView.lifecycle, "active"),
            anchor
              ? sql`(${savedView.createdAt}, ${savedView.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(savedView.createdAt), desc(savedView.id))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(record),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async create(input: {
      id: string;
      name: string;
      definition: SavedViewDefinition;
    }) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(savedView)
          .values({
            id: input.id,
            surface: input.definition.surface,
            name: input.name,
            definition: input.definition,
          })
          .returning();
        if (!row) throw new Error("Saved view insert returned no row");
        await tx.insert(savedViewAuditEvent).values({
          id: crypto.randomUUID(),
          savedViewId: row.id,
          actor: "local-user:unattributed",
          operation: "created",
          version: row.version,
          name: row.name,
          definition: row.definition,
        });
        return record(row);
      });
    },
    async update(input: {
      id: string;
      expectedVersion: number;
      name: string;
      definition: SavedViewDefinition;
    }) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(savedView)
          .set({
            name: input.name,
            definition: input.definition,
            version: sql`${savedView.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(savedView.id, input.id),
              eq(savedView.version, input.expectedVersion),
              eq(savedView.lifecycle, "active"),
              eq(savedView.surface, input.definition.surface),
            ),
          )
          .returning();
        if (!row)
          throw new SavedViewError(
            "SAVED_VIEW_CONFLICT",
            "Saved view changed since it was opened",
          );
        await tx.insert(savedViewAuditEvent).values({
          id: crypto.randomUUID(),
          savedViewId: row.id,
          actor: "local-user:unattributed",
          operation: "updated",
          version: row.version,
          name: row.name,
          definition: row.definition,
        });
        return record(row);
      });
    },
    async archive(id: string, expectedVersion: number) {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [row] = await tx
          .update(savedView)
          .set({
            lifecycle: "archived",
            archivedAt: now,
            updatedAt: now,
            version: sql`${savedView.version} + 1`,
          })
          .where(
            and(
              eq(savedView.id, id),
              eq(savedView.version, expectedVersion),
              eq(savedView.lifecycle, "active"),
            ),
          )
          .returning();
        if (!row)
          throw new SavedViewError(
            "SAVED_VIEW_CONFLICT",
            "Saved view changed since it was opened",
          );
        await tx.insert(savedViewAuditEvent).values({
          id: crypto.randomUUID(),
          savedViewId: row.id,
          actor: "local-user:unattributed",
          operation: "archived",
          version: row.version,
          name: row.name,
          definition: row.definition,
        });
        return record(row);
      });
    },
    async listAudit(input: {
      id: string;
      limit: number;
      cursor?: string | undefined;
    }) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: savedViewAuditEvent.createdAt })
            .from(savedViewAuditEvent)
            .where(
              and(
                eq(savedViewAuditEvent.id, input.cursor),
                eq(savedViewAuditEvent.savedViewId, input.id),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(savedViewAuditEvent)
        .where(
          and(
            eq(savedViewAuditEvent.savedViewId, input.id),
            anchor
              ? sql`(${savedViewAuditEvent.createdAt}, ${savedViewAuditEvent.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(savedViewAuditEvent.createdAt),
          desc(savedViewAuditEvent.id),
        )
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(auditRecord),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
