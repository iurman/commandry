import { and, eq, gt } from "drizzle-orm";
import { projectResourceRelationship } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { project, projectResourceLink, resource } from "./schema";

function projectSummary(row: typeof project.$inferSelect) {
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

function resourceSummary(row: typeof resource.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    subtype: row.subtype,
    state: row.state,
    externalUrl: row.externalUrl,
    lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
  };
}

type PageQuery = { limit: number; cursor?: string };

export function createCatalogRepository(db: CommandryDatabase) {
  return {
    async createProject(input: {
      id: string;
      name: string;
      summary?: string;
      type?: string;
    }) {
      const [row] = await db
        .insert(project)
        .values({
          id: input.id,
          name: input.name,
          summary: input.summary ?? null,
          type: input.type ?? "general",
        })
        .returning();
      if (!row) throw new Error("Project insert returned no row");
      return projectSummary(row);
    },
    async getProject(id: string) {
      const [row] = await db
        .select()
        .from(project)
        .where(eq(project.id, id))
        .limit(1);
      return row ? projectSummary(row) : null;
    },
    async listProjects(input: PageQuery) {
      const rows = await db
        .select()
        .from(project)
        .where(input.cursor ? gt(project.id, input.cursor) : undefined)
        .orderBy(project.id)
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(projectSummary),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async createResource(input: {
      id: string;
      kind: string;
      name: string;
      subtype?: string;
      externalUrl?: string;
    }) {
      const [row] = await db
        .insert(resource)
        .values({
          id: input.id,
          kind: input.kind,
          name: input.name,
          subtype: input.subtype ?? null,
          state: null,
          externalUrl: input.externalUrl ?? null,
        })
        .returning();
      if (!row) throw new Error("Resource insert returned no row");
      return resourceSummary(row);
    },
    async getResource(id: string) {
      const [row] = await db
        .select()
        .from(resource)
        .where(eq(resource.id, id))
        .limit(1);
      return row ? resourceSummary(row) : null;
    },
    async listResources(input: PageQuery) {
      const rows = await db
        .select()
        .from(resource)
        .where(input.cursor ? gt(resource.id, input.cursor) : undefined)
        .orderBy(resource.id)
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(resourceSummary),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async insertProjectResourceLink(input: {
      id: string;
      projectId: string;
      resourceId: string;
      type: "supports" | "relates_to";
      sourceKind: "project" | "resource";
      targetKind: "project" | "resource";
    }) {
      const definition = projectResourceRelationship(input.type);
      if (
        input.sourceKind !== definition.sourceKind ||
        input.targetKind !== definition.targetKind
      ) {
        throw new Error("Relationship direction does not match its type");
      }
      const rows = await db
        .insert(projectResourceLink)
        .values({ ...input, lifecycle: "active", provenance: "manual" })
        .onConflictDoNothing({
          target: [
            projectResourceLink.projectId,
            projectResourceLink.resourceId,
            projectResourceLink.type,
          ],
        })
        .returning({ id: projectResourceLink.id });
      return rows.length === 1;
    },
    async listProjectResourceLinks(projectId: string, input: PageQuery) {
      const rows = await db
        .select({ link: projectResourceLink, resource })
        .from(projectResourceLink)
        .innerJoin(resource, eq(projectResourceLink.resourceId, resource.id))
        .where(
          and(
            eq(projectResourceLink.projectId, projectId),
            eq(projectResourceLink.lifecycle, "active"),
            input.cursor ? gt(projectResourceLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(projectResourceLink.id)
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ link, resource: linkedResource }) => ({
          id: link.id,
          type: link.type,
          inverseType: projectResourceRelationship(link.type).inverseType,
          resource: resourceSummary(linkedResource),
        })),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.link.id ?? null) : null,
      };
    },
  };
}
