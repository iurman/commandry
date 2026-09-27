import { and, desc, eq, gt, lt } from "drizzle-orm";
import {
  prepareProjectMetadataRevision,
  projectResourceRelationship,
  type ProjectMetadata,
  type ProjectMetadataRevision,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  domain,
  project,
  projectDomainLink,
  projectMetadataEvent,
  projectResourceLink,
  resource,
} from "./schema";

function projectSummary(
  row: typeof project.$inferSelect,
  owner: { id: string; name: string } | null = null,
) {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    type: row.type,
    lifecycle: row.lifecycle,
    version: row.version,
    domain: owner,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function projectMetadataSnapshot(
  row: typeof project.$inferSelect,
): ProjectMetadata {
  return {
    name: row.name,
    summary: row.summary,
    type: row.type,
    lifecycle: row.lifecycle,
    version: row.version,
  };
}

function projectMetadataEventRecord(
  row: typeof projectMetadataEvent.$inferSelect,
) {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    actor: row.actor,
    previous: row.previous,
    current: row.current,
    changedFields: row.changedFields,
    createdAt: row.createdAt.toISOString(),
  };
}

export function resourceSummary(row: typeof resource.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    subtype: row.subtype,
    parentResourceId: row.parentResourceId,
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
        .select({ record: project, owner: domain })
        .from(project)
        .leftJoin(
          projectDomainLink,
          and(
            eq(projectDomainLink.projectId, project.id),
            eq(projectDomainLink.lifecycle, "active"),
          ),
        )
        .leftJoin(domain, eq(domain.id, projectDomainLink.domainId))
        .where(eq(project.id, id))
        .limit(1);
      return row
        ? projectSummary(
            row.record,
            row.owner ? { id: row.owner.id, name: row.owner.name } : null,
          )
        : null;
    },
    async listProjects(input: PageQuery) {
      const rows = await db
        .select({ record: project, owner: domain })
        .from(project)
        .leftJoin(
          projectDomainLink,
          and(
            eq(projectDomainLink.projectId, project.id),
            eq(projectDomainLink.lifecycle, "active"),
          ),
        )
        .leftJoin(domain, eq(domain.id, projectDomainLink.domainId))
        .where(input.cursor ? gt(project.id, input.cursor) : undefined)
        .orderBy(project.id)
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(({ record, owner }) =>
          projectSummary(
            record,
            owner ? { id: owner.id, name: owner.name } : null,
          ),
        ),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.record.id ?? null) : null,
      };
    },
    async updateProject(id: string, input: ProjectMetadataRevision) {
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(project)
          .where(eq(project.id, id))
          .for("update")
          .limit(1);
        if (!before) return null;
        const previous = projectMetadataSnapshot(before);
        const { next, changedFields } = prepareProjectMetadataRevision(
          previous,
          input,
        );
        let saved = before;
        if (changedFields.length > 0) {
          const [updated] = await tx
            .update(project)
            .set({
              name: next.name,
              summary: next.summary,
              type: next.type,
              lifecycle: next.lifecycle,
              version: next.version,
              updatedAt: new Date(),
            })
            .where(eq(project.id, id))
            .returning();
          if (!updated) throw new Error("Project update returned no row");
          saved = updated;
          await tx.insert(projectMetadataEvent).values({
            id: crypto.randomUUID(),
            projectId: id,
            version: updated.version,
            previous,
            current: projectMetadataSnapshot(updated),
            changedFields,
          });
        }
        const [owner] = await tx
          .select({ id: domain.id, name: domain.name })
          .from(projectDomainLink)
          .innerJoin(domain, eq(domain.id, projectDomainLink.domainId))
          .where(
            and(
              eq(projectDomainLink.projectId, id),
              eq(projectDomainLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        return projectSummary(saved, owner ?? null);
      });
    },
    async listProjectMetadataEvents(
      projectId: string,
      input: { limit: number; beforeVersion?: number },
    ) {
      const rows = await db
        .select()
        .from(projectMetadataEvent)
        .where(
          and(
            eq(projectMetadataEvent.projectId, projectId),
            input.beforeVersion
              ? lt(projectMetadataEvent.version, input.beforeVersion)
              : undefined,
          ),
        )
        .orderBy(desc(projectMetadataEvent.version))
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(projectMetadataEventRecord),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.version ?? null) : null,
      };
    },
    async getProjectMetadataEvent(projectId: string, version: number) {
      const [row] = await db
        .select()
        .from(projectMetadataEvent)
        .where(
          and(
            eq(projectMetadataEvent.projectId, projectId),
            eq(projectMetadataEvent.version, version),
          ),
        )
        .limit(1);
      return row ? projectMetadataEventRecord(row) : null;
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
