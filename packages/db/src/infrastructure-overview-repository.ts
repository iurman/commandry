import { and, asc, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import type { InfrastructureOverviewQuery } from "@commandry/contracts";
import type { InfrastructureOverviewRepository } from "@commandry/application";
import type { CommandryDatabase } from "./client";
import {
  resource,
  project,
  projectResourceLink,
  resourceDependency,
  integrationInstance,
  realIntegrationState,
  normalizedEvent,
  sourceEnvelope,
  metricSample,
} from "./schema";

type InfrastructureTransaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];

export function createInfrastructureOverviewRepository(
  db: CommandryDatabase,
): InfrastructureOverviewRepository {
  return {
    async read(query: InfrastructureOverviewQuery) {
      // The page, count, topology and evidence share a repeatable-read snapshot.
      return db.transaction(
        async (tx) => {
          return readInfrastructureOverviewRecords(tx, query);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}

/** Reuse an existing authorized transaction for a complete multi-page read. */
export async function readInfrastructureOverviewRecords(
  tx: InfrastructureTransaction,
  query: InfrastructureOverviewQuery,
  scope: {
    resourceIds?: readonly string[];
    projectIds?: readonly string[];
  } = {},
) {
  const term = query.q.replace(/[\\%_]/g, "\\$&");
  const population = and(
    scope.resourceIds
      ? scope.resourceIds.length
        ? inArray(resource.id, [...scope.resourceIds])
        : sql`false`
      : undefined,
    query.q
      ? or(ilike(resource.name, `%${term}%`), ilike(resource.kind, `%${term}%`))
      : undefined,
    query.projectId
      ? sql`exists (select 1 from ${projectResourceLink} where ${projectResourceLink.resourceId} = ${resource.id} and ${projectResourceLink.projectId} = ${query.projectId} and ${projectResourceLink.lifecycle} = 'active')`
      : undefined,
  );
  const [count] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(resource)
    .where(population);
  const rows = await tx
    .select()
    .from(resource)
    .where(
      and(population, query.cursor ? gt(resource.id, query.cursor) : undefined),
    )
    .orderBy(asc(resource.id))
    .limit(query.limit + 1);
  const visible = rows.slice(0, query.limit);
  const ids = visible.map((row) => row.id);
  if (!ids.length)
    return {
      total: count?.total ?? 0,
      items: [],
      nextCursor: null,
      edges: [],
      events: [],
    };
  const children = await tx
    .select({
      parent: resource.parentResourceId,
      count: sql<number>`count(*)::int`,
    })
    .from(resource)
    .where(
      and(
        inArray(resource.parentResourceId, ids),
        scope.resourceIds
          ? scope.resourceIds.length
            ? inArray(resource.id, [...scope.resourceIds])
            : sql`false`
          : undefined,
      ),
    )
    .groupBy(resource.parentResourceId);
  const links = await tx
    .select({
      resourceId: projectResourceLink.resourceId,
      id: project.id,
      name: project.name,
    })
    .from(projectResourceLink)
    .innerJoin(project, eq(project.id, projectResourceLink.projectId))
    .where(
      and(
        inArray(projectResourceLink.resourceId, ids),
        scope.projectIds
          ? scope.projectIds.length
            ? inArray(projectResourceLink.projectId, [...scope.projectIds])
            : sql`false`
          : undefined,
        eq(projectResourceLink.lifecycle, "active"),
      ),
    )
    .orderBy(project.name, project.id);
  const sources = await tx
    .select({
      instance: integrationInstance,
      state: realIntegrationState,
    })
    .from(integrationInstance)
    .innerJoin(
      realIntegrationState,
      eq(realIntegrationState.integrationInstanceId, integrationInstance.id),
    )
    .where(inArray(integrationInstance.resourceId, ids))
    .orderBy(integrationInstance.id);
  const dependencies = await tx
    .select()
    .from(resourceDependency)
    .where(
      or(
        inArray(resourceDependency.dependentResourceId, ids),
        inArray(resourceDependency.requiredResourceId, ids),
      ),
    );
  // One latest event per source, using occurrence time rather than arrival order.
  const latest = await tx
    .selectDistinctOn([sourceEnvelope.integrationInstanceId], {
      id: normalizedEvent.id,
    })
    .from(normalizedEvent)
    .innerJoin(
      sourceEnvelope,
      eq(sourceEnvelope.id, normalizedEvent.sourceEnvelopeId),
    )
    .where(
      and(
        inArray(normalizedEvent.resourceId, ids),
        eq(normalizedEvent.isSynthetic, false),
        eq(normalizedEvent.sourceKind, "linux-host"),
      ),
    )
    .orderBy(
      sourceEnvelope.integrationInstanceId,
      desc(normalizedEvent.occurredAt),
      desc(normalizedEvent.id),
    );
  const metrics = latest.length
    ? await tx
        .select()
        .from(metricSample)
        .where(
          and(
            inArray(
              metricSample.eventId,
              latest.map((row) => row.id),
            ),
            eq(metricSample.isSynthetic, false),
          ),
        )
        .orderBy(metricSample.name)
    : [];
  const events = await tx
    .select()
    .from(normalizedEvent)
    .where(
      and(
        inArray(normalizedEvent.resourceId, ids),
        eq(normalizedEvent.isSynthetic, false),
      ),
    )
    .orderBy(desc(normalizedEvent.occurredAt), desc(normalizedEvent.id))
    .limit(8);
  return {
    total: count?.total ?? 0,
    nextCursor: rows.length > query.limit ? visible.at(-1)!.id : null,
    items: visible.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      parentResourceId: row.parentResourceId,
      childCount: children.find((child) => child.parent === row.id)?.count ?? 0,
      projects: [
        ...new Map(
          links
            .filter((link) => link.resourceId === row.id)
            .map((link) => [link.id, { id: link.id, name: link.name }]),
        ).values(),
      ],
      sources: sources
        .filter(({ instance }) => instance.resourceId === row.id)
        .map(({ instance, state }) => ({
          id: instance.id,
          name: instance.name,
          kind: instance.kind,
          enabled: instance.enabled,
          observedAt:
            (instance.kind === "github-repository"
              ? state.lastSuccessAt
              : state.lastObservedAt
            )?.toISOString() ?? null,
          freshnessWindowMinutes: instance.freshnessWindowMinutes,
          error: state.lastError,
        })),
      metrics: metrics
        .filter((metric) => metric.resourceId === row.id)
        .map((metric) => ({
          name: metric.name,
          unit: metric.unit,
          value: metric.value,
          sampledAt: metric.sampledAt.toISOString(),
          evidenceHref: `/api/v1/source-envelopes/${metric.sourceEnvelopeId}`,
        })),
    })),
    edges: [
      ...visible
        .filter((row) => row.parentResourceId)
        .map((row) => ({
          id: `contains:${row.id}`,
          from: row.parentResourceId!,
          to: row.id,
          type: "contains" as const,
        })),
      ...dependencies.map((edge) => ({
        id: edge.id,
        from: edge.dependentResourceId,
        to: edge.requiredResourceId,
        type: "depends_on" as const,
      })),
    ],
    events: events.map((event) => ({
      id: event.id,
      resourceId: event.resourceId,
      summary: event.summary,
      occurredAt: event.occurredAt.toISOString(),
      sourceLabel: event.sourceLabel,
      evidenceHref: `/api/v1/source-envelopes/${event.sourceEnvelopeId}`,
    })),
  };
}
