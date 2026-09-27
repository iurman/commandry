import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  DomainPortfolioError,
  projectDomainChange,
  requireArchivableDomain,
  requireEditableDomain,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { domain, domainAuditEvent, project, projectDomainLink } from "./schema";

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

function linkRecord(row: typeof projectDomainLink.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    domainId: row.domainId,
    type: "owned_by" as const,
    inverseType: "owns" as const,
    sourceKind: "project" as const,
    targetKind: "domain" as const,
    lifecycle: row.lifecycle,
    provenance: "manual" as const,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function auditRecord(row: typeof domainAuditEvent.$inferSelect) {
  return {
    id: row.id,
    domainId: row.domainId,
    projectId: row.projectId,
    actor: "local-user:unattributed" as const,
    operation: row.operation as
      | "domain.created"
      | "domain.updated"
      | "domain.archived"
      | "domain.project_linked"
      | "domain.project_unlinked",
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

type Page = { limit: number; cursor?: string | undefined };

export function createDomainPortfolioRepository(db: CommandryDatabase) {
  return {
    async createDomain(input: {
      id: string;
      name: string;
      description?: string | undefined;
    }) {
      return db.transaction(async (tx) => {
        const [saved] = await tx
          .insert(domain)
          .values({
            id: input.id,
            name: input.name,
            description: input.description ?? null,
          })
          .returning();
        if (!saved) throw new Error("Domain insert returned no row");
        await tx.insert(domainAuditEvent).values({
          id: crypto.randomUUID(),
          domainId: saved.id,
          operation: "domain.created",
          details: { name: saved.name },
        });
        return domainRecord(saved);
      });
    },
    async getDomain(id: string) {
      const [row] = await db
        .select()
        .from(domain)
        .where(eq(domain.id, id))
        .limit(1);
      return row ? domainRecord(row) : null;
    },
    async hasProject(id: string) {
      const [row] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, id))
        .limit(1);
      return Boolean(row);
    },
    async listDomains(input: Page & { lifecycle?: "active" | "archived" }) {
      const rows = await db
        .select()
        .from(domain)
        .where(
          and(
            input.cursor ? gt(domain.id, input.cursor) : undefined,
            input.lifecycle ? eq(domain.lifecycle, input.lifecycle) : undefined,
          ),
        )
        .orderBy(domain.id)
        .limit(input.limit + 1);
      const visible = rows.slice(0, input.limit);
      return {
        items: visible.map(domainRecord),
        nextCursor:
          rows.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async updateDomain(
      id: string,
      input: {
        expectedVersion: number;
        name?: string | undefined;
        description?: string | null | undefined;
      },
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(domain)
          .where(eq(domain.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new DomainPortfolioError(
            "DOMAIN_NOT_FOUND",
            "Domain not found",
          );
        requireEditableDomain(current, input.expectedVersion);
        const nextName = input.name ?? current.name;
        const nextDescription =
          input.description === undefined
            ? current.description
            : input.description;
        if (
          nextName === current.name &&
          nextDescription === current.description
        )
          return domainRecord(current);
        const [updated] = await tx
          .update(domain)
          .set({
            name: nextName,
            description: nextDescription,
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(domain.id, id))
          .returning();
        if (!updated) throw new Error("Domain update returned no row");
        await tx.insert(domainAuditEvent).values({
          id: crypto.randomUUID(),
          domainId: id,
          operation: "domain.updated",
          details: {
            previousName: current.name,
            name: updated.name,
            previousDescription: current.description,
            description: updated.description,
            version: updated.version,
          },
        });
        return domainRecord(updated);
      });
    },
    async archiveDomain(id: string, expectedVersion: number) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(domain)
          .where(eq(domain.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new DomainPortfolioError(
            "DOMAIN_NOT_FOUND",
            "Domain not found",
          );
        requireEditableDomain(current, expectedVersion);
        const [activeCount] = await tx
          .select({ count: sql<number>`count(*)::integer` })
          .from(projectDomainLink)
          .where(
            and(
              eq(projectDomainLink.domainId, id),
              eq(projectDomainLink.lifecycle, "active"),
            ),
          );
        requireArchivableDomain(activeCount?.count ?? 0);
        const [updated] = await tx
          .update(domain)
          .set({
            lifecycle: "archived",
            version: current.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(domain.id, id))
          .returning();
        if (!updated) throw new Error("Domain archive returned no row");
        await tx.insert(domainAuditEvent).values({
          id: crypto.randomUUID(),
          domainId: id,
          operation: "domain.archived",
          details: { version: updated.version },
        });
        return domainRecord(updated);
      });
    },
    async getProjectDomain(projectId: string) {
      const [saved] = await db
        .select({ link: projectDomainLink, owner: domain })
        .from(projectDomainLink)
        .innerJoin(domain, eq(domain.id, projectDomainLink.domainId))
        .where(
          and(
            eq(projectDomainLink.projectId, projectId),
            eq(projectDomainLink.lifecycle, "active"),
          ),
        )
        .limit(1);
      return saved
        ? { domain: domainRecord(saved.owner), link: linkRecord(saved.link) }
        : null;
    },
    async setProjectDomain(
      projectId: string,
      input: {
        domainId: string | null;
        expectedDomainId: string | null;
      },
    ) {
      return db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: project.id })
          .from(project)
          .where(eq(project.id, projectId))
          .for("update")
          .limit(1);
        if (!owner)
          throw new DomainPortfolioError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        const [current] = await tx
          .select()
          .from(projectDomainLink)
          .where(
            and(
              eq(projectDomainLink.projectId, projectId),
              eq(projectDomainLink.lifecycle, "active"),
            ),
          )
          .limit(1);
        const decision = projectDomainChange(
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
          throw new DomainPortfolioError(
            "DOMAIN_NOT_FOUND",
            "Domain not found",
          );
        if (target?.lifecycle === "archived")
          throw new DomainPortfolioError(
            "DOMAIN_ARCHIVED",
            "Archived domains cannot own projects",
          );
        if (decision === "noop") {
          return current && target
            ? { domain: domainRecord(target), link: linkRecord(current) }
            : null;
        }
        const now = new Date();
        if (current) {
          await tx
            .update(projectDomainLink)
            .set({ lifecycle: "archived", archivedAt: now })
            .where(eq(projectDomainLink.id, current.id));
          await tx.insert(domainAuditEvent).values({
            id: crypto.randomUUID(),
            domainId: current.domainId,
            projectId,
            operation: "domain.project_unlinked",
            details: { linkId: current.id, nextDomainId: target?.id ?? null },
            createdAt: now,
          });
        }
        if (!target) return null;
        const [linked] = await tx
          .insert(projectDomainLink)
          .values({
            id: crypto.randomUUID(),
            projectId,
            domainId: target.id,
            createdAt: now,
          })
          .returning();
        if (!linked) throw new Error("Domain link insert returned no row");
        await tx.insert(domainAuditEvent).values({
          id: crypto.randomUUID(),
          domainId: target.id,
          projectId,
          operation: "domain.project_linked",
          details: {
            linkId: linked.id,
            previousDomainId: current?.domainId ?? null,
          },
          createdAt: now,
        });
        return { domain: domainRecord(target), link: linkRecord(linked) };
      });
    },
    async getProjectDomainLink(id: string) {
      const [row] = await db
        .select()
        .from(projectDomainLink)
        .where(eq(projectDomainLink.id, id))
        .limit(1);
      return row ? linkRecord(row) : null;
    },
    async listDomainProjects(domainId: string, input: Page) {
      const rows = await db
        .select({ link: projectDomainLink, project, owner: domain })
        .from(projectDomainLink)
        .innerJoin(project, eq(project.id, projectDomainLink.projectId))
        .innerJoin(domain, eq(domain.id, projectDomainLink.domainId))
        .where(
          and(
            eq(projectDomainLink.domainId, domainId),
            eq(projectDomainLink.lifecycle, "active"),
            input.cursor ? gt(projectDomainLink.id, input.cursor) : undefined,
          ),
        )
        .orderBy(projectDomainLink.id)
        .limit(input.limit + 1);
      const visible = rows.slice(0, input.limit);
      return {
        items: visible.map(({ project: item, owner }) => ({
          id: item.id,
          name: item.name,
          summary: item.summary,
          type: item.type,
          lifecycle: item.lifecycle,
          domain: { id: owner.id, name: owner.name },
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        nextCursor:
          rows.length > input.limit ? (visible.at(-1)?.link.id ?? null) : null,
      };
    },
    async listDomainAudit(domainId: string, input: Page) {
      const [anchor] = input.cursor
        ? await db
            .select({ createdAt: domainAuditEvent.createdAt })
            .from(domainAuditEvent)
            .where(
              and(
                eq(domainAuditEvent.id, input.cursor),
                eq(domainAuditEvent.domainId, domainId),
              ),
            )
            .limit(1)
        : [];
      if (input.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(domainAuditEvent)
        .where(
          and(
            eq(domainAuditEvent.domainId, domainId),
            input.cursor && anchor
              ? sql`(${domainAuditEvent.createdAt}, ${domainAuditEvent.id}) < (${anchor.createdAt}, ${input.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(domainAuditEvent.createdAt), desc(domainAuditEvent.id))
        .limit(input.limit + 1);
      const visible = rows.slice(0, input.limit);
      return {
        items: visible.map(auditRecord),
        nextCursor:
          rows.length > input.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
