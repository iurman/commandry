import { and, desc, eq, sql } from "drizzle-orm";
import type { CreateLocalIntegrationRequest } from "@commandry/contracts";
import {
  classifyObservationFreshness,
  LocalIntegrationError,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  integrationInstance,
  integrationInstanceAudit,
  project,
  projectResourceLink,
  resource,
} from "./schema";

const lastImportId = sql<string | null>`(
  select id from synthetic_event_import
  where integration_instance_id = ${integrationInstance.id}
  order by created_at desc, id desc limit 1
)`;
const lastAttemptAt = sql<Date | null>`(
  select created_at from synthetic_event_import
  where integration_instance_id = ${integrationInstance.id}
  order by created_at desc, id desc limit 1
)`;
const lastSuccessAt = sql<Date | null>`(
  select completed_at from synthetic_event_import
  where integration_instance_id = ${integrationInstance.id} and state = 'succeeded'
  order by completed_at desc, id desc limit 1
)`;
const lastError = sql<string | null>`(
  select error from synthetic_event_import
  where integration_instance_id = ${integrationInstance.id}
  order by created_at desc, id desc limit 1
)`;
const lastObservedAt = sql<Date | null>`(
  select envelope.occurred_at from source_envelope envelope
  join synthetic_event_import imported on imported.id = envelope.import_id
  where imported.integration_instance_id = ${integrationInstance.id} and imported.state = 'succeeded'
  order by envelope.occurred_at desc, envelope.id desc limit 1
)`;
const lastReceivedAt = sql<Date | null>`(
  select envelope.received_at from source_envelope envelope
  join synthetic_event_import imported on imported.id = envelope.import_id
  where imported.integration_instance_id = ${integrationInstance.id} and imported.state = 'succeeded'
  order by envelope.occurred_at desc, envelope.id desc limit 1
)`;
const lastEnvelopeId = sql<string | null>`(
  select envelope.id from source_envelope envelope
  join synthetic_event_import imported on imported.id = envelope.import_id
  where imported.integration_instance_id = ${integrationInstance.id} and imported.state = 'succeeded'
  order by envelope.occurred_at desc, envelope.id desc limit 1
)`;

function record(row: {
  instance: typeof integrationInstance.$inferSelect;
  projectName: string;
  resourceName: string | null;
  latestImportId: string | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastObservedAt: Date | null;
  lastReceivedAt: Date | null;
  lastEnvelopeId: string | null;
}) {
  return {
    id: row.instance.id,
    name: row.instance.name,
    kind: row.instance.kind,
    projectId: row.instance.projectId,
    projectName: row.projectName,
    resourceId: row.instance.resourceId,
    resourceName: row.resourceName,
    enabled: row.instance.enabled,
    adapterMode: "local_fixture" as const,
    isSynthetic: true as const,
    receiverConfigured: row.instance.receiverTokenDigest !== null,
    freshnessWindowMinutes: row.instance.freshnessWindowMinutes,
    freshnessState: classifyObservationFreshness(
      row.lastObservedAt ? new Date(row.lastObservedAt) : null,
      row.instance.freshnessWindowMinutes,
      new Date(),
    ),
    lastObservedAt: row.lastObservedAt
      ? new Date(row.lastObservedAt).toISOString()
      : null,
    lastReceivedAt: row.lastReceivedAt
      ? new Date(row.lastReceivedAt).toISOString()
      : null,
    observationEvidenceHref: row.lastEnvelopeId
      ? `/api/v1/source-envelopes/${row.lastEnvelopeId}`
      : null,
    latestImportId: row.latestImportId,
    lastAttemptAt: row.lastAttemptAt
      ? new Date(row.lastAttemptAt).toISOString()
      : null,
    lastSuccessAt: row.lastSuccessAt
      ? new Date(row.lastSuccessAt).toISOString()
      : null,
    lastError: row.lastError,
    nextAttemptAt: null,
    cursor: null,
    createdAt: row.instance.createdAt.toISOString(),
    updatedAt: row.instance.updatedAt.toISOString(),
  };
}

export function createLocalIntegrationRepository(db: CommandryDatabase) {
  function baseSelect() {
    return db
      .select({
        instance: integrationInstance,
        projectName: project.name,
        resourceName: resource.name,
        latestImportId: lastImportId,
        lastAttemptAt,
        lastSuccessAt,
        lastError,
        lastObservedAt,
        lastReceivedAt,
        lastEnvelopeId,
      })
      .from(integrationInstance)
      .innerJoin(project, eq(integrationInstance.projectId, project.id))
      .leftJoin(resource, eq(integrationInstance.resourceId, resource.id));
  }

  async function get(id: string) {
    const [row] = await baseSelect()
      .where(eq(integrationInstance.id, id))
      .limit(1);
    return row ? record(row) : null;
  }

  return {
    async create(input: CreateLocalIntegrationRequest) {
      const id = await db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: project.id })
          .from(project)
          .where(eq(project.id, input.projectId))
          .limit(1);
        if (!owner) {
          throw new LocalIntegrationError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        }
        if (input.kind === "synthetic-operations" && !input.resourceId) {
          throw new LocalIntegrationError(
            "RESOURCE_REQUIRED",
            "Operational fixture needs a project-linked resource",
          );
        }
        if (input.resourceId) {
          const [link] = await tx
            .select({ id: projectResourceLink.id })
            .from(projectResourceLink)
            .where(
              and(
                eq(projectResourceLink.projectId, input.projectId),
                eq(projectResourceLink.resourceId, input.resourceId),
                eq(projectResourceLink.lifecycle, "active"),
              ),
            )
            .limit(1);
          if (!link) {
            throw new LocalIntegrationError(
              "RESOURCE_NOT_LINKED",
              "Resource must be linked to this project",
            );
          }
        }
        const id = crypto.randomUUID();
        await tx.insert(integrationInstance).values({
          id,
          name: input.name,
          kind: input.kind,
          projectId: input.projectId,
          resourceId: input.resourceId,
        });
        await tx.insert(integrationInstanceAudit).values({
          id: crypto.randomUUID(),
          integrationInstanceId: id,
          actor: "local-user:unattributed",
          operation: "integration.created",
          details: {
            kind: input.kind,
            projectId: input.projectId,
            resourceId: input.resourceId,
          },
        });
        return id;
      });
      const created = await get(id);
      if (!created) throw new Error("Integration disappeared after creation");
      return created;
    },
    get,
    async list(query: {
      limit: number;
      cursor?: string | undefined;
      projectId?: string | undefined;
      resourceId?: string | undefined;
    }) {
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: integrationInstance.createdAt })
            .from(integrationInstance)
            .where(
              and(
                eq(integrationInstance.id, query.cursor),
                query.projectId
                  ? eq(integrationInstance.projectId, query.projectId)
                  : undefined,
                query.resourceId
                  ? eq(integrationInstance.resourceId, query.resourceId)
                  : undefined,
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await baseSelect()
        .where(
          and(
            query.projectId
              ? eq(integrationInstance.projectId, query.projectId)
              : undefined,
            query.resourceId
              ? eq(integrationInstance.resourceId, query.resourceId)
              : undefined,
            anchor
              ? sql`(${integrationInstance.createdAt}, ${integrationInstance.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(integrationInstance.createdAt),
          desc(integrationInstance.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(record),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.instance.id ?? null) : null,
      };
    },
    async setEnabled(id: string, enabled: boolean) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(integrationInstance)
          .where(eq(integrationInstance.id, id))
          .for("update")
          .limit(1);
        if (!current) {
          throw new LocalIntegrationError(
            "INTEGRATION_NOT_FOUND",
            "Integration not found",
          );
        }
        if (current.enabled === enabled) return;
        await tx
          .update(integrationInstance)
          .set({ enabled, updatedAt: new Date() })
          .where(eq(integrationInstance.id, id));
        await tx.insert(integrationInstanceAudit).values({
          id: crypto.randomUUID(),
          integrationInstanceId: id,
          actor: "local-user:unattributed",
          operation: enabled ? "integration.enabled" : "integration.disabled",
          details: { enabled },
        });
      });
      const updated = await get(id);
      if (!updated) throw new Error("Integration disappeared after update");
      return updated;
    },
    async setFreshnessWindow(id: string, windowMinutes: number) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(integrationInstance)
          .where(eq(integrationInstance.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new LocalIntegrationError(
            "INTEGRATION_NOT_FOUND",
            "Integration not found",
          );
        if (current.freshnessWindowMinutes === windowMinutes) return;
        await tx
          .update(integrationInstance)
          .set({ freshnessWindowMinutes: windowMinutes, updatedAt: new Date() })
          .where(eq(integrationInstance.id, id));
        await tx.insert(integrationInstanceAudit).values({
          id: crypto.randomUUID(),
          integrationInstanceId: id,
          actor: "local-user:unattributed",
          operation: "integration.freshness_window_changed",
          details: {
            windowMinutes: String(windowMinutes),
            previousMinutes: String(current.freshnessWindowMinutes),
            synthetic: true,
          },
        });
      });
      const updated = await get(id);
      if (!updated) throw new Error("Integration disappeared after update");
      return updated;
    },
    async resourceLinkedToProject(resourceId: string, projectId: string) {
      const [link] = await db
        .select({ id: projectResourceLink.id })
        .from(projectResourceLink)
        .where(
          and(
            eq(projectResourceLink.projectId, projectId),
            eq(projectResourceLink.resourceId, resourceId),
            eq(projectResourceLink.lifecycle, "active"),
          ),
        )
        .limit(1);
      return Boolean(link);
    },
    async listAudit(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: integrationInstanceAudit.createdAt })
            .from(integrationInstanceAudit)
            .where(
              and(
                eq(integrationInstanceAudit.id, query.cursor),
                eq(integrationInstanceAudit.integrationInstanceId, id),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(integrationInstanceAudit)
        .where(
          and(
            eq(integrationInstanceAudit.integrationInstanceId, id),
            anchor
              ? sql`(${integrationInstanceAudit.createdAt}, ${integrationInstanceAudit.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(integrationInstanceAudit.createdAt),
          desc(integrationInstanceAudit.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          integrationInstanceId: row.integrationInstanceId,
          actor: row.actor,
          operation: row.operation,
          details: row.details,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}
