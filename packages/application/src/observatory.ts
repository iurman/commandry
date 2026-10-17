import { foundationActorSchema } from "@commandry/contracts";
import { infrastructureResourceSchema } from "@commandry/contracts";
import {
  observatoryFacetAccessSchema,
  observatoryFacetSchema,
  observatoryMembershipPageSchema,
  observatoryMetadataSchema,
  observatoryProvenanceSchema,
  observatoryProviderDependencySchema,
  observatoryProviderNoticeSchema,
  observatoryRelationSchema,
  observatoryRequirementSchema,
  observatorySignalSchema,
} from "@commandry/contracts";
import {
  observatoryMembershipQuerySchema,
  observatoryProviderExplanationQuerySchema,
  observatoryProviderExplanationResultSchema,
  observatoryRelationsQuerySchema,
  observatoryRelationsResultSchema,
  observatorySceneQuerySchema,
  observatorySceneReadResultSchema,
  observatorySignalEvidenceQuerySchema,
  observatorySignalEvidenceResultSchema,
  type ObservatorySceneQuery,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  type FoundationEnvironment,
  type FoundationOperation,
} from "@commandry/domain";
import {
  observatoryFreshness,
  projectObservatory,
  readObservatoryMembers,
  type ObservatoryFacet,
  type ObservatoryInput,
  type ObservatoryResource,
} from "@commandry/domain";
import {
  observatoryAvailabilityEvidenceSchema,
  observatoryOperationalEvidenceQuerySchema,
  observatoryOperationalEvidenceResultSchema,
  observatoryOperationalRepositoryDetailsSchema,
  observatoryOperationalSourceRecordSchema,
  type ObservatoryOperationalEvidenceQuery,
} from "../../contracts/src/observatory-operational";

/** Server-established scope, never public request JSON or a new credential system. */
export interface ObservatoryReadAccess {
  owner: boolean;
  projectIds: readonly string[];
  /** null means all resources within the authorized projects, not global access. */
  resourceIds: readonly string[] | null;
  scopeDigest: string;
  operations: readonly FoundationOperation[];
  environment: FoundationEnvironment;
}
export interface ObservatoryReadRecords {
  /** Complete candidate population after every continuation; never a capped first page. */
  readObservatory(): Promise<ObservatoryInput>;
  /** Complete current sources for this subject in the same authorized transaction.
   * Derived details only; never include raw originals, credentials or configuration. */
  readOperationalEvidence?(resourceId: string): Promise<unknown[]>;
}
/**
 * The adapter reuses createFoundationProjectReadAccessRepository. Authenticate
 * the opaque request there, hold grant locks through callback/projection/audit/
 * commit, and reject expiry, revocation and audit failure before returning.
 * This service never authenticates tokens, fetches another page or caches grants.
 */
export interface ObservatoryReadPort<Request> {
  withRead<T>(
    request: Request,
    callback: (
      access: ObservatoryReadAccess,
      records: ObservatoryReadRecords,
    ) => Promise<T>,
  ): Promise<T>;
}
const uuid = foundationActorSchema.shape.projectId;
const facets = observatoryFacetSchema.options;
const facetOperation: Record<ObservatoryFacet, FoundationOperation> = {
  availability: "observatory.signals.read",
  telemetry: "observatory.signals.read",
  capacity: "observatory.signals.read",
  lifecycle: "observatory.signals.read",
  security: "observatory.security.read",
  provider: "observatory.providers.read",
  work: "work.read",
};
function invalid(): never {
  throw new FoundationError(
    "INVALID_REFERENCE",
    "Invalid Observatory result or continuation; restart the read",
  );
}
function forbidden(): never {
  throw new FoundationError("FORBIDDEN", "Observatory access is not granted");
}
function digest(value: unknown): string {
  try {
    return foundationDigest(value);
  } catch {
    return invalid();
  }
}
function unique(values: readonly string[]): string[] {
  if (new Set(values).size !== values.length) invalid();
  return [...values].sort();
}
function evidence(refs: readonly string[]): void {
  if (
    !refs.length ||
    refs.some(
      (ref) => typeof ref !== "string" || !ref.trim() || ref.length > 4000,
    )
  )
    invalid();
}
function accessContext(
  raw: ObservatoryReadAccess,
  environment: FoundationEnvironment,
): ObservatoryReadAccess {
  try {
    digest(raw);
    if (
      Object.keys(raw).sort().join(",") !==
        "environment,operations,owner,projectIds,resourceIds,scopeDigest" ||
      typeof raw.owner !== "boolean" ||
      !raw.scopeDigest?.trim() ||
      raw.scopeDigest.length > 500 ||
      raw.environment !== environment
    )
      forbidden();
    return {
      owner: raw.owner,
      projectIds: unique(
        foundationActorSchema.shape.resourceIds.parse(raw.projectIds),
      ),
      resourceIds:
        raw.resourceIds === null
          ? null
          : unique(
              foundationActorSchema.shape.resourceIds.parse(raw.resourceIds),
            ),
      operations: foundationActorSchema.shape.capabilities
        .parse(raw.operations)
        .sort(),
      environment: foundationActorSchema.shape.environment.parse(
        raw.environment,
      ),
      scopeDigest: raw.scopeDigest,
    };
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    return forbidden();
  }
}
const permitted = (
  access: ObservatoryReadAccess,
  operation: FoundationOperation,
) => access.owner || access.operations.includes(operation);
type AuthorizedInput = ObservatoryInput & {
  deniedFacets: readonly ObservatoryFacet[];
};
const defaultSourceState = (facet: ObservatoryFacet) =>
  facet === "security" || facet === "work"
    ? ("unsupported" as const)
    : ("available" as const);
function disclosedAccess(
  input: AuthorizedInput,
  resourceId: string,
  facet: ObservatoryFacet,
) {
  return input.deniedFacets.includes(facet)
    ? ("inaccessible" as const)
    : (input.facetAccess?.find(
        (item) => item.resourceId === resourceId && item.facet === facet,
      )?.state ?? defaultSourceState(facet));
}
function projectAuthorized(input: AuthorizedInput) {
  const scene = projectObservatory(input);
  // Permission is global to each granted facet. Keep dense disclosure outside the
  // domain's source-state exception list, then label each authorized unique count.
  const restrict = (summary: typeof scene.summary, count: number) => {
    for (const facet of input.deniedFacets)
      if (facet !== "availability")
        summary[facet] = { counts: { inaccessible: count }, signalIds: [] };
  };
  restrict(scene.summary, scene.population.canonicalResourceCount);
  for (const node of scene.representations)
    restrict(node.summary, node.memberCount);
  return scene;
}

function authorizedInput(
  candidate: ObservatoryInput,
  access: ObservatoryReadAccess,
  query: ObservatorySceneQuery,
  now: string,
): AuthorizedInput {
  try {
    digest(candidate);
    if (
      !Array.isArray(candidate.resources) ||
      candidate.collection?.complete !== true ||
      !Number.isSafeInteger(candidate.collection.resourceCount) ||
      candidate.collection.resourceCount !== candidate.resources.length
    )
      invalid();
    const candidates: readonly ObservatoryResource[] = candidate.resources;
    const ids = unique(candidates.map((resource) => uuid.parse(resource.id)));
    if (ids.length !== candidate.collection.resourceCount) invalid();
    const timestamp = foundationActorSchema.shape.expiresAt;
    timestamp.parse(candidate.readStartedAt);
    timestamp.parse(candidate.readCompletedAt);
    timestamp.parse(candidate.now);
    if (
      Date.parse(candidate.readCompletedAt) <
      Date.parse(candidate.readStartedAt)
    )
      invalid();
    const projectAllowed = (id: string) =>
      query.projectId
        ? id === query.projectId
        : access.owner || access.projectIds.includes(id);
    const resources: ObservatoryResource[] = [];
    for (const resource of candidates) {
      const id = uuid.parse(resource.id);
      const projectIds = unique(
        resource.projects.map((project) => uuid.parse(project.id)),
      );
      const inProject = query.projectId
        ? projectIds.includes(query.projectId)
        : access.owner ||
          projectIds.some((projectId) => access.projectIds.includes(projectId));
      if (
        !inProject ||
        (!access.owner &&
          access.resourceIds !== null &&
          !access.resourceIds.includes(id))
      )
        continue;
      const signals = permitted(access, "observatory.signals.read");
      const parsed = infrastructureResourceSchema.parse({
        id,
        name: resource.name,
        kind: resource.kind,
        parentResourceId:
          resource.parentResourceId === null
            ? null
            : uuid.parse(resource.parentResourceId),
        projects: resource.projects
          .filter((project) => projectAllowed(uuid.parse(project.id)))
          .map((project) => ({
            id: uuid.parse(project.id),
            name: project.name,
          })),
        sources: signals
          ? resource.sources.map((source) => ({
              ...source,
              name: "",
              kind: "",
            }))
          : [],
        metrics: signals ? resource.metrics : [],
        telemetry: signals ? resource.telemetry : "unknown",
        health: "unknown",
      });
      unique(parsed.sources.map((source) => source.id));
      resources.push(parsed);
    }
    const visible = new Set(resources.map((resource) => resource.id));
    const subject = (id: string) => visible.has(uuid.parse(id));
    const normalizedResources = resources.map((resource) => ({
      ...resource,
      parentResourceId:
        resource.parentResourceId && visible.has(resource.parentResourceId)
          ? resource.parentResourceId
          : null,
    }));
    const metadata = (candidate.metadata ?? [])
      .filter((item) => subject(item.resourceId))
      .map((item) => {
        const parsed = observatoryMetadataSchema.parse({
          ...item,
          resourceId: uuid.parse(item.resourceId),
        });
        evidence(parsed.provenance.evidenceRefs);
        return parsed;
      });
    unique(metadata.map((item) => item.resourceId));
    const relations = (candidate.relations ?? [])
      .filter(
        (item) =>
          subject(item.sourceId) &&
          subject(item.targetId) &&
          (permitted(access, "observatory.providers.read") ||
            (item.sourceKind !== "provider" && item.targetKind !== "provider")),
      )
      .map((item) => {
        const parsed = observatoryRelationSchema.parse({
          ...item,
          sourceId: uuid.parse(item.sourceId),
          targetId: uuid.parse(item.targetId),
        });
        evidence(parsed.provenance.evidenceRefs);
        return parsed;
      });
    unique(relations.map((item) => item.id));
    const signals = (candidate.signals ?? [])
      .filter((item) => {
        if (!subject(item.resourceId)) return false;
        if (!facets.includes(item.facet)) invalid();
        return permitted(access, facetOperation[item.facet]);
      })
      .map((item) => {
        const parsed = observatorySignalSchema.parse({
          ...item,
          resourceId: uuid.parse(item.resourceId),
          freshness: observatoryFreshness(
            item.observedAt,
            item.freshnessMs,
            now,
          ),
        });
        evidence(parsed.evidenceRefs);
        const { freshness: _freshness, ...signal } = parsed;
        return signal;
      });
    unique(signals.map((item) => item.id));
    const requirements = permitted(access, "observatory.signals.read")
      ? (candidate.requirements ?? [])
          .filter((item) => subject(item.resourceId))
          .map((item) =>
            observatoryRequirementSchema.parse({
              ...item,
              resourceId: uuid.parse(item.resourceId),
            }),
          )
      : [];
    unique(requirements.map((item) => item.id));
    const sourceAccess = (candidate.facetAccess ?? [])
      .filter((item) => {
        if (!subject(item.resourceId)) return false;
        if (!facets.includes(item.facet)) invalid();
        return permitted(access, facetOperation[item.facet]);
      })
      .map((item) =>
        observatoryFacetAccessSchema.parse({
          ...item,
          resourceId: uuid.parse(item.resourceId),
        }),
      );
    unique(sourceAccess.map((item) => `${item.resourceId}:${item.facet}`));
    const deniedFacets = facets.filter(
      (facet) => !permitted(access, facetOperation[facet]),
    );
    const facetAccess = sourceAccess.filter(
      (item) => item.state !== defaultSourceState(item.facet),
    );
    const providerDependencies = permitted(access, "observatory.providers.read")
      ? (candidate.providerDependencies ?? [])
          .filter(
            (item) => subject(item.resourceId) && subject(item.providerId),
          )
          .map((item) => {
            const parsed = observatoryProviderDependencySchema.parse({
              ...item,
              resourceId: uuid.parse(item.resourceId),
              providerId: uuid.parse(item.providerId),
            });
            evidence(parsed.provenance.evidenceRefs);
            return parsed;
          })
      : [];
    unique(providerDependencies.map((item) => item.id));
    const providerNotices = permitted(access, "observatory.providers.read")
      ? (candidate.providerNotices ?? [])
          .filter((item) => subject(item.providerId))
          .map((item) => {
            const parsed = observatoryProviderNoticeSchema.parse({
              ...item,
              providerId: uuid.parse(item.providerId),
            });
            evidence(parsed.evidenceRefs);
            return parsed;
          })
      : [];
    unique(providerNotices.map((item) => item.id));
    const attributions = permitted(access, "observatory.providers.read")
      ? (candidate.attributions ?? [])
          .filter(
            (item) =>
              subject(item.resourceId) &&
              providerNotices.some((notice) => notice.id === item.noticeId),
          )
          .map((item) => {
            if (
              !["suspected", "established"].includes(item.status) ||
              Object.keys(item).sort().join(",") !==
                "noticeId,provenance,resourceId,status"
            )
              invalid();
            const provenance = observatoryProvenanceSchema.parse(
              item.provenance,
            );
            evidence(provenance.evidenceRefs);
            return {
              ...item,
              resourceId: uuid.parse(item.resourceId),
              provenance,
            };
          })
      : [];
    unique(attributions.map((item) => `${item.noticeId}:${item.resourceId}`));
    const scopeDigest = foundationDigest({
      authorizedScope: access.scopeDigest,
      owner: access.owner,
      projectIds: access.owner ? [] : access.projectIds,
      resourceIds: access.owner ? null : access.resourceIds,
      operations: access.owner ? [] : access.operations,
      environment: access.environment,
      projectId: query.projectId ?? null,
      deploymentEnvironment: query.environment,
    });
    return {
      resources: normalizedResources,
      deniedFacets,
      collection: { complete: true, resourceCount: normalizedResources.length },
      scopeDigest,
      viewRevision: query.viewRevision,
      readStartedAt: candidate.readStartedAt,
      readCompletedAt: candidate.readCompletedAt,
      now,
      grouping: query.grouping,
      environment: query.environment,
      expandedRepresentationIds: query.expandedRepresentationIds,
      search: query.search,
      sectors: query.sectors
        .map((sector) => ({
          ...sector,
          resourceIds: sector.resourceIds.filter((id) => visible.has(id)),
        }))
        .filter((sector) => sector.resourceIds.length),
      metadata,
      relations,
      signals,
      requirements,
      facetAccess,
      providerDependencies,
      providerNotices,
      attributions,
    };
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    return invalid();
  }
}

type OperationalEvidenceRecords = { available: boolean; rows: unknown[] };
function operationalEvidenceItems(
  input: AuthorizedInput,
  query: ObservatoryOperationalEvidenceQuery,
  records: OperationalEvidenceRecords,
  access: ObservatoryReadAccess,
) {
  if (!Array.isArray(records.rows)) invalid();
  // Inspect only data-property project identities before touching hidden details.
  // A shared canonical resource does not grant access to another project's source.
  const descriptors = Object.getOwnPropertyDescriptors(records.rows);
  if (
    Object.getOwnPropertySymbols(records.rows).length ||
    Object.keys(descriptors).length !== records.rows.length + 1
  )
    invalid();
  const scoped: unknown[] = [];
  for (let index = 0; index < records.rows.length; index++) {
    const entry = descriptors[String(index)];
    if (!entry?.enumerable || !Object.hasOwn(entry, "value")) invalid();
    const row: unknown = entry.value;
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      (Object.getPrototypeOf(row) !== Object.prototype &&
        Object.getPrototypeOf(row) !== null)
    )
      invalid();
    const descriptor = Object.getOwnPropertyDescriptor(row, "projectId");
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value"))
      invalid();
    const projectId =
      observatoryOperationalSourceRecordSchema.shape.projectId.parse(
        descriptor.value,
      );
    if (
      (!query.projectId || projectId === query.projectId) &&
      (access.owner || access.projectIds.includes(projectId))
    )
      scoped.push(row);
  }
  digest(scoped);
  const rows = scoped.map((row) =>
    observatoryOperationalSourceRecordSchema.parse(row),
  );
  unique(rows.map((row) => row.id));
  if (rows.some((row) => row.resourceId !== query.resourceId)) invalid();
  const kind =
    query.facet === "availability" ? "infraagent-monitor" : "github-repository";
  const latest = (values: readonly (string | null)[]) => {
    let result: string | null = null;
    for (const value of values)
      if (
        value !== null &&
        (result === null || Date.parse(value) > Date.parse(result))
      )
        result = value;
    return result === null ? null : new Date(result).toISOString();
  };
  return rows
    .filter(
      (row) =>
        row.kind === kind &&
        (query.environment === null || row.environment === query.environment),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => {
      let payload: unknown = null;
      let observedAt = row.observedAt;
      const missing =
        row.details === null ||
        (typeof row.details === "object" &&
          !Array.isArray(row.details) &&
          Object.keys(row.details).length === 0);
      if (!missing) {
        if (query.facet === "availability") {
          const snapshot = observatoryAvailabilityEvidenceSchema.parse(
            row.details,
          );
          payload = snapshot;
          observedAt = snapshot.lastCheckedAt;
        } else {
          // Validate the full accepted snapshot, including identity/link invariants,
          // before projecting only the independently granted facet.
          const snapshot = observatoryOperationalRepositoryDetailsSchema.parse(
            row.details,
          ).repository;
          if (query.facet === "pull_requests") {
            payload = {
              repository: snapshot.repository,
              readAt: snapshot.readAt,
              pullRequests: snapshot.pullRequests,
            };
            observedAt = latest(
              snapshot.pullRequests.items.map((item) => item.updatedAt),
            );
          } else {
            const security = {
              ...snapshot.security,
              codeScanning: {
                ...snapshot.security.codeScanning,
                analyses: {
                  ...snapshot.security.codeScanning.analyses,
                  items: snapshot.security.codeScanning.analyses.items.map(
                    (analysis) => ({
                      ...analysis,
                      freshness: observatoryFreshness(
                        analysis.createdAt,
                        row.freshnessSeconds * 1000,
                        input.now,
                      ),
                    }),
                  ),
                },
              },
            };
            payload = {
              repository: snapshot.repository,
              readAt: snapshot.readAt,
              security,
            };
            observedAt = latest([
              ...security.codeScanning.analyses.items.map(
                (item) => item.createdAt,
              ),
              ...[
                security.codeScanning.alerts,
                security.dependabot,
                security.secretScanning,
              ].flatMap((source) =>
                source.items.map((item) => item.updatedAt ?? item.createdAt),
              ),
            ]);
          }
        }
      }
      return {
        sourceId: row.id,
        projectId: row.projectId,
        resourceId: row.resourceId,
        kind: row.kind,
        version: row.version,
        environment: row.environment,
        enabled: row.enabled,
        lastAttemptAt: row.lastAttemptAt,
        lastSuccessAt: row.lastSuccessAt,
        lastError: row.lastError,
        observedAt,
        freshness:
          observedAt === null
            ? ("unknown" as const)
            : observatoryFreshness(
                observedAt,
                row.freshnessSeconds * 1000,
                input.now,
              ),
        payload,
      };
    });
}

export function createObservatoryReadService<Request>(
  port: ObservatoryReadPort<Request>,
  options: { environment: FoundationEnvironment; now?: () => Date },
) {
  const environment = foundationActorSchema.shape.environment.parse(
    options.environment,
  );
  const clock = options.now ?? (() => new Date());
  async function read<T, Auxiliary = undefined>(
    request: Request,
    query: ObservatorySceneQuery,
    extra: FoundationOperation | null,
    select: (
      input: AuthorizedInput,
      auxiliary: Auxiliary,
      access: ObservatoryReadAccess,
    ) => T,
    load?: (
      input: AuthorizedInput,
      records: ObservatoryReadRecords,
    ) => Promise<Auxiliary>,
  ): Promise<T> {
    let callbacks = 0,
      expectedDigest: string | undefined,
      initialAccessDigest: string | undefined;
    let recheck: (() => void) | undefined;
    const result = await port.withRead(request, async (rawAccess, records) => {
      callbacks++;
      if (callbacks !== 1) invalid();
      recheck = () => {
        const access = accessContext(rawAccess, environment);
        if (
          !permitted(access, "observatory.read") ||
          (extra && !permitted(access, extra)) ||
          (!access.owner &&
            (!query.projectId || !access.projectIds.includes(query.projectId)))
        )
          forbidden();
        const current = digest(access);
        if (
          initialAccessDigest !== undefined &&
          current !== initialAccessDigest
        )
          forbidden();
        initialAccessDigest = current;
      };
      recheck();
      const candidate = await records.readObservatory();
      recheck();
      const time = clock();
      if (!(time instanceof Date) || !Number.isFinite(time.getTime()))
        forbidden();
      const input = authorizedInput(
        candidate,
        accessContext(rawAccess, environment),
        query,
        time.toISOString(),
      );
      // Adapter failures retain their identity, like readObservatory failures.
      // Only data selection/validation errors are converted to INVALID_REFERENCE.
      const auxiliary = load
        ? await load(input, records)
        : (undefined as Auxiliary);
      recheck();
      if (load) {
        const selectedAt = clock();
        if (
          !(selectedAt instanceof Date) ||
          !Number.isFinite(selectedAt.getTime())
        )
          forbidden();
        input.now = selectedAt.toISOString();
      }
      let value: T;
      try {
        value = select(input, auxiliary, accessContext(rawAccess, environment));
      } catch (error) {
        if (error instanceof FoundationError) throw error;
        return invalid();
      }
      recheck();
      expectedDigest = digest(value);
      return value;
    });
    if (callbacks !== 1 || !recheck || expectedDigest === undefined) invalid();
    recheck();
    if (digest(result) !== expectedDigest) invalid();
    return result;
  }
  const envelope = (scene: ReturnType<typeof projectObservatory>) => ({
    schemaVersion: 1 as const,
    scopeDigest: scene.scopeDigest,
    projectionRevision: scene.projectionRevision,
    completeness: "complete" as const,
  });
  function requireSubject(input: ObservatoryInput, resourceId: string): void {
    if (!input.resources.some((resource) => resource.id === resourceId))
      invalid();
  }
  return {
    async operationalEvidence(request: Request, rawQuery: unknown) {
      const query = observatoryOperationalEvidenceQuerySchema.parse(rawQuery);
      const extra: FoundationOperation =
        query.facet === "availability"
          ? "observatory.signals.read"
          : query.facet === "pull_requests"
            ? "work.read"
            : "observatory.security.read";
      return read(
        request,
        query,
        extra,
        (input, records: OperationalEvidenceRecords, sourceAccess) => {
          const items = operationalEvidenceItems(
            input,
            query,
            records,
            sourceAccess,
          );
          const enabled = items.filter((item) => item.enabled);
          const access = !records.available
            ? "unavailable"
            : !items.length
              ? "unsupported"
              : !enabled.length
                ? "disabled"
                : enabled.some(
                      (item) =>
                        item.payload === null || item.lastError !== null,
                    )
                  ? "unavailable"
                  : "available";
          return observatoryOperationalEvidenceResultSchema.parse({
            ...envelope(projectAuthorized(input)),
            resourceId: query.resourceId,
            facet: query.facet,
            access,
            items,
          });
        },
        async (input, records) => {
          requireSubject(input, query.resourceId);
          return records.readOperationalEvidence
            ? {
                available: true,
                rows: await records.readOperationalEvidence(query.resourceId),
              }
            : { available: false, rows: [] };
        },
      );
    },
    async scene(request: Request, rawQuery: unknown) {
      const query = observatorySceneQuerySchema.parse(rawQuery);
      return read(request, query, null, (input) =>
        observatorySceneReadResultSchema.parse({
          schemaVersion: 1,
          scene: projectAuthorized(input),
          facetAccess: input.resources.flatMap((resource) =>
            facets.map((facet) => ({
              resourceId: resource.id,
              facet,
              state: disclosedAccess(input, resource.id, facet),
            })),
          ),
        }),
      );
    },
    async members(request: Request, rawQuery: unknown) {
      const query = observatoryMembershipQuerySchema.parse(rawQuery);
      return read(request, query, null, (input) =>
        observatoryMembershipPageSchema.parse(
          readObservatoryMembers(projectAuthorized(input), query),
        ),
      );
    },
    async relations(request: Request, rawQuery: unknown) {
      const query = observatoryRelationsQuerySchema.parse(rawQuery);
      return read(request, query, null, (input) => {
        if (query.resourceId) requireSubject(input, query.resourceId);
        const scene = projectAuthorized(input);
        return observatoryRelationsResultSchema.parse({
          ...envelope(scene),
          items: scene.relations.filter(
            (relation) =>
              !query.resourceId ||
              relation.sourceId === query.resourceId ||
              relation.targetId === query.resourceId,
          ),
        });
      });
    },
    async signalEvidence(request: Request, rawQuery: unknown) {
      const query = observatorySignalEvidenceQuerySchema.parse(rawQuery);
      return read(request, query, facetOperation[query.facet], (input) => {
        requireSubject(input, query.resourceId);
        const scene = projectAuthorized(input);
        const signals = scene.signals.filter(
          (signal) =>
            signal.resourceId === query.resourceId &&
            signal.facet === query.facet &&
            (!query.signalId || signal.id === query.signalId),
        );
        if (query.signalId && !signals.length) invalid();
        return observatorySignalEvidenceResultSchema.parse({
          ...envelope(scene),
          resourceId: query.resourceId,
          facet: query.facet,
          access: disclosedAccess(input, query.resourceId, query.facet),
          signals,
          sourceObservations:
            query.facet === "telemetry"
              ? scene.sourceObservations.filter(
                  (item) => item.resourceId === query.resourceId,
                )
              : [],
          capacityObservations:
            query.facet === "capacity"
              ? scene.capacityObservations.filter(
                  (item) => item.resourceId === query.resourceId,
                )
              : [],
        });
      });
    },
    async providerExplanation(request: Request, rawQuery: unknown) {
      const query = observatoryProviderExplanationQuerySchema.parse(rawQuery);
      return read(request, query, "observatory.providers.read", (input) => {
        requireSubject(input, query.resourceId);
        const scene = projectAuthorized(input);
        const items = scene.providerExposures.filter(
          (item) =>
            item.resourceId === query.resourceId &&
            (!query.noticeId || item.noticeId === query.noticeId),
        );
        if (query.noticeId && !items.length) invalid();
        return observatoryProviderExplanationResultSchema.parse({
          ...envelope(scene),
          resourceId: query.resourceId,
          items,
        });
      });
    },
  };
}
