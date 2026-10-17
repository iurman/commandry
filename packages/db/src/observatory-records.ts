import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { linuxHostSampleSchema } from "@commandry/contracts";
import { infrastructureTelemetry } from "@commandry/application";
import {
  FoundationError,
  foundationDigest,
  type ObservatoryInput,
  type ObservatoryResource,
  combineObservatorySourceAccess,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { readInfrastructureOverviewRecords } from "./infrastructure-overview-repository";
import {
  observatoryAnnotation,
  observatoryProviderMapping,
  observatoryRelation,
  observatorySource,
} from "./observatory-schema";
import { normalizedEvent, sourceEnvelope, integrationInstance } from "./schema";

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
      facet: source.kind === "infraagent-monitor" ? "availability" : "security",
      state: sourceAccess(source),
    }));
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
    signals,
    facetAccess: combineObservatorySourceAccess(facetAccess),
  };
}
