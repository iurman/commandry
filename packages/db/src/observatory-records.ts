import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { linuxHostSampleSchema } from "@commandry/contracts";
import {
  infrastructureTelemetry,
  projectObservatoryProviderNotices,
} from "@commandry/application";
import {
  FoundationError,
  foundationDigest,
  type ObservatoryInput,
  type ObservatoryResource,
  combineObservatorySourceAccess,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { readObservatoryProviderFeedRecords } from "./observatory-provider-repository";
import {
  observatoryProviderFeed,
  observatoryProviderNotice,
} from "./observatory-provider-schema";
import { readInfrastructureOverviewRecords } from "./infrastructure-overview-repository";
import {
  observatoryAnnotation,
  observatoryProviderMapping,
  observatoryRelation,
  observatorySource,
} from "./observatory-schema";
import {
  normalizedEvent,
  sourceEnvelope,
  integrationInstance,
  resource,
  projectResourceLink,
} from "./schema";

type Transaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];
export type ObservatoryRecordScope = {
  projectId?: string;
  resourceIds: string[] | null;
  scopeDigest: string;
};

/** Run inside the authorized repeatable-read transaction. Every source page is
 * consumed before projection; no viewer-dependent provider fetch occurs here. */
export async function collectObservatoryRecords(
  tx: Transaction,
  scope: ObservatoryRecordScope,
  now = new Date(),
): Promise<ObservatoryInput> {
  const started = now.toISOString();
  const resources: ObservatoryResource[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let total: number | null = null;
  do {
    const page = await readInfrastructureOverviewRecords(
      tx,
      {
        limit: 50,
        q: "",
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
        ...(cursor ? { cursor } : {}),
      },
      {
        ...(scope.resourceIds !== null
          ? { resourceIds: scope.resourceIds }
          : {}),
        ...(scope.projectId ? { projectIds: [scope.projectId] } : {}),
      },
    );
    if (total !== null && total !== page.total)
      throw new FoundationError(
        "INVALID_REFERENCE",
        "Resource population changed; restart the read",
      );
    total = page.total;
    resources.push(
      ...page.items.map((item) => ({
        ...item,
        telemetry: infrastructureTelemetry(item.sources, now),
      })),
    );
    if (page.nextCursor && cursors.has(page.nextCursor))
      throw new FoundationError("INVALID_REFERENCE");
    if (page.nextCursor) cursors.add(page.nextCursor);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  if (
    resources.length !== total ||
    new Set(resources.map((r) => r.id)).size !== total
  )
    throw new FoundationError(
      "INVALID_REFERENCE",
      "Incomplete resource population",
    );
  const ids = resources.map((r) => r.id);
  const allowed = new Set(ids);
  if (!ids.length)
    return {
      resources: [],
      collection: { complete: true, resourceCount: 0 },
      scopeDigest: scope.scopeDigest,
      viewRevision: "default",
      readStartedAt: started,
      readCompletedAt: started,
      now: started,
    };
  const annotations = await tx
    .select()
    .from(observatoryAnnotation)
    .where(inArray(observatoryAnnotation.resourceId, ids))
    .orderBy(asc(observatoryAnnotation.resourceId));
  const relations = await tx
    .select()
    .from(observatoryRelation)
    .where(
      and(
        eq(observatoryRelation.active, true),
        inArray(observatoryRelation.sourceId, ids),
        inArray(observatoryRelation.targetId, ids),
      ),
    )
    .orderBy(asc(observatoryRelation.id));
  const mappings = await tx
    .select()
    .from(observatoryProviderMapping)
    .where(
      and(
        eq(observatoryProviderMapping.active, true),
        inArray(observatoryProviderMapping.resourceId, ids),
        inArray(observatoryProviderMapping.providerResourceId, ids),
      ),
    )
    .orderBy(asc(observatoryProviderMapping.id));
  const sources = await tx
    .select()
    .from(observatorySource)
    .where(
      and(
        inArray(observatorySource.resourceId, ids),
        scope.projectId
          ? eq(observatorySource.projectId, scope.projectId)
          : undefined,
      ),
    )
    .orderBy(asc(observatorySource.id));
  // Total RAM comes from the validated original host sample, never utilization.
  const hostSamples = await tx
    .selectDistinctOn([normalizedEvent.resourceId], {
      resourceId: normalizedEvent.resourceId,
      envelopeId: sourceEnvelope.id,
      raw: sourceEnvelope.rawPayload,
    })
    .from(normalizedEvent)
    .innerJoin(
      sourceEnvelope,
      eq(sourceEnvelope.id, normalizedEvent.sourceEnvelopeId),
    )
    .innerJoin(
      integrationInstance,
      eq(integrationInstance.id, sourceEnvelope.integrationInstanceId),
    )
    .where(
      and(
        inArray(normalizedEvent.resourceId, ids),
        scope.projectId
          ? eq(normalizedEvent.projectId, scope.projectId)
          : undefined,
        scope.projectId
          ? eq(integrationInstance.projectId, scope.projectId)
          : undefined,
        eq(normalizedEvent.projectId, integrationInstance.projectId),
        eq(normalizedEvent.isSynthetic, false),
        eq(normalizedEvent.sourceKind, "linux-host"),
      ),
    )
    .orderBy(
      normalizedEvent.resourceId,
      desc(normalizedEvent.occurredAt),
      desc(normalizedEvent.id),
    );
  const inputResources = resources.map((r) => {
    const sample = hostSamples.find((s) => s.resourceId === r.id);
    let original: unknown = null;
    // Real integrations retain the exact original JSON text in payload.
    // Never treat the storage envelope itself as a host observation.
    if (sample && typeof sample.raw.payload === "string") {
      try {
        original = JSON.parse(sample.raw.payload);
      } catch {
        original = null;
      }
    }
    const parsed = sample ? linuxHostSampleSchema.safeParse(original) : null;
    return {
      ...r,
      parentResourceId:
        r.parentResourceId && allowed.has(r.parentResourceId)
          ? r.parentResourceId
          : null,
      parentUnavailable:
        !!r.parentResourceId && !allowed.has(r.parentResourceId),
      childCount: resources.filter((child) => child.parentResourceId === r.id)
        .length,
      metrics: [
        ...r.metrics,
        ...(parsed?.success && sample
          ? [
              {
                name: "host_memory_total",
                unit: "bytes",
                value: parsed.data.memory.totalBytes,
                sampledAt: parsed.data.observedAt,
                evidenceHref: `/api/v1/source-envelopes/${sample.envelopeId}`,
              },
            ]
          : []),
      ],
    };
  });
  const sourceAccess = (source: (typeof sources)[number]) => {
    const state = (
      source.snapshot?.details as Record<string, unknown> | undefined
    )?.sourceState;
    return !source.enabled || state === "disabled"
      ? ("disabled" as const)
      : !source.projectId ||
          source.lastError ||
          !source.snapshot ||
          !["available", "stale"].includes(String(state))
        ? ("unavailable" as const)
        : ("available" as const);
  };
  const signals = sources.flatMap((source) => {
    const value = source.snapshot?.signals;
    if (!source.projectId || !Array.isArray(value)) return [];
    return (value as NonNullable<ObservatoryInput["signals"]>[number][]).map(
      (signal) => {
        if (
          signal.sourceId !== source.id ||
          signal.resourceId !== source.resourceId ||
          signal.environment !== source.environment
        )
          throw new FoundationError(
            "INVALID_REFERENCE",
            "Operational source evidence does not match its reviewed binding",
          );
        return {
          ...signal,
          sourceQualification:
            sourceAccess(source) === "available"
              ? ("current" as const)
              : ("last_known" as const),
        };
      },
    );
  });
  const facetAccess: NonNullable<ObservatoryInput["facetAccess"]>[number][] =
    sources.map((source) => ({
      resourceId: source.resourceId,
      facet: source.kind === "github-repository" ? "security" : "availability",
      state: sourceAccess(source),
    }));
  const [providerFeed] = mappings.length
    ? await tx
        .select()
        .from(observatoryProviderFeed)
        .where(eq(observatoryProviderFeed.id, "cloudflare"))
    : [];
  const feedAge = providerFeed?.lastSuccessAt
    ? now.getTime() - providerFeed.lastSuccessAt.getTime()
    : null;
  const feedState = !providerFeed
    ? ("unknown" as const)
    : !providerFeed.enabled
      ? ("disabled" as const)
      : providerFeed.lastError
        ? ("unavailable" as const)
        : feedAge === null
          ? ("unknown" as const)
          : feedAge < 0 || feedAge > 600000
            ? ("stale" as const)
            : ("current" as const);
  const currentNotices = providerFeed?.snapshot
    ? await tx
        .select()
        .from(observatoryProviderNotice)
        .where(
          and(
            eq(observatoryProviderNotice.providerId, "cloudflare"),
            eq(observatoryProviderNotice.active, true),
          ),
        )
        .orderBy(asc(observatoryProviderNotice.id))
    : [];
  const providerNotices = providerFeed?.snapshot
    ? [
        ...new Set(mappings.map((mapping) => mapping.providerResourceId)),
      ].flatMap((providerId) =>
        projectObservatoryProviderNotices(
          providerId,
          {
            ...providerFeed.snapshot,
            notices: currentNotices.map((notice) => notice.record),
          },
          feedState,
        ),
      )
    : [];
  for (const resourceId of new Set(
    mappings.flatMap((mapping) => [
      mapping.resourceId,
      mapping.providerResourceId,
    ]),
  ))
    facetAccess.push({
      resourceId,
      facet: "provider",
      state:
        feedState === "current"
          ? "available"
          : feedState === "disabled"
            ? "disabled"
            : "unavailable",
    });
  return {
    resources: inputResources,
    collection: { complete: true, resourceCount: inputResources.length },
    scopeDigest: scope.scopeDigest,
    viewRevision: foundationDigest({
      annotations: annotations.map((a) => [a.resourceId, a.version]),
      relations: relations.map((r) => [r.id, r.version]),
      mappings: mappings.map((m) => [m.id, m.version]),
    }),
    readStartedAt: started,
    readCompletedAt: now.toISOString(),
    now: now.toISOString(),
    metadata: annotations.map((a) => a.metadata),
    requirements: annotations.map((a) => ({
      id: `requirement:${a.resourceId}`,
      resourceId: a.resourceId,
      role: a.requirement as "required" | "optional" | "unspecified",
      environment: a.metadata.environment,
    })),
    relations: relations.map((r) => r.record),
    providerDependencies: mappings.map((m) => m.record),
    providerNotices,
    signals,
    facetAccess: combineObservatorySourceAccess(facetAccess),
  };
}

/** Complete safe current source details, inside the same authorized transaction. */
export async function readObservatoryOperationalRecords(
  tx: Transaction,
  resourceId: string,
  scope: ObservatoryRecordScope,
): Promise<unknown[]> {
  if (scope.resourceIds !== null && !scope.resourceIds.includes(resourceId))
    throw new FoundationError("FORBIDDEN");
  const sources = await tx
    .select()
    .from(observatorySource)
    .where(
      and(
        eq(observatorySource.resourceId, resourceId),
        isNotNull(observatorySource.projectId),
        scope.projectId
          ? eq(observatorySource.projectId, scope.projectId)
          : undefined,
        sql`exists (select 1 from project_resource_link binding where binding.project_id = ${observatorySource.projectId} and binding.resource_id = ${observatorySource.resourceId} and binding.lifecycle = 'active')`,
      ),
    )
    .orderBy(asc(observatorySource.id));
  return sources.map((source) => ({
    id: source.id,
    projectId: source.projectId,
    resourceId: source.resourceId,
    kind: source.kind,
    version: source.version,
    environment: source.environment,
    enabled: source.enabled,
    freshnessSeconds: source.freshnessSeconds,
    lastAttemptAt: source.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    lastError: source.lastError,
    observedAt:
      typeof source.snapshot?.observedAt === "string"
        ? source.snapshot.observedAt
        : null,
    details: source.snapshot?.details ?? null,
  }));
}

export async function collectObservatoryProviderFeedRecords(
  tx: Transaction,
  input: { afterId?: string; limit: number },
  now: Date,
): Promise<unknown> {
  if (input.afterId) {
    const [anchor] = await tx
      .select({ id: observatoryProviderNotice.id })
      .from(observatoryProviderNotice)
      .where(
        and(
          eq(observatoryProviderNotice.providerId, "cloudflare"),
          eq(observatoryProviderNotice.id, input.afterId),
        ),
      );
    if (!anchor)
      throw new FoundationError(
        "INVALID_REFERENCE",
        "Provider cursor is unavailable",
      );
  }
  const page = await readObservatoryProviderFeedRecords(tx, input, now);
  return {
    ...page,
    notices: page.notices.map((notice) => ({
      ...notice,
      sourceUpdatedAt: notice.sourceUpdatedAt.toISOString(),
      reconciledAt: notice.reconciledAt?.toISOString() ?? null,
      lastSeenAt: notice.lastSeenAt.toISOString(),
    })),
  };
}

/** Safe canonical configuration only. Population scope is applied in SQL before
 * reading records; the shared service applies per-kind authority and validation. */
export async function readObservatoryCatalogueRecords(
  tx: Transaction,
  scope: ObservatoryRecordScope,
): Promise<unknown[]> {
  const eligible = await tx
    .select({ id: resource.id })
    .from(resource)
    .where(
      and(
        scope.resourceIds !== null
          ? scope.resourceIds.length
            ? inArray(resource.id, scope.resourceIds)
            : sql`false`
          : undefined,
        scope.projectId
          ? sql`exists (select 1 from ${projectResourceLink} where ${projectResourceLink.resourceId} = ${resource.id} and ${projectResourceLink.projectId} = ${scope.projectId} and ${projectResourceLink.lifecycle} = 'active')`
          : undefined,
      ),
    );
  const ids = eligible.map((item) => item.id);
  if (!ids.length) return [];
  const annotations = await tx
    .select()
    .from(observatoryAnnotation)
    .where(inArray(observatoryAnnotation.resourceId, ids));
  const relations = await tx
    .select()
    .from(observatoryRelation)
    .where(
      and(
        inArray(observatoryRelation.sourceId, ids),
        inArray(observatoryRelation.targetId, ids),
      ),
    );
  const mappings = await tx
    .select()
    .from(observatoryProviderMapping)
    .where(
      and(
        inArray(observatoryProviderMapping.resourceId, ids),
        inArray(observatoryProviderMapping.providerResourceId, ids),
      ),
    );
  const sources = await tx
    .select({
      id: observatorySource.id,
      resourceId: observatorySource.resourceId,
      projectId: observatorySource.projectId,
      environment: observatorySource.environment,
      version: observatorySource.version,
      sourceKind: observatorySource.kind,
      externalId: observatorySource.externalId,
      enabled: observatorySource.enabled,
      freshnessSeconds: observatorySource.freshnessSeconds,
      provenance: observatorySource.provenance,
    })
    .from(observatorySource)
    .where(
      and(
        inArray(observatorySource.resourceId, ids),
        scope.projectId
          ? eq(observatorySource.projectId, scope.projectId)
          : undefined,
      ),
    );
  return [
    ...annotations.map((item) => ({
      kind: "annotation",
      id: item.resourceId,
      ...item,
    })),
    ...relations.map((item) => ({ kind: "relation", ...item })),
    ...mappings.map((item) => ({ kind: "provider", ...item })),
    ...sources.map((item) => ({ kind: "source", ...item })),
  ];
}
