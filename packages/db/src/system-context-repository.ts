import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  requireEditableSystem,
  requireSystemWithoutLinks,
  systemDomainChange,
  SystemContextError,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  domain,
  project,
  resource,
  system,
  systemAuditEvent,
  systemDomainLink,
  systemProjectLink,
  systemResourceLink,
} from "./schema";

type Page = { limit: number; cursor?: string | undefined };

function systemRecord(
  row: typeof system.$inferSelect,
  owner?: typeof domain.$inferSelect | null,
) {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    lifecycle: row.lifecycle,
    version: row.version,
    ...(owner !== undefined
      ? { domain: owner ? { id: owner.id, name: owner.name } : null }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function domainRecord(row: typeof domain.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lifecycle: row.lifecycle,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

function resourceRecord(row: typeof resource.$inferSelect) {
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

function domainLinkRecord(row: typeof systemDomainLink.$inferSelect) {
  return {
    id: row.id,
    systemId: row.systemId,
    domainId: row.domainId,
    type: "owned_by" as const,
    inverseType: "owns" as const,
    sourceKind: "system" as const,
    targetKind: "domain" as const,
    lifecycle: row.lifecycle,
    provenance: "manual" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function projectLinkRecord(row: typeof systemProjectLink.$inferSelect) {
  return {
    id: row.id,
    systemId: row.systemId,
    projectId: row.projectId,
    type: "relates_to" as const,
    inverseType: "relates_to" as const,
    sourceKind: "system" as const,
    targetKind: "project" as const,
    lifecycle: row.lifecycle,
    provenance: "manual" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function resourceLinkRecord(row: typeof systemResourceLink.$inferSelect) {
  return {
    id: row.id,
    systemId: row.systemId,
    resourceId: row.resourceId,
    type: "supports" as const,
    inverseType: "supported_by" as const,
    sourceKind: "resource" as const,
    targetKind: "system" as const,
    lifecycle: row.lifecycle,
    provenance: "manual" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function auditRecord(row: typeof systemAuditEvent.$inferSelect) {
  return {
    id: row.id,
    systemId: row.systemId,
    actor: "local-user:unattributed" as const,
    operation: row.operation as
      | "system.created"
      | "system.updated"
      | "system.archived"
      | "system.domain_linked"
      | "system.domain_unlinked"
      | "system.project_linked"
      | "system.project_unlinked"
      | "system.resource_linked"
      | "system.resource_unlinked",
    details: row.details,
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

export function createSystemContextRepository(db: CommandryDatabase) {
  return {
    async createSystem(input: {
      id: string;
      name: string;
      summary?: string | undefined;
    }) {
      return db.transaction(async (tx) => {
        const [saved] = await tx
          .insert(system)
          .values({
            id: input.id,
            name: input.name,
            summary: input.summary ?? null,
          })
          .returning();
        if (!saved) throw new Error("System insert returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId: saved.id,
          operation: "system.created",
          details: { name: saved.name },
        });
        return systemRecord(saved, null);
      });
    },
    async getSystem(id: string) {
      const [row] = await db
        .select({ record: system, owner: domain })
        .from(system)
        .leftJoin(
          systemDomainLink,
          and(
            eq(systemDomainLink.systemId, system.id),
            eq(systemDomainLink.lifecycle, "active"),
          ),
        )
        .leftJoin(domain, eq(domain.id, systemDomainLink.domainId))
        .where(eq(system.id, id))
        .limit(1);
      return row ? systemRecord(row.record, row.owner) : null;
    },
    async listSystems(input: Page & { lifecycle?: "active" | "archived" }) {
      const rows = await db
        .select({ record: system, owner: domain })
        .from(system)
        .leftJoin(
          systemDomainLink,
          and(
            eq(systemDomainLink.systemId, system.id),
            eq(systemDomainLink.lifecycle, "active"),
          ),
        )
        .leftJoin(domain, eq(domain.id, systemDomainLink.domainId))
        .where(
          and(
            input.cursor ? gt(system.id, input.cursor) : undefined,
            input.lifecycle ? eq(system.lifecycle, input.lifecycle) : undefined,
          ),
        )
        .orderBy(system.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ record, owner }) => systemRecord(record, owner),
        ({ record }) => record.id,
      );
    },
    async updateSystem(
      id: string,
      input: {
        expectedVersion: number;
        name?: string | undefined;
        summary?: string | null | undefined;
      },
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(system)
          .where(eq(system.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new SystemContextError("SYSTEM_NOT_FOUND", "System not found");
        requireEditableSystem(current, input.expectedVersion);
        const name = input.name ?? current.name;
        const summary =
          input.summary === undefined ? current.summary : input.summary;
        if (name === current.name && summary === current.summary)
          return systemRecord(current);
        const [saved] = await tx
          .update(system)
          .set({
            name,
            summary,
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(system.id, id))
          .returning();
        if (!saved) throw new Error("System update returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId: id,
          operation: "system.updated",
          details: { previousName: current.name, name, version: saved.version },
        });
        return systemRecord(saved);
      });
    },
    async archiveSystem(id: string, expectedVersion: number) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(system)
          .where(eq(system.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new SystemContextError("SYSTEM_NOT_FOUND", "System not found");
        requireEditableSystem(current, expectedVersion);
        const [domains] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(systemDomainLink)
          .where(
            and(
              eq(systemDomainLink.systemId, id),
              eq(systemDomainLink.lifecycle, "active"),
            ),
          );
        const [projects] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(systemProjectLink)
          .where(
            and(
              eq(systemProjectLink.systemId, id),
              eq(systemProjectLink.lifecycle, "active"),
            ),
          );
        const [resources] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(systemResourceLink)
          .where(
            and(
              eq(systemResourceLink.systemId, id),
              eq(systemResourceLink.lifecycle, "active"),
            ),
          );
        requireSystemWithoutLinks(
          (domains?.count ?? 0) +
            (projects?.count ?? 0) +
            (resources?.count ?? 0),
        );
        const [saved] = await tx
          .update(system)
          .set({
            lifecycle: "archived",
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(system.id, id))
          .returning();
        if (!saved) throw new Error("System archive returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId: id,
          operation: "system.archived",
          details: { version: saved.version },
        });
        return systemRecord(saved, null);
      });
    },
    async getSystemDomain(systemId: string) {
      const [row] = await db
        .select({ link: systemDomainLink, owner: domain })
        .from(systemDomainLink)
        .innerJoin(domain, eq(domain.id, systemDomainLink.domainId))
        .where(
          and(
            eq(systemDomainLink.systemId, systemId),
            eq(systemDomainLink.lifecycle, "active"),
          ),
        )
        .limit(1);
      return row
        ? { domain: domainRecord(row.owner), link: domainLinkRecord(row.link) }
        : null;
    },
    async setSystemDomain(
      systemId: string,
      input: { domainId: string | null; expectedDomainId: string | null },
    ) {
      return db.transaction(async (tx) => {
        const [currentSystem] = await tx
          .select()
          .from(system)
          .where(eq(system.id, systemId))
          .for("update")
          .limit(1);
        if (!currentSystem)
          throw new SystemContextError("SYSTEM_NOT_FOUND", "System not found");
        if (currentSystem.lifecycle !== "active")
          throw new SystemContextError(
            "SYSTEM_ARCHIVED",
            "Archived systems cannot be changed",
          );
        const [current] = await tx
          .select()
          .from(systemDomainLink)
          .where(
            and(
              eq(systemDomainLink.systemId, systemId),
              eq(systemDomainLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        const change = systemDomainChange(
          current?.domainId ?? null,
          input.expectedDomainId,
          input.domainId,
        );
        const [target] = input.domainId
          ? await tx
              .select()
              .from(domain)
              .where(eq(domain.id, input.domainId))
              .for("share")
              .limit(1)
          : [];
        if (input.domainId && !target)
          throw new SystemContextError("DOMAIN_NOT_FOUND", "Domain not found");
        if (target?.lifecycle === "archived")
          throw new SystemContextError(
            "DOMAIN_ARCHIVED",
            "Archived domains cannot own systems",
          );
        if (change === "noop") {
          return current && target
            ? { domain: domainRecord(target), link: domainLinkRecord(current) }
            : null;
        }
        const now = new Date();
        if (current) {
          await tx
            .update(systemDomainLink)
            .set({ lifecycle: "archived", archivedAt: now })
            .where(eq(systemDomainLink.id, current.id));
          await tx.insert(systemAuditEvent).values({
            id: crypto.randomUUID(),
            systemId,
            operation: "system.domain_unlinked",
            details: { domainId: current.domainId, linkId: current.id },
            createdAt: now,
          });
        }
        if (!target) return null;
        const [saved] = await tx
          .insert(systemDomainLink)
          .values({
            id: crypto.randomUUID(),
            systemId,
            domainId: target.id,
            createdAt: now,
          })
          .returning();
        if (!saved)
          throw new Error("System domain link insert returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId,
          operation: "system.domain_linked",
          details: { domainId: target.id, linkId: saved.id },
          createdAt: now,
        });
        return { domain: domainRecord(target), link: domainLinkRecord(saved) };
      });
    },
    async listDomainSystems(domainId: string, input: Page) {
      const [owner] = await db
        .select({ id: domain.id })
        .from(domain)
        .where(eq(domain.id, domainId))
        .limit(1);
      if (!owner)
        throw new SystemContextError("DOMAIN_NOT_FOUND", "Domain not found");
      const rows = await db
        .select({ link: systemDomainLink, record: system, owner: domain })
        .from(systemDomainLink)
        .innerJoin(system, eq(system.id, systemDomainLink.systemId))
        .innerJoin(domain, eq(domain.id, systemDomainLink.domainId))
        .where(
          and(
            eq(systemDomainLink.domainId, domainId),
            eq(systemDomainLink.lifecycle, "active"),
            input.cursor ? gt(systemDomainLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(systemDomainLink.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ record, owner }) => systemRecord(record, owner),
        ({ link }) => link.id,
      );
    },
    async getSystemDomainLink(id: string) {
      const [row] = await db
        .select()
        .from(systemDomainLink)
        .where(eq(systemDomainLink.id, id))
        .limit(1);
      return row ? domainLinkRecord(row) : null;
    },
    async listSystemProjects(systemId: string, input: Page) {
      const rows = await db
        .select({ link: systemProjectLink, record: system, target: project })
        .from(systemProjectLink)
        .innerJoin(system, eq(system.id, systemProjectLink.systemId))
        .innerJoin(project, eq(project.id, systemProjectLink.projectId))
        .where(
          and(
            eq(systemProjectLink.systemId, systemId),
            eq(systemProjectLink.lifecycle, "active"),
            input.cursor ? gt(systemProjectLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(systemProjectLink.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ link, record, target }) => ({
          system: systemRecord(record),
          project: projectRecord(target),
          link: projectLinkRecord(link),
        }),
        ({ link }) => link.id,
      );
    },
    async listProjectSystems(projectId: string, input: Page) {
      const [target] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      if (!target)
        throw new SystemContextError("PROJECT_NOT_FOUND", "Project not found");
      const rows = await db
        .select({ link: systemProjectLink, record: system, target: project })
        .from(systemProjectLink)
        .innerJoin(system, eq(system.id, systemProjectLink.systemId))
        .innerJoin(project, eq(project.id, systemProjectLink.projectId))
        .where(
          and(
            eq(systemProjectLink.projectId, projectId),
            eq(systemProjectLink.lifecycle, "active"),
            input.cursor ? gt(systemProjectLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(systemProjectLink.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ link, record, target }) => ({
          system: systemRecord(record),
          project: projectRecord(target),
          link: projectLinkRecord(link),
        }),
        ({ link }) => link.id,
      );
    },
    async linkSystemProject(systemId: string, projectId: string) {
      return db.transaction(async (tx) => {
        const [currentSystem] = await tx
          .select()
          .from(system)
          .where(eq(system.id, systemId))
          .for("update")
          .limit(1);
        if (!currentSystem)
          throw new SystemContextError("SYSTEM_NOT_FOUND", "System not found");
        if (currentSystem.lifecycle !== "active")
          throw new SystemContextError(
            "SYSTEM_ARCHIVED",
            "Archived systems cannot be changed",
          );
        const [target] = await tx
          .select()
          .from(project)
          .where(eq(project.id, projectId))
          .limit(1);
        if (!target)
          throw new SystemContextError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        const [existing] = await tx
          .select()
          .from(systemProjectLink)
          .where(
            and(
              eq(systemProjectLink.systemId, systemId),
              eq(systemProjectLink.projectId, projectId),
              eq(systemProjectLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        if (existing)
          return {
            system: systemRecord(currentSystem),
            project: projectRecord(target),
            link: projectLinkRecord(existing),
          };
        const [saved] = await tx
          .insert(systemProjectLink)
          .values({ id: crypto.randomUUID(), systemId, projectId })
          .returning();
        if (!saved)
          throw new Error("System project link insert returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId,
          operation: "system.project_linked",
          details: { projectId, linkId: saved.id },
        });
        return {
          system: systemRecord(currentSystem),
          project: projectRecord(target),
          link: projectLinkRecord(saved),
        };
      });
    },
    async archiveSystemProjectLink(id: string) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ systemId: systemProjectLink.systemId })
          .from(systemProjectLink)
          .where(eq(systemProjectLink.id, id))
          .limit(1);
        if (!candidate)
          throw new SystemContextError(
            "SYSTEM_LINK_NOT_FOUND",
            "System project link not found",
          );
        await tx
          .select({ id: system.id })
          .from(system)
          .where(eq(system.id, candidate.systemId))
          .for("update")
          .limit(1);
        const [current] = await tx
          .select()
          .from(systemProjectLink)
          .where(eq(systemProjectLink.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new SystemContextError(
            "SYSTEM_LINK_NOT_FOUND",
            "System project link not found",
          );
        if (current.lifecycle === "archived") return projectLinkRecord(current);
        const [saved] = await tx
          .update(systemProjectLink)
          .set({ lifecycle: "archived", archivedAt: new Date() })
          .where(eq(systemProjectLink.id, id))
          .returning();
        if (!saved) throw new Error("System project archive returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId: current.systemId,
          operation: "system.project_unlinked",
          details: { projectId: current.projectId, linkId: id },
        });
        return projectLinkRecord(saved);
      });
    },
    async getSystemProjectLink(id: string) {
      const [row] = await db
        .select()
        .from(systemProjectLink)
        .where(eq(systemProjectLink.id, id))
        .limit(1);
      return row ? projectLinkRecord(row) : null;
    },
    async listSystemResources(systemId: string, input: Page) {
      const rows = await db
        .select({ link: systemResourceLink, record: system, target: resource })
        .from(systemResourceLink)
        .innerJoin(system, eq(system.id, systemResourceLink.systemId))
        .innerJoin(resource, eq(resource.id, systemResourceLink.resourceId))
        .where(
          and(
            eq(systemResourceLink.systemId, systemId),
            eq(systemResourceLink.lifecycle, "active"),
            input.cursor ? gt(systemResourceLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(systemResourceLink.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ link, record, target }) => ({
          system: systemRecord(record),
          resource: resourceRecord(target),
          link: resourceLinkRecord(link),
        }),
        ({ link }) => link.id,
      );
    },
    async listResourceSystems(resourceId: string, input: Page) {
      const [target] = await db
        .select({ id: resource.id })
        .from(resource)
        .where(eq(resource.id, resourceId))
        .limit(1);
      if (!target)
        throw new SystemContextError(
          "RESOURCE_NOT_FOUND",
          "Resource not found",
        );
      const rows = await db
        .select({ link: systemResourceLink, record: system, target: resource })
        .from(systemResourceLink)
        .innerJoin(system, eq(system.id, systemResourceLink.systemId))
        .innerJoin(resource, eq(resource.id, systemResourceLink.resourceId))
        .where(
          and(
            eq(systemResourceLink.resourceId, resourceId),
            eq(systemResourceLink.lifecycle, "active"),
            input.cursor ? gt(systemResourceLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(systemResourceLink.id)
        .limit(input.limit + 1);
      return pageResult(
        rows,
        input.limit,
        ({ link, record, target }) => ({
          system: systemRecord(record),
          resource: resourceRecord(target),
          link: resourceLinkRecord(link),
        }),
        ({ link }) => link.id,
      );
    },
    async linkSystemResource(systemId: string, resourceId: string) {
      return db.transaction(async (tx) => {
        const [currentSystem] = await tx
          .select()
          .from(system)
          .where(eq(system.id, systemId))
          .for("update")
          .limit(1);
        if (!currentSystem)
          throw new SystemContextError("SYSTEM_NOT_FOUND", "System not found");
        if (currentSystem.lifecycle !== "active")
          throw new SystemContextError(
            "SYSTEM_ARCHIVED",
            "Archived systems cannot be changed",
          );
        const [target] = await tx
          .select()
          .from(resource)
          .where(eq(resource.id, resourceId))
          .limit(1);
        if (!target)
          throw new SystemContextError(
            "RESOURCE_NOT_FOUND",
            "Resource not found",
          );
        const [existing] = await tx
          .select()
          .from(systemResourceLink)
          .where(
            and(
              eq(systemResourceLink.systemId, systemId),
              eq(systemResourceLink.resourceId, resourceId),
              eq(systemResourceLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        if (existing)
          return {
            system: systemRecord(currentSystem),
            resource: resourceRecord(target),
            link: resourceLinkRecord(existing),
          };
        const [saved] = await tx
          .insert(systemResourceLink)
          .values({ id: crypto.randomUUID(), systemId, resourceId })
          .returning();
        if (!saved)
          throw new Error("System resource link insert returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId,
          operation: "system.resource_linked",
          details: { resourceId, linkId: saved.id },
        });
        return {
          system: systemRecord(currentSystem),
          resource: resourceRecord(target),
          link: resourceLinkRecord(saved),
        };
      });
    },
    async archiveSystemResourceLink(id: string) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ systemId: systemResourceLink.systemId })
          .from(systemResourceLink)
          .where(eq(systemResourceLink.id, id))
          .limit(1);
        if (!candidate)
          throw new SystemContextError(
            "SYSTEM_LINK_NOT_FOUND",
            "System resource link not found",
          );
        await tx
          .select({ id: system.id })
          .from(system)
          .where(eq(system.id, candidate.systemId))
          .for("update")
          .limit(1);
        const [current] = await tx
          .select()
          .from(systemResourceLink)
          .where(eq(systemResourceLink.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new SystemContextError(
            "SYSTEM_LINK_NOT_FOUND",
            "System resource link not found",
          );
        if (current.lifecycle === "archived")
          return resourceLinkRecord(current);
        const [saved] = await tx
          .update(systemResourceLink)
          .set({ lifecycle: "archived", archivedAt: new Date() })
          .where(eq(systemResourceLink.id, id))
          .returning();
        if (!saved) throw new Error("System resource archive returned no row");
        await tx.insert(systemAuditEvent).values({
          id: crypto.randomUUID(),
          systemId: current.systemId,
          operation: "system.resource_unlinked",
          details: { resourceId: current.resourceId, linkId: id },
        });
        return resourceLinkRecord(saved);
      });
    },
    async getSystemResourceLink(id: string) {
      const [row] = await db
        .select()
        .from(systemResourceLink)
        .where(eq(systemResourceLink.id, id))
        .limit(1);
      return row ? resourceLinkRecord(row) : null;
    },
    async listSystemAudit(systemId: string, input: Page) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: systemAuditEvent.createdAt })
            .from(systemAuditEvent)
            .where(
              and(
                eq(systemAuditEvent.id, input.cursor),
                eq(systemAuditEvent.systemId, systemId),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(systemAuditEvent)
        .where(
          and(
            eq(systemAuditEvent.systemId, systemId),
            input.cursor && anchor
              ? sql`(${systemAuditEvent.createdAt}, ${systemAuditEvent.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(systemAuditEvent.createdAt), desc(systemAuditEvent.id))
        .limit(input.limit + 1);
      return pageResult(rows, input.limit, auditRecord, (row) => row.id);
    },
  };
}
