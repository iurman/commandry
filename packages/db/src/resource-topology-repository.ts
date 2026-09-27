import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type {
  CreateResourceDependencyRequest,
  SetResourceParentRequest,
} from "@commandry/contracts";
import {
  requireAcyclicParent,
  RESOURCE_IMPACT_MAX_HOPS,
  ResourceTopologyError,
} from "@commandry/domain";
import { resourceSummary } from "./catalog-repository";
import type { CommandryDatabase } from "./client";
import {
  localAttentionSignal,
  project,
  projectResourceLink,
  resource,
  resourceDependency,
} from "./schema";

type PageQuery = { limit: number; cursor?: string | undefined };

function pageResources(rows: (typeof resource.$inferSelect)[], limit: number) {
  const visible = rows.slice(0, limit);
  return {
    items: visible.map(resourceSummary),
    nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
  };
}

export function createResourceTopologyRepository(db: CommandryDatabase) {
  return {
    async setParent(resourceId: string, input: SetResourceParentRequest) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(441322083)`);
        const [current] = await tx
          .select()
          .from(resource)
          .where(eq(resource.id, resourceId))
          .for("update")
          .limit(1);
        if (!current) {
          throw new ResourceTopologyError(
            "RESOURCE_NOT_FOUND",
            "Resource not found",
          );
        }
        if (current.parentResourceId !== input.expectedParentResourceId) {
          throw new ResourceTopologyError(
            "PARENT_CONFLICT",
            "Resource parent changed; refresh before moving it",
          );
        }
        const ancestorIds = new Set<string>();
        let ancestorId = input.parentResourceId;
        while (ancestorId) {
          if (ancestorIds.has(ancestorId)) {
            throw new ResourceTopologyError(
              "HIERARCHY_CYCLE",
              "Resource hierarchy contains a cycle",
            );
          }
          ancestorIds.add(ancestorId);
          const [ancestor] = await tx
            .select({ parentResourceId: resource.parentResourceId })
            .from(resource)
            .where(eq(resource.id, ancestorId))
            .limit(1);
          if (!ancestor) {
            throw new ResourceTopologyError(
              "PARENT_NOT_FOUND",
              "Parent resource not found",
            );
          }
          ancestorId = ancestor.parentResourceId;
        }
        requireAcyclicParent(resourceId, input.parentResourceId, ancestorIds);
        if (current.parentResourceId === input.parentResourceId) {
          return resourceSummary(current);
        }
        const [updated] = await tx
          .update(resource)
          .set({
            parentResourceId: input.parentResourceId,
            updatedAt: new Date(),
          })
          .where(eq(resource.id, resourceId))
          .returning();
        if (!updated) throw new Error("Locked resource disappeared");
        return resourceSummary(updated);
      });
    },
    async listRoots(query: PageQuery) {
      const rows = await db
        .select()
        .from(resource)
        .where(
          and(
            isNull(resource.parentResourceId),
            query.cursor ? gt(resource.id, query.cursor) : undefined,
          ),
        )
        .orderBy(resource.id)
        .limit(query.limit + 1);
      return pageResources(rows, query.limit);
    },
    async listChildren(resourceId: string, query: PageQuery) {
      const [parent] = await db
        .select({ id: resource.id })
        .from(resource)
        .where(eq(resource.id, resourceId))
        .limit(1);
      if (!parent) {
        throw new ResourceTopologyError(
          "RESOURCE_NOT_FOUND",
          "Resource not found",
        );
      }
      const rows = await db
        .select()
        .from(resource)
        .where(
          and(
            eq(resource.parentResourceId, resourceId),
            query.cursor ? gt(resource.id, query.cursor) : undefined,
          ),
        )
        .orderBy(resource.id)
        .limit(query.limit + 1);
      return pageResources(rows, query.limit);
    },
    async addDependency(
      resourceId: string,
      input: CreateResourceDependencyRequest,
    ) {
      return db.transaction(async (tx) => {
        const [dependent] = await tx
          .select({ id: resource.id })
          .from(resource)
          .where(eq(resource.id, resourceId))
          .limit(1);
        if (!dependent) {
          throw new ResourceTopologyError(
            "RESOURCE_NOT_FOUND",
            "Resource not found",
          );
        }
        const [required] = await tx
          .select()
          .from(resource)
          .where(eq(resource.id, input.requiredResourceId))
          .limit(1);
        if (!required) {
          throw new ResourceTopologyError(
            "RESOURCE_NOT_FOUND",
            "Required resource not found",
          );
        }
        const [inserted] = await tx
          .insert(resourceDependency)
          .values({
            id: crypto.randomUUID(),
            dependentResourceId: resourceId,
            requiredResourceId: input.requiredResourceId,
          })
          .onConflictDoNothing({
            target: [
              resourceDependency.dependentResourceId,
              resourceDependency.requiredResourceId,
            ],
          })
          .returning();
        if (!inserted) {
          throw new ResourceTopologyError(
            "DEPENDENCY_EXISTS",
            "This resource dependency already exists",
          );
        }
        return {
          id: inserted.id,
          type: "depends_on" as const,
          inverseType: "required_by" as const,
          direction: "outgoing" as const,
          resource: resourceSummary(required),
          createdAt: inserted.createdAt.toISOString(),
        };
      });
    },
    async listDependencies(
      resourceId: string,
      query: PageQuery & { direction: "outgoing" | "incoming" },
    ) {
      const [subject] = await db
        .select({ id: resource.id })
        .from(resource)
        .where(eq(resource.id, resourceId))
        .limit(1);
      if (!subject) {
        throw new ResourceTopologyError(
          "RESOURCE_NOT_FOUND",
          "Resource not found",
        );
      }
      const subjectColumn =
        query.direction === "outgoing"
          ? resourceDependency.dependentResourceId
          : resourceDependency.requiredResourceId;
      const relatedColumn =
        query.direction === "outgoing"
          ? resourceDependency.requiredResourceId
          : resourceDependency.dependentResourceId;
      const rows = await db
        .select({ link: resourceDependency, related: resource })
        .from(resourceDependency)
        .innerJoin(resource, eq(resource.id, relatedColumn))
        .where(
          and(
            eq(subjectColumn, resourceId),
            query.cursor ? gt(resourceDependency.id, query.cursor) : undefined,
          ),
        )
        .orderBy(resourceDependency.id)
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(({ link, related }) => ({
          id: link.id,
          type: "depends_on" as const,
          inverseType: "required_by" as const,
          direction: query.direction,
          resource: resourceSummary(related),
          createdAt: link.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.link.id ?? null) : null,
      };
    },
    async listImpact(resourceId: string, query: PageQuery) {
      const [subject] = await db
        .select()
        .from(resource)
        .where(eq(resource.id, resourceId))
        .limit(1);
      if (!subject) {
        throw new ResourceTopologyError(
          "RESOURCE_NOT_FOUND",
          "Resource not found",
        );
      }
      const cursorFilter = query.cursor
        ? sql`candidate.resource_id > ${query.cursor}::uuid`
        : sql`true`;
      const paths = await db.execute<{
        resourceId: string;
        path: string[];
        depth: number;
      }>(sql`
        with recursive walk as (
          select link.dependent_resource_id as resource_id,
            array[${resourceId}::uuid, link.dependent_resource_id] as path,
            1::integer as depth
          from resource_dependency link
          where link.required_resource_id = ${resourceId}::uuid
          union all
          select link.dependent_resource_id, walk.path || link.dependent_resource_id,
            walk.depth + 1
          from walk
          join resource_dependency link
            on link.required_resource_id = walk.resource_id
          where walk.depth < ${RESOURCE_IMPACT_MAX_HOPS}
            and not link.dependent_resource_id = any(walk.path)
        ), candidate as (
          select resource_id, path, depth,
            row_number() over (
              partition by resource_id order by depth, path::text
            ) as priority
          from walk
        )
        select candidate.resource_id as "resourceId", candidate.path,
          candidate.depth
        from candidate
        where candidate.priority = 1 and ${cursorFilter}
        order by candidate.resource_id
        limit ${query.limit + 1}
      `);
      const visible = paths.rows.slice(0, query.limit);
      const nodeIds = [
        ...new Set([resourceId, ...visible.flatMap((row) => row.path)]),
      ];
      const [nodes, projectLinks, [drop]] = await Promise.all([
        db.select().from(resource).where(inArray(resource.id, nodeIds)),
        db
          .select({
            resourceId: projectResourceLink.resourceId,
            id: project.id,
            name: project.name,
          })
          .from(projectResourceLink)
          .innerJoin(project, eq(projectResourceLink.projectId, project.id))
          .where(
            and(
              inArray(projectResourceLink.resourceId, nodeIds),
              eq(projectResourceLink.type, "supports"),
              eq(projectResourceLink.lifecycle, "active"),
            ),
          )
          .orderBy(project.name, project.id),
        db
          .select({ signal: localAttentionSignal, projectName: project.name })
          .from(localAttentionSignal)
          .innerJoin(project, eq(localAttentionSignal.projectId, project.id))
          .where(
            and(
              eq(localAttentionSignal.resourceId, resourceId),
              eq(localAttentionSignal.ruleId, "metric_drop"),
              eq(localAttentionSignal.state, "active"),
              isNotNull(localAttentionSignal.previousEvidenceId),
              isNotNull(localAttentionSignal.previousValue),
              isNotNull(localAttentionSignal.latestValue),
            ),
          )
          .orderBy(
            desc(localAttentionSignal.changedAt),
            desc(localAttentionSignal.id),
          )
          .limit(1),
      ]);
      const nodeById = new Map(
        nodes.map((node) => [node.id, resourceSummary(node)]),
      );
      const projectsByResource = new Map<
        string,
        Array<{ id: string; name: string; resourceId: string }>
      >();
      for (const link of projectLinks) {
        const list = projectsByResource.get(link.resourceId) ?? [];
        list.push(link);
        projectsByResource.set(link.resourceId, list);
      }
      const items = visible.map((row) => {
        const path = row.path.map((id) => nodeById.get(id));
        const impacted = nodeById.get(row.resourceId);
        if (!impacted || path.some((node) => !node)) {
          throw new Error("Resource impact path changed during the read");
        }
        return {
          resource: impacted,
          depth: row.depth,
          path: path as Array<NonNullable<(typeof path)[number]>>,
          projects: projectsByResource.get(row.resourceId) ?? [],
        };
      });
      return {
        source: resourceSummary(subject),
        sourceProjects: projectsByResource.get(resourceId) ?? [],
        latestSyntheticDrop:
          drop &&
          drop.signal.previousEvidenceId &&
          drop.signal.previousValue !== null &&
          drop.signal.latestValue !== null
            ? {
                id: drop.signal.id,
                projectId: drop.signal.projectId,
                projectName: drop.projectName,
                reason: drop.signal.reason,
                observedAt: drop.signal.observedAt.toISOString(),
                previousValue: drop.signal.previousValue,
                latestValue: drop.signal.latestValue,
                threshold: drop.signal.threshold,
                evidenceHref: `/api/v1/metrics/${drop.signal.evidenceId}`,
                previousEvidenceHref: `/api/v1/metrics/${drop.signal.previousEvidenceId}`,
              }
            : null,
        items,
        nextCursor:
          paths.rows.length > query.limit
            ? (visible.at(-1)?.resourceId ?? null)
            : null,
        maxHops: 6 as const,
        sourceLabel:
          "Recorded local dependencies and synthetic attention" as const,
        realHealth: "unknown" as const,
      };
    },
  };
}
