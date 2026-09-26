import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type {
  CreateResourceDependencyRequest,
  SetResourceParentRequest,
} from "@commandry/contracts";
import { requireAcyclicParent, ResourceTopologyError } from "@commandry/domain";
import { resourceSummary } from "./catalog-repository";
import type { CommandryDatabase } from "./client";
import { resource, resourceDependency } from "./schema";

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
  };
}
