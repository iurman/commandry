/** Pure projections of an already authorized population. These functions grant no access. */
export const OBSERVATORY_SCHEMA_VERSION = 1;

export type ObservatoryKind =
  | "host"
  | "service"
  | "deployment"
  | "provider"
  | "repository"
  | "collection"
  | "project"
  | "reference";
export type ObservatoryGrouping =
  "operational" | "hosts" | "projects" | "providers" | "inventory" | "custom";
export type ObservatoryFacet =
  | "availability"
  | "telemetry"
  | "capacity"
  | "lifecycle"
  | "security"
  | "provider"
  | "work";
export type ObservatoryAccess =
  "available" | "unsupported" | "unavailable" | "inaccessible" | "disabled";
export type ObservatoryFreshness = "fresh" | "stale" | "future";
export type ObservatoryProject = { id: string; name: string };

/** Structural compatibility with InfrastructureResource, without a contracts dependency. */
export type ObservatoryResource = {
  id: string;
  name: string;
  kind: string;
  parentResourceId: string | null;
  /** Authorized child has a parent whose identity was redacted by storage. */
  parentUnavailable?: boolean | undefined;
  childCount?: number | undefined;
  projects: readonly ObservatoryProject[];
  telemetry:
    "reporting" | "stale" | "unknown" | "disabled" | "future" | "error";
  sources: readonly {
    id: string;
    enabled: boolean;
    observedAt: string | null;
    freshnessWindowMinutes: number;
    error: string | null;
  }[];
  metrics: readonly {
    name: string;
    unit: string;
    value: number;
    sampledAt: string;
    evidenceHref: string;
  }[];
};
export type ObservatoryProvenance = {
  actorId: string;
  recordedAt: string;
  evidenceRefs: readonly string[];
};
export type ObservatoryMetadata = {
  resourceId: string;
  role: "operated" | "unknown";
  pinned: boolean;
  environment: string | null;
  provenance: ObservatoryProvenance;
};
type FacetStates = {
  availability: "passing" | "degraded" | "failing" | "unknown";
  telemetry: "reporting" | "error" | "unknown";
  capacity: "normal" | "pressure" | "critical" | "unknown";
  lifecycle: "active" | "maintenance" | "retired" | "stopped" | "unknown";
  security:
    | "zero_findings"
    | "findings"
    | "confirmed_incident"
    | "reported"
    | "unknown";
  provider: "exposure" | "advisory" | "unknown";
  work:
    | "queued"
    | "running"
    | "waiting_approval"
    | "review"
    | "failed"
    | "complete"
    | "unknown";
};
export type ObservatorySignal = {
  [F in ObservatoryFacet]: {
    id: string;
    resourceId: string;
    facet: F;
    state: FacetStates[F];
    sourceId: string;
    observedAt: string;
    freshnessMs: number;
    evidenceRefs: readonly string[];
    environment: string | null;
    incidentId: string | null;
    /** Retained evidence can stay fresh in time after its source loses coverage. */
    sourceQualification?: "current" | "last_known" | undefined;
  };
}[ObservatoryFacet];
export type ObservatoryFacetAccess = {
  resourceId: string;
  facet: ObservatoryFacet;
  state: ObservatoryAccess;
};
export type ObservatoryRequirement = {
  id: string;
  resourceId: string;
  role: "required" | "optional" | "unspecified";
  environment: string | null;
};
export type ObservatoryRelation = {
  id: string;
  type: "deploys" | "executes_on" | "provides_service" | "depends_on";
  sourceId: string;
  targetId: string;
  sourceKind: string;
  targetKind: string;
  environment: string | null;
  provenance: ObservatoryProvenance;
};
export type ObservatoryProviderDependency = {
  id: string;
  resourceId: string;
  providerId: string;
  product: string;
  environment: string | null;
  geography: string | null;
  plane: "control" | "data";
  provenance: ObservatoryProvenance;
};
export type ObservatoryProviderFeedState =
  "current" | "stale" | "unavailable" | "disabled" | "unknown";
export type ObservatoryProviderNotice = {
  id: string;
  updateId: string;
  providerId: string;
  componentIds: readonly string[];
  product: string | null;
  environment: string | null;
  geography: string | null;
  plane: "control" | "data" | null;
  severity: "minor" | "major" | "critical" | "unknown";
  status: "open" | "monitoring" | "resolved" | "maintenance" | "unknown";
  confidence: "reported" | "verified";
  sourceId: string;
  observedAt: string;
  freshnessMs: number;
  feedState?: ObservatoryProviderFeedState | undefined;
  evidenceRefs: readonly string[];
};
export type ObservatoryAttribution = {
  noticeId: string;
  resourceId: string;
  status: "suspected" | "established";
  provenance: ObservatoryProvenance;
};
export type ObservatoryProviderExposure = {
  noticeId: string;
  updateId: string;
  providerId: string;
  resourceId: string;
  dependencyId: string | null;
  plane: ObservatoryProviderNotice["plane"];
  relevance: "matched" | "unrelated" | "unknown";
  classification:
    | "confirmed_local_impact"
    | "potential_exposure"
    | "advisory"
    | "relevance_unknown";
  severity: ObservatoryProviderNotice["severity"];
  confidence: ObservatoryProviderNotice["confidence"];
  localImpact: "confirmed" | "unknown";
  causation: "unknown" | "suspected" | "established";
  freshness: ObservatoryFreshness;
  feedState?: ObservatoryProviderFeedState | undefined;
  status: ObservatoryProviderNotice["status"];
  sourceId: string;
  observedAt: string;
  evidenceRefs: string[];
};
export type ObservatoryStateCounts = {
  passing: number;
  degraded: number;
  failing: number;
  unknown: number;
  maintenance: number;
};
export type ObservatoryFacetSummary = {
  counts: Record<string, number>;
  signalIds: string[];
};
export type ObservatorySourceObservation = {
  resourceId: string;
  sourceId: string;
  observedAt: string | null;
  freshnessWindowMinutes: number;
  enabled: boolean;
  error: string | null;
  state: ObservatoryResource["telemetry"];
  evidenceRefs: string[];
};
export type ObservatoryCapacityObservation = {
  resourceId: string;
  name: string;
  unit: string;
  value: number;
  observedAt: string;
  evidenceRef: string;
};
export type ObservatorySummary = {
  availability: ObservatoryStateCounts & {
    required: ObservatoryStateCounts;
    optional: ObservatoryStateCounts;
    unspecified: ObservatoryStateCounts;
    confirmedImpact: boolean;
  };
  coverage: {
    eligible: number;
    monitored: number;
    unmonitored: number;
    stale: number;
    state: "not_monitored" | "incomplete" | "complete";
  };
  telemetry: ObservatoryFacetSummary;
  capacity: ObservatoryFacetSummary;
  lifecycle: ObservatoryFacetSummary;
  security: ObservatoryFacetSummary;
  provider: ObservatoryFacetSummary;
  work: ObservatoryFacetSummary;
  incidentIds: string[];
};
export type ObservatoryExpansionRef = {
  groupId: string;
  scopeDigest: string;
  projectionRevision: string;
};
/** An owner-approved processed logo; image bytes are read separately. */
export type ObservatoryLogoReference = {
  digest: string;
  mediaType: "image/png";
  width: 128;
  height: 128;
  version: number;
};
export type ObservatoryRepresentation = {
  id: string;
  kind: ObservatoryKind;
  resourceId: string | null;
  aggregateId: string | null;
  referenceTo: string | null;
  label: string;
  layoutKey: string;
  parentRepresentationId: string | null;
  projects: ObservatoryProject[];
  memberCount: number;
  memberDigest: string;
  expansionRef: ObservatoryExpansionRef;
  summary: ObservatorySummary;
  /** Present only when the represented resource has an active approved logo. */
  logo?: ObservatoryLogoReference | undefined;
};
export type ObservatoryScene = {
  schemaVersion: 1;
  completeness: "complete";
  scopeDigest: string;
  viewRevision: string;
  projectionRevision: string;
  grouping: ObservatoryGrouping;
  readStartedAt: string;
  readCompletedAt: string;
  evaluatedAt: string;
  population: {
    canonicalResourceCount: number;
    representationCount: number;
    digest: string;
  };
  rootRepresentationIds: string[];
  visibleRepresentationIds: string[];
  representations: ObservatoryRepresentation[];
  membershipIndex: {
    resourceIds: string[];
    directMembers: Record<string, string[]>;
    children: Record<string, string[]>;
  };
  containment: {
    resourceId: string;
    parentResourceId: string | null;
    state: "root" | "known" | "missing" | "cycle";
  }[];
  relations: (ObservatoryRelation & {
    provenance: ObservatoryProvenance & { evidenceRefs: string[] };
  })[];
  signals: (ObservatorySignal & {
    freshness: ObservatoryFreshness;
    evidenceRefs: string[];
  })[];
  sourceObservations: ObservatorySourceObservation[];
  capacityObservations: ObservatoryCapacityObservation[];
  providerExposures: ObservatoryProviderExposure[];
  summary: ObservatorySummary;
  searchResults: ObservatorySearchResult[];
};
export type ObservatorySector = {
  id: string;
  label: string;
  resourceIds: readonly string[];
  grouping: Exclude<ObservatoryGrouping, "custom">;
};
export type ObservatoryInput = {
  resources: readonly ObservatoryResource[];
  /** Count the complete authorized canonical population, after every source continuation. */
  collection: { complete: true; resourceCount: number };
  scopeDigest: string;
  viewRevision: string;
  readStartedAt: string;
  readCompletedAt: string;
  now: string;
  grouping?: ObservatoryGrouping;
  environment?: string | null;
  metadata?: readonly ObservatoryMetadata[];
  signals?: readonly ObservatorySignal[];
  requirements?: readonly ObservatoryRequirement[];
  facetAccess?: readonly ObservatoryFacetAccess[];
  relations?: readonly ObservatoryRelation[];
  providerDependencies?: readonly ObservatoryProviderDependency[];
  providerNotices?: readonly ObservatoryProviderNotice[];
  attributions?: readonly ObservatoryAttribution[];
  sectors?: readonly ObservatorySector[];
  /** Active approved logos, one per resource. */
  logos?: readonly (ObservatoryLogoReference & { resourceId: string })[];
  expandedRepresentationIds?: readonly string[];
  search?: string;
  /** Default nested-detail budget; see OBSERVATORY_REVEAL_BUDGET. */
  revealBudget?: number;
};
/** Nested members are visible by default while the scene stays within this many
 * active representations. Shallow levels are revealed first; a group that would
 * exceed the budget stays an aggregate until it is explicitly expanded.
 */
export const OBSERVATORY_REVEAL_BUDGET = 200;
/** Default reveal stops below this many levels; deeper members need expansion. */
export const OBSERVATORY_REVEAL_DEPTH = 4;
export type ObservatorySearchResult = {
  resourceId: string;
  representationId: string;
  path: string[];
};
export type ObservatoryMembershipPage = ObservatoryExpansionRef & {
  total: number;
  digest: string;
  items: { resourceId: string; representationId: string }[];
  nextCursor: string | null;
  completeness: "partial" | "complete";
};

const facets: readonly ObservatoryFacet[] = [
  "availability",
  "telemetry",
  "capacity",
  "lifecycle",
  "security",
  "provider",
  "work",
];
const sort = (values: Iterable<string>) => [...new Set(values)].sort();
const resourceRepresentationId = (id: string) => `resource:${id}`;
const key = (value: string) => encodeURIComponent(value);
const emptyCounts = (): ObservatoryStateCounts => ({
  passing: 0,
  degraded: 0,
  failing: 0,
  unknown: 0,
  maintenance: 0,
});
const count = (counts: Record<string, number>, state: string) => {
  counts[state] = (counts[state] ?? 0) + 1;
};

/** Deterministic change/membership fingerprint, never an authorization or cryptographic token. */
export function observatoryDigest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, child]) => [name, stable(child)]),
      );
    return item;
  };
  const text = JSON.stringify(stable(value));
  let a = 2166136261,
    b = 2246822507;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619) >>> 0;
    b = Math.imul(b ^ text.charCodeAt(i), 3266489909) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}
function instant(value: string): number {
  const result = Date.parse(value);
  if (!Number.isFinite(result))
    throw new Error("Invalid Observatory timestamp");
  return result;
}
export function observatoryFreshness(
  observedAt: string,
  freshnessMs: number,
  now: string,
): ObservatoryFreshness {
  if (!Number.isFinite(freshnessMs) || freshnessMs <= 0)
    throw new Error("Freshness must be positive");
  const age = instant(now) - instant(observedAt);
  return age < 0 ? "future" : age >= freshnessMs ? "stale" : "fresh";
}
function requireProvenance(provenance: ObservatoryProvenance): void {
  if (
    !provenance.actorId ||
    !provenance.evidenceRefs.length ||
    provenance.evidenceRefs.some((ref) => !ref)
  )
    throw new Error("Explicit mappings require provenance and evidence");
  instant(provenance.recordedAt);
}
function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!item.id) throw new Error("Missing canonical identity");
    const previous = byId.get(item.id);
    if (previous && observatoryDigest(previous) !== observatoryDigest(item))
      throw new Error(`Conflicting identity: ${item.id}`);
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
const applies = (value: string | null, environment: string | null) =>
  environment === null || value === environment;
type FacetIndex = {
  input: ObservatoryInput;
  resources: Map<string, ObservatoryResource>;
  signals: Map<string, Map<ObservatoryFacet, ObservatorySignal[]>>;
  selectedSignals: Map<string, Map<ObservatoryFacet, ObservatorySignal[]>>;
  accesses: Map<string, Map<ObservatoryFacet, ObservatoryAccess>>;
  requirements: Map<string, ObservatoryRequirement[]>;
  freshness: Map<ObservatorySignal, ObservatoryFreshness>;
};
function createFacetIndex(
  input: ObservatoryInput,
  resources: readonly ObservatoryResource[],
): FacetIndex {
  const index: FacetIndex = {
    input,
    resources: new Map(resources.map((resource) => [resource.id, resource])),
    signals: new Map(),
    selectedSignals: new Map(),
    accesses: new Map(),
    requirements: new Map(),
    freshness: new Map(),
  };
  for (const signal of input.signals ?? []) {
    if (!index.resources.has(signal.resourceId)) continue;
    const facets =
      index.signals.get(signal.resourceId) ??
      new Map<ObservatoryFacet, ObservatorySignal[]>();
    const observations = facets.get(signal.facet) ?? [];
    observations.push(signal);
    facets.set(signal.facet, observations);
    index.signals.set(signal.resourceId, facets);
  }
  for (const [id, facets] of index.signals) {
    const selected = new Map<ObservatoryFacet, ObservatorySignal[]>();
    for (const [facet, observations] of facets) {
      const signals = uniqueById(
        observations.filter((signal) =>
          applies(signal.environment, input.environment ?? null),
        ),
      );
      selected.set(facet, signals);
      for (const signal of signals)
        index.freshness.set(
          signal,
          observatoryFreshness(
            signal.observedAt,
            signal.freshnessMs,
            input.now,
          ),
        );
    }
    index.selectedSignals.set(id, selected);
  }
  for (const item of input.facetAccess ?? []) {
    if (!index.resources.has(item.resourceId)) continue;
    const facets =
      index.accesses.get(item.resourceId) ??
      new Map<ObservatoryFacet, ObservatoryAccess>();
    if (!facets.has(item.facet)) facets.set(item.facet, item.state);
    index.accesses.set(item.resourceId, facets);
  }
  for (const item of input.requirements ?? []) {
    if (!index.resources.has(item.resourceId)) continue;
    const requirements = index.requirements.get(item.resourceId) ?? [];
    requirements.push(item);
    index.requirements.set(item.resourceId, requirements);
  }
  return index;
}
function accessFor(
  index: FacetIndex,
  id: string,
  facet: ObservatoryFacet,
): ObservatoryAccess {
  return (
    index.accesses.get(id)?.get(facet) ??
    (facet === "security" || facet === "work" ? "unsupported" : "available")
  );
}
function signalsFor(
  index: FacetIndex,
  id: string,
  facet: ObservatoryFacet,
): ObservatorySignal[] {
  return index.selectedSignals.get(id)?.get(facet) ?? [];
}
function currentSignals(
  index: FacetIndex,
  id: string,
  facet: ObservatoryFacet,
): ObservatorySignal[] {
  if (accessFor(index, id, facet) !== "available") return [];
  return signalsFor(index, id, facet).filter(
    (signal) =>
      signal.sourceQualification !== "last_known" &&
      index.freshness.get(signal) === "fresh",
  );
}
function sourceState(
  source: ObservatoryResource["sources"][number],
  now: string,
): ObservatoryResource["telemetry"] {
  if (!source.enabled) return "disabled";
  if (source.error) return "error";
  if (!source.observedAt) return "unknown";
  const freshness = observatoryFreshness(
    source.observedAt,
    source.freshnessWindowMinutes * 60000,
    now,
  );
  return freshness === "fresh" ? "reporting" : freshness;
}

/** Required failures survive conflicting passing sources. Optional failures retain their role. */
export function reduceObservatoryFacets(
  input: ObservatoryInput,
  resourceIds: readonly string[] = input.resources.map(
    (resource) => resource.id,
  ),
): ObservatorySummary {
  const ids = new Set(resourceIds);
  const resources = uniqueById(
    input.resources.filter((resource) => ids.has(resource.id)),
  );
  return reduceIndexedFacets(createFacetIndex(input, resources), resources);
}
function reduceIndexedFacets(
  index: FacetIndex,
  resources: readonly ObservatoryResource[],
): ObservatorySummary {
  const input = index.input;
  const availability = {
    ...emptyCounts(),
    required: emptyCounts(),
    optional: emptyCounts(),
    unspecified: emptyCounts(),
    confirmedImpact: false,
  };
  let eligible = 0,
    monitored = 0,
    stale = 0;
  const incidentIds = new Set<string>();
  const emptyFacet = (): ObservatoryFacetSummary => ({
    counts: {},
    signalIds: [],
  });
  const summaries = {
    telemetry: emptyFacet(),
    capacity: emptyFacet(),
    lifecycle: emptyFacet(),
    security: emptyFacet(),
    provider: emptyFacet(),
    work: emptyFacet(),
  };
  for (const resource of resources) {
    const declaredRequirements = index.requirements.get(resource.id) ?? [];
    const requirements = uniqueById(
      declaredRequirements.filter((requirement) =>
        applies(requirement.environment, input.environment ?? null),
      ),
    );
    if (requirements.length > 1)
      throw new Error(
        "Select an environment before summarizing multiple requirements for one service",
      );
    const requirement =
      requirements[0] ??
      (resource.kind === "service" && !declaredRequirements.length
        ? {
            id: `unmapped:${resource.id}`,
            resourceId: resource.id,
            role: "unspecified" as const,
            environment: null,
          }
        : null);
    if (requirement) {
      eligible++;
      const matchesRequirement = (signal: ObservatorySignal) =>
        !declaredRequirements.length ||
        signal.environment === requirement.environment;
      const observations = currentSignals(
        index,
        resource.id,
        "availability",
      ).filter(matchesRequirement);
      const lifecycle = currentSignals(index, resource.id, "lifecycle").filter(
        matchesRequirement,
      );
      const has = (state: string) =>
        observations.some((signal) => signal.state === state);
      const state = has("failing")
        ? "failing"
        : has("degraded")
          ? "degraded"
          : lifecycle.some((signal) =>
                ["maintenance", "retired", "stopped"].includes(signal.state),
              )
            ? "maintenance"
            : has("passing")
              ? "passing"
              : "unknown";
      availability[state]++;
      count(availability[requirement.role], state);
      if (has("passing") || has("degraded") || has("failing")) monitored++;
      if (
        !observations.length &&
        signalsFor(index, resource.id, "availability")
          .filter(matchesRequirement)
          .some((signal) => index.freshness.get(signal) === "stale")
      )
        stale++;
      if (state === "failing" && requirement.role === "required")
        availability.confirmedImpact = true;
      for (const signal of observations.filter(
        (signal) => signal.state === "failing",
      ))
        incidentIds.add(signal.incidentId ?? `signal:${signal.id}`);
    }
    for (const facet of facets) {
      if (facet === "availability") continue;
      const summary = summaries[facet];
      const access = accessFor(index, resource.id, facet);
      const observations = signalsFor(index, resource.id, facet);
      const current =
        access === "available" ? currentSignals(index, resource.id, facet) : [];
      summary.signalIds.push(...observations.map((signal) => signal.id));
      if (access !== "available") count(summary.counts, access);
      else if (current.length) {
        for (const state of sort(current.map((signal) => signal.state)))
          count(summary.counts, state);
      } else if (observations.length) {
        for (const state of sort(
          observations.map((signal) =>
            signal.sourceQualification === "last_known"
              ? "last_known"
              : index.freshness.get(signal)!,
          ),
        ))
          count(summary.counts, state);
      } else if (facet === "telemetry") {
        const states = resource.sources.map((source) =>
          sourceState(source, input.now),
        );
        for (const state of sort(states.length ? states : ["unknown"]))
          count(summary.counts, state);
      } else count(summary.counts, "unknown");
      if (facet === "security")
        for (const signal of current.filter(
          (signal) => signal.state === "confirmed_incident",
        ))
          incidentIds.add(signal.incidentId ?? `signal:${signal.id}`);
    }
  }
  for (const summary of Object.values(summaries))
    summary.signalIds = sort(summary.signalIds);
  return {
    availability,
    coverage: {
      eligible,
      monitored,
      unmonitored: eligible - monitored,
      stale,
      state:
        monitored === 0
          ? "not_monitored"
          : monitored < eligible
            ? "incomplete"
            : "complete",
    },
    ...summaries,
    incidentIds: sort(incidentIds),
  };
}

function aggregateResourceSummaries(
  index: FacetIndex,
  summaries: ReadonlyMap<string, ObservatorySummary>,
  resourceIds: readonly string[],
): ObservatorySummary {
  const result = reduceIndexedFacets(index, []);
  const states = Object.keys(emptyCounts()) as (keyof ObservatoryStateCounts)[];
  for (const id of new Set(resourceIds)) {
    const summary = summaries.get(id);
    if (!summary) continue;
    for (const state of states) {
      result.availability[state] += summary.availability[state];
      for (const role of ["required", "optional", "unspecified"] as const)
        result.availability[role][state] += summary.availability[role][state];
    }
    result.availability.confirmedImpact ||=
      summary.availability.confirmedImpact;
    result.coverage.eligible += summary.coverage.eligible;
    result.coverage.monitored += summary.coverage.monitored;
    result.coverage.stale += summary.coverage.stale;
    for (const facet of facets) {
      if (facet === "availability") continue;
      for (const [state, value] of Object.entries(summary[facet].counts))
        result[facet].counts[state] =
          (result[facet].counts[state] ?? 0) + value;
      result[facet].signalIds.push(...summary[facet].signalIds);
    }
    result.incidentIds.push(...summary.incidentIds);
  }
  const coverage = result.coverage;
  coverage.unmonitored = coverage.eligible - coverage.monitored;
  coverage.state =
    coverage.monitored === 0
      ? "not_monitored"
      : coverage.monitored < coverage.eligible
        ? "incomplete"
        : "complete";
  for (const facet of facets)
    if (facet !== "availability")
      result[facet].signalIds = sort(result[facet].signalIds);
  result.incidentIds = sort(result.incidentIds);
  return result;
}

const providerScopeMatch = (
  a: string | null,
  b: string | null,
): "matched" | "unrelated" | "unknown" =>
  a === null || b === null
    ? "unknown"
    : a === b || a === "*" || b === "*"
      ? "matched"
      : "unrelated";

/** A wildcard is explicit applicability; null means unknown, never global. */
export function evaluateObservatoryProviderExposure(
  notice: ObservatoryProviderNotice,
  dependency: ObservatoryProviderDependency | null,
  context: {
    resourceId: string;
    now: string;
    localSignals?: readonly ObservatorySignal[];
    attribution?: ObservatoryAttribution;
  },
): ObservatoryProviderExposure {
  if (dependency) requireProvenance(dependency.provenance);
  const freshness = observatoryFreshness(
    notice.observedAt,
    notice.freshnessMs,
    context.now,
  );
  const matches =
    dependency && dependency.resourceId === context.resourceId
      ? [
          providerScopeMatch(notice.providerId, dependency.providerId),
          notice.product !== null
            ? providerScopeMatch(notice.product, dependency.product)
            : notice.componentIds.length
              ? notice.componentIds.includes(dependency.product)
                ? "matched"
                : "unrelated"
              : "unknown",
          providerScopeMatch(notice.environment, dependency.environment),
          providerScopeMatch(notice.geography, dependency.geography),
          providerScopeMatch(notice.plane, dependency.plane),
        ]
      : ["unknown"];
  const relevance = matches.includes("unrelated")
    ? "unrelated"
    : matches.includes("unknown")
      ? "unknown"
      : "matched";
  const local = (context.localSignals ?? []).filter(
    (signal) =>
      signal.resourceId === context.resourceId &&
      signal.facet === "availability" &&
      signal.state === "failing" &&
      signal.sourceQualification !== "last_known" &&
      dependency !== null &&
      providerScopeMatch(signal.environment, dependency.environment) ===
        "matched" &&
      providerScopeMatch(signal.environment, notice.environment) ===
        "matched" &&
      observatoryFreshness(
        signal.observedAt,
        signal.freshnessMs,
        context.now,
      ) === "fresh",
  );
  const attribution = context.attribution;
  if (
    attribution &&
    (attribution.noticeId !== notice.id ||
      attribution.resourceId !== context.resourceId)
  )
    throw new Error("Attribution subject mismatch");
  if (attribution) requireProvenance(attribution.provenance);
  const localImpact = local.length ? "confirmed" : "unknown";
  const active =
    freshness === "fresh" &&
    (notice.feedState === undefined || notice.feedState === "current") &&
    ["open", "monitoring"].includes(notice.status);
  const classification =
    relevance === "unrelated"
      ? "advisory"
      : relevance === "unknown"
        ? "relevance_unknown"
        : localImpact === "confirmed"
          ? "confirmed_local_impact"
          : active
            ? "potential_exposure"
            : "advisory";
  return {
    noticeId: notice.id,
    updateId: notice.updateId,
    providerId: notice.providerId,
    resourceId: context.resourceId,
    dependencyId: dependency?.id ?? null,
    plane: notice.plane,
    relevance,
    classification,
    severity: notice.severity,
    confidence: notice.confidence,
    localImpact,
    causation: attribution?.status ?? "unknown",
    freshness,
    ...(notice.feedState ? { feedState: notice.feedState } : {}),
    status: notice.status,
    sourceId: notice.sourceId,
    observedAt: notice.observedAt,
    evidenceRefs: sort([
      ...notice.evidenceRefs,
      ...(dependency?.provenance.evidenceRefs ?? []),
      ...local.flatMap((signal) => signal.evidenceRefs),
      ...(attribution?.provenance.evidenceRefs ?? []),
    ]),
  };
}

function representationKind(kind: string): ObservatoryKind {
  return (
    (["host", "service", "deployment", "provider", "repository"] as const).find(
      (value) => value === kind,
    ) ?? "collection"
  );
}
function validateRelation(
  relation: ObservatoryRelation,
  resources: Map<string, ObservatoryResource>,
): void {
  requireProvenance(relation.provenance);
  if (
    resources.get(relation.sourceId)?.kind !== relation.sourceKind ||
    resources.get(relation.targetId)?.kind !== relation.targetKind
  )
    throw new Error("Relation kind mismatch");
  const valid =
    relation.type === "depends_on" ||
    (relation.type === "deploys" &&
      relation.sourceKind === "repository" &&
      relation.targetKind === "deployment") ||
    (relation.type === "executes_on" &&
      relation.sourceKind === "deployment" &&
      ["host", "provider"].includes(relation.targetKind)) ||
    (relation.type === "provides_service" &&
      relation.sourceKind === "deployment" &&
      relation.targetKind === "service");
  if (!valid) throw new Error("Unsupported Observatory relation endpoints");
}

/** Expansion traverses a compact adjacency index, not ancestor copies of member arrays. */
export function observatoryMembers(
  scene: Pick<ObservatoryScene, "representations" | "membershipIndex">,
  groupId: string,
): string[] {
  return indexedMembers(
    scene,
    groupId,
    new Map(scene.representations.map((item) => [item.id, item])),
  );
}
function indexedMembers(
  scene: Pick<ObservatoryScene, "representations" | "membershipIndex">,
  groupId: string,
  representations: ReadonlyMap<string, ObservatoryRepresentation>,
): string[] {
  if (!representations.has(groupId)) throw new Error("Unknown representation");
  const pending = [groupId],
    seen = new Set<string>(),
    members = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const item = representations.get(id);
    if (!item) throw new Error("Broken representation index");
    for (const resourceId of scene.membershipIndex.directMembers[id] ?? [])
      members.add(resourceId);
    if (item.referenceTo)
      for (const resourceId of scene.membershipIndex.directMembers[
        item.referenceTo
      ] ?? [])
        members.add(resourceId);
    pending.push(...(scene.membershipIndex.children[id] ?? []));
  }
  return sort(members);
}

export function projectObservatory(input: ObservatoryInput): ObservatoryScene {
  if (!input.scopeDigest || !input.viewRevision)
    throw new Error("Scene scope and view revision are required");
  if (instant(input.readCompletedAt) < instant(input.readStartedAt))
    throw new Error("Read completion predates read start");
  instant(input.now);
  const ordered = uniqueById(input.resources),
    resources = new Map(ordered.map((resource) => [resource.id, resource]));
  if (
    input.collection.complete !== true ||
    input.collection.resourceCount !== ordered.length
  )
    throw new Error(
      "An incomplete or inconsistent collection cannot produce a complete scene",
    );
  const grouping = input.grouping ?? "operational";
  const metadata = new Map<string, ObservatoryMetadata>();
  for (const item of input.metadata ?? [])
    if (resources.has(item.resourceId)) {
      requireProvenance(item.provenance);
      if (metadata.has(item.resourceId))
        throw new Error("Duplicate operational metadata");
      metadata.set(item.resourceId, item);
    }
  const relations = uniqueById(
    (input.relations ?? []).filter(
      (relation) =>
        resources.has(relation.sourceId) && resources.has(relation.targetId),
    ),
  );
  for (const relation of relations) validateRelation(relation, resources);
  const dependencies = uniqueById(
    (input.providerDependencies ?? []).filter(
      (item) =>
        resources.has(item.resourceId) && resources.has(item.providerId),
    ),
  );
  for (const item of dependencies) {
    requireProvenance(item.provenance);
    if (resources.get(item.providerId)!.kind !== "provider")
      throw new Error("Provider mapping requires a provider resource");
  }
  const signals = uniqueById(
    (input.signals ?? []).filter((signal) => resources.has(signal.resourceId)),
  );
  for (const signal of signals) {
    if (!signal.sourceId || !signal.evidenceRefs.length)
      throw new Error("Signals require source evidence");
    observatoryFreshness(signal.observedAt, signal.freshnessMs, input.now);
  }
  const accesses = new Set<string>();
  for (const item of input.facetAccess ?? [])
    if (resources.has(item.resourceId)) {
      const id = `${item.resourceId}:${item.facet}`;
      if (accesses.has(id)) throw new Error("Conflicting facet access");
      accesses.add(id);
    }
  const projectionInput = { ...input, resources: ordered, signals };
  const facetIndex = createFacetIndex(projectionInput, ordered);
  const emptySummary = reduceIndexedFacets(facetIndex, []);
  const resourceSummaries = new Map(
    ordered.map((resource) => [
      resource.id,
      reduceIndexedFacets(facetIndex, [resource]),
    ]),
  );
  const containment: ObservatoryScene["containment"] = ordered.map(
    (resource) => {
      const seen = new Set([resource.id]);
      let parent = resource.parentResourceId,
        cyclic = false;
      while (parent && resources.has(parent)) {
        if (seen.has(parent)) {
          cyclic = true;
          break;
        }
        seen.add(parent);
        parent = resources.get(parent)!.parentResourceId;
      }
      return {
        resourceId: resource.id,
        parentResourceId:
          resource.parentResourceId && resources.has(resource.parentResourceId)
            ? resource.parentResourceId
            : null,
        state: cyclic
          ? "cycle"
          : resource.parentResourceId === null
            ? resource.parentUnavailable
              ? "missing"
              : "root"
            : resources.has(resource.parentResourceId)
              ? "known"
              : "missing",
      };
    },
  );
  const physicalParent = new Map(
    containment.map((item) => [
      item.resourceId,
      item.state === "known" ? item.parentResourceId : null,
    ]),
  );
  const hostsWithServices = new Set<string>();
  for (const service of ordered.filter(
    (resource) => resource.kind === "service",
  )) {
    let parent = physicalParent.get(service.id);
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      if (resources.get(parent)?.kind === "host") hostsWithServices.add(parent);
      parent = physicalParent.get(parent);
    }
  }
  const nodes = new Map<string, ObservatoryRepresentation>();
  const directMembers: Record<string, string[]> = Object.create(null);
  const logos = new Map(
    (input.logos ?? []).map(({ resourceId, ...logo }) => [resourceId, logo]),
  );
  const add = (
    id: string,
    kind: ObservatoryKind,
    label: string,
    parent: string | null,
    resource: ObservatoryResource | null = null,
    referenceTo: string | null = null,
  ) => {
    if (nodes.has(id)) return id;
    nodes.set(id, {
      id,
      kind,
      resourceId: resource?.id ?? null,
      aggregateId: resource || referenceTo ? null : id,
      referenceTo,
      label,
      layoutKey: id,
      parentRepresentationId: parent,
      projects: resource ? uniqueById(resource.projects) : [],
      memberCount: 0,
      memberDigest: "",
      expansionRef: {
        groupId: id,
        scopeDigest: input.scopeDigest,
        projectionRevision: "",
      },
      summary: emptySummary,
      ...(resource && logos.has(resource.id)
        ? { logo: { ...logos.get(resource.id)! } }
        : {}),
    });
    directMembers[id] = resource && !referenceTo ? [resource.id] : [];
    return id;
  };
  for (const resource of ordered)
    add(
      resourceRepresentationId(resource.id),
      representationKind(resource.kind),
      resource.name,
      null,
      resource,
    );
  const group = (
    namespace: string,
    id: string,
    label: string,
    parent: string | null,
    kind: ObservatoryKind = "collection",
  ) => add(`group:${namespace}:${key(id)}`, kind, label, parent);
  const alias = (
    context: string,
    resource: ObservatoryResource,
    parent: string,
  ) =>
    add(
      `reference:${key(context)}:${key(resource.id)}`,
      "reference",
      resource.name,
      parent,
      resource,
      resourceRepresentationId(resource.id),
    );
  const providerIds = (resource: ObservatoryResource) =>
    sort([
      ...dependencies
        .filter((item) => item.resourceId === resource.id)
        .map((item) => item.providerId),
      ...relations
        .filter(
          (item) =>
            item.type === "executes_on" &&
            item.sourceId === resource.id &&
            item.targetKind === "provider",
        )
        .map((item) => item.targetId),
    ]);
  const assign = (
    members: readonly ObservatoryResource[],
    preset: Exclude<ObservatoryGrouping, "custom">,
    namespace: string,
    sector: string | null,
  ) => {
    const memberIds = new Set(members.map((resource) => resource.id));
    for (const resource of members) {
      const node = nodes.get(resourceRepresentationId(resource.id))!;
      const parent = physicalParent.get(resource.id);
      if (preset === "inventory")
        node.parentRepresentationId =
          parent && memberIds.has(parent)
            ? resourceRepresentationId(parent)
            : sector;
      else if (preset === "projects") {
        const projects = uniqueById(resource.projects);
        if (projects.length === 1)
          node.parentRepresentationId = group(
            namespace,
            `project:${projects[0]!.id}`,
            projects[0]!.name,
            sector,
            "project",
          );
        else {
          node.parentRepresentationId = group(
            namespace,
            projects.length ? "shared" : "unmapped",
            projects.length ? "Shared resources" : "Unmapped resources",
            sector,
          );
          for (const project of projects)
            alias(
              `${namespace}:project:${project.id}`,
              resource,
              group(
                namespace,
                `project:${project.id}`,
                project.name,
                sector,
                "project",
              ),
            );
        }
      } else if (preset === "providers") {
        const providers = providerIds(resource);
        if (resource.kind === "provider") node.parentRepresentationId = sector;
        else if (providers.length === 1 && memberIds.has(providers[0]!))
          node.parentRepresentationId = resourceRepresentationId(providers[0]!);
        else {
          node.parentRepresentationId = group(
            namespace,
            providers.length > 1
              ? "shared-providers"
              : resource.kind === "repository"
                ? "repositories"
                : "unmapped-providers",
            providers.length > 1
              ? "Shared provider context"
              : resource.kind === "repository"
                ? "Repositories"
                : "Provider mapping unknown",
            sector,
          );
          for (const provider of providers)
            if (memberIds.has(provider))
              alias(
                `${namespace}:provider:${provider}`,
                resource,
                resourceRepresentationId(provider),
              );
        }
      } else if (resource.kind === "repository") {
        const repositoryGroup = group(
          namespace,
          "repositories",
          "Repositories",
          sector,
        );
        node.parentRepresentationId = resource.projects.length
          ? repositoryGroup
          : group(
              namespace,
              "unmapped-repositories",
              "Unmapped repositories",
              repositoryGroup,
            );
      } else if (parent && memberIds.has(parent))
        node.parentRepresentationId = resourceRepresentationId(parent);
      else if (preset === "hosts" || resource.kind !== "host")
        node.parentRepresentationId = sector;
      else {
        const observed = resource.sources.some(
          (source) =>
            source.enabled &&
            source.observedAt &&
            instant(source.observedAt) <= instant(input.now),
        );
        const hasService = hostsWithServices.has(resource.id);
        node.parentRepresentationId =
          observed ||
          hasService ||
          metadata.get(resource.id)?.role === "operated" ||
          metadata.get(resource.id)?.pinned
            ? sector
            : group(
                namespace,
                "other-infrastructure",
                "Other infrastructure",
                sector,
              );
      }
    }
  };
  if (grouping === "custom") {
    const sectors = uniqueById(input.sectors ?? []);
    const sectorsFor = (id: string) =>
      sectors.filter((sector) => sector.resourceIds.includes(id));
    for (const sector of sectors) {
      const sectorId = group("custom:sector", sector.id, sector.label, null);
      assign(
        ordered.filter(
          (resource) =>
            sectorsFor(resource.id).length === 1 &&
            sector.resourceIds.includes(resource.id),
        ),
        sector.grouping,
        `sector:${sector.id}`,
        sectorId,
      );
    }
    for (const resource of ordered) {
      const homes = sectorsFor(resource.id);
      if (homes.length === 1) continue;
      nodes.get(resourceRepresentationId(resource.id))!.parentRepresentationId =
        group(
          "custom",
          homes.length ? "shared" : "unassigned",
          homes.length ? "Shared sectors" : "Unassigned resources",
          null,
        );
      for (const sector of homes)
        alias(
          `sector:${sector.id}`,
          resource,
          `group:custom:sector:${key(sector.id)}`,
        );
    }
  } else assign(ordered, grouping, grouping, null);
  if (grouping === "operational")
    for (const resource of ordered.filter(
      (item) => item.kind === "deployment" && !physicalParent.get(item.id),
    )) {
      const targets = sort(
        relations
          .filter(
            (relation) =>
              relation.type === "executes_on" &&
              relation.sourceId === resource.id,
          )
          .map((relation) => relation.targetId),
      );
      const target = targets.length === 1 ? targets[0]! : null;
      let ancestor: string | null = target
        ? resourceRepresentationId(target)
        : null;
      const seen = new Set<string>();
      while (
        ancestor &&
        !seen.has(ancestor) &&
        ancestor !== resourceRepresentationId(resource.id)
      ) {
        seen.add(ancestor);
        ancestor = nodes.get(ancestor)?.parentRepresentationId ?? null;
      }
      if (target && ancestor !== resourceRepresentationId(resource.id))
        nodes.get(
          resourceRepresentationId(resource.id),
        )!.parentRepresentationId = resourceRepresentationId(target);
      else if (targets.length > 1) {
        nodes.get(
          resourceRepresentationId(resource.id),
        )!.parentRepresentationId = group(
          "operational",
          "shared-execution",
          "Shared execution targets",
          null,
        );
        for (const targetId of targets)
          alias(
            `execution:${targetId}`,
            resource,
            resourceRepresentationId(targetId),
          );
      }
    }
  if (grouping !== "projects")
    for (const resource of ordered.filter(
      (item) => uniqueById(item.projects).length > 1,
    )) {
      const context = group(
        grouping,
        "shared-project-references",
        "Shared project references",
        null,
      );
      for (const project of uniqueById(resource.projects))
        alias(
          `${grouping}:project:${project.id}`,
          resource,
          group(
            `${grouping}:references`,
            project.id,
            project.name,
            context,
            "project",
          ),
        );
    }
  // Logical deployment references never rewrite physical resource containment.
  for (const relation of relations)
    if (relation.type === "deploys" || relation.type === "provides_service") {
      const deploymentId =
        relation.type === "deploys" ? relation.targetId : relation.sourceId;
      const resourceId =
        relation.type === "deploys" ? relation.sourceId : relation.targetId;
      alias(
        `deployment:${deploymentId}`,
        resources.get(resourceId)!,
        resourceRepresentationId(deploymentId),
      );
    }
  const children: Record<string, string[]> = Object.create(null);
  for (const id of nodes.keys()) children[id] = [];
  for (const node of nodes.values())
    if (node.parentRepresentationId)
      children[node.parentRepresentationId]!.push(node.id);
  for (const values of Object.values(children)) values.sort();
  const representations = [...nodes.values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const populationIds = ordered.map((resource) => resource.id);
  const revision = observatoryDigest({
    scope: input.scopeDigest,
    view: input.viewRevision,
    environment: input.environment ?? null,
    grouping,
    nodes: representations.map((node) => [
      node.id,
      node.kind,
      node.parentRepresentationId,
      node.referenceTo,
    ]),
    containment,
    relations,
    dependencies,
  });
  const scene: ObservatoryScene = {
    schemaVersion: 1,
    completeness: "complete",
    scopeDigest: input.scopeDigest,
    viewRevision: input.viewRevision,
    projectionRevision: revision,
    grouping,
    readStartedAt: input.readStartedAt,
    readCompletedAt: input.readCompletedAt,
    evaluatedAt: input.now,
    population: {
      canonicalResourceCount: ordered.length,
      representationCount: representations.length,
      digest: observatoryDigest(populationIds),
    },
    rootRepresentationIds: representations
      .filter((node) => !node.parentRepresentationId)
      .map((node) => node.id),
    visibleRepresentationIds: [],
    representations,
    membershipIndex: { resourceIds: populationIds, directMembers, children },
    containment,
    relations: relations.map((relation) => ({
      ...relation,
      provenance: {
        ...relation.provenance,
        evidenceRefs: [...relation.provenance.evidenceRefs],
      },
    })),
    signals: signals.map((signal) => ({
      ...signal,
      evidenceRefs: [...signal.evidenceRefs],
      freshness: observatoryFreshness(
        signal.observedAt,
        signal.freshnessMs,
        input.now,
      ),
    })),
    sourceObservations: ordered.flatMap((resource) =>
      accessFor(facetIndex, resource.id, "telemetry") === "available"
        ? [...resource.sources]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((source) => ({
              resourceId: resource.id,
              sourceId: source.id,
              observedAt: source.observedAt,
              freshnessWindowMinutes: source.freshnessWindowMinutes,
              enabled: source.enabled,
              error: source.error,
              state: sourceState(source, input.now),
              evidenceRefs: sort([
                `source:${source.id}`,
                ...resource.metrics
                  .filter((metric) => metric.sampledAt === source.observedAt)
                  .map((metric) => metric.evidenceHref),
              ]),
            }))
        : [],
    ),
    capacityObservations: ordered.flatMap((resource) =>
      accessFor(facetIndex, resource.id, "capacity") === "available"
        ? [...resource.metrics]
            .sort(
              (a, b) =>
                a.name.localeCompare(b.name) ||
                a.sampledAt.localeCompare(b.sampledAt) ||
                a.evidenceHref.localeCompare(b.evidenceHref),
            )
            .map((metric) => ({
              resourceId: resource.id,
              name: metric.name,
              unit: metric.unit,
              value: metric.value,
              observedAt: metric.sampledAt,
              evidenceRef: metric.evidenceHref,
            }))
        : [],
    ),
    providerExposures: [],
    summary: emptySummary,
    searchResults: [],
  };
  const membersByNode = new Map<string, string[]>();
  for (const node of representations) {
    const members = indexedMembers(scene, node.id, nodes);
    membersByNode.set(node.id, members);
    node.memberCount = members.length;
    node.memberDigest = observatoryDigest(members);
    node.expansionRef.projectionRevision = revision;
  }
  const selectedEnvironment = input.environment ?? null;
  const providerInScope = (environment: string | null) =>
    selectedEnvironment === null ||
    environment === null ||
    providerScopeMatch(environment, selectedEnvironment) === "matched";
  const notices = uniqueById(
    (input.providerNotices ?? []).filter(
      (notice) =>
        resources.get(notice.providerId)?.kind === "provider" &&
        providerInScope(notice.environment),
    ),
  );
  const noticesByProvider = new Map<string, ObservatoryProviderNotice[]>();
  for (const notice of notices) {
    const values = noticesByProvider.get(notice.providerId) ?? [];
    values.push(notice);
    noticesByProvider.set(notice.providerId, values);
  }
  const exposuresByResource = new Map<string, ObservatoryProviderExposure[]>();
  for (const dependency of dependencies.filter((item) =>
    providerInScope(item.environment),
  ))
    for (const notice of noticesByProvider.get(dependency.providerId) ?? []) {
      const attribution = (input.attributions ?? []).find(
        (item) =>
          item.noticeId === notice.id &&
          item.resourceId === dependency.resourceId,
      );
      const exposure = evaluateObservatoryProviderExposure(notice, dependency, {
        resourceId: dependency.resourceId,
        now: input.now,
        localSignals:
          accessFor(facetIndex, dependency.resourceId, "availability") ===
          "available"
            ? (
                facetIndex.signals
                  .get(dependency.resourceId)
                  ?.get("availability") ?? []
              ).filter(
                (signal) =>
                  selectedEnvironment === null ||
                  providerScopeMatch(
                    signal.environment,
                    selectedEnvironment,
                  ) === "matched",
              )
            : [],
        ...(attribution ? { attribution } : {}),
      });
      scene.providerExposures.push(exposure);
      const values = exposuresByResource.get(dependency.resourceId) ?? [];
      values.push(exposure);
      exposuresByResource.set(dependency.resourceId, values);
    }
  // Replace only this canonical resource's absence-of-evidence fallback before
  // aggregation. An unrelated member's unknown/access/stale count is independent.
  for (const [resourceId, exposures] of exposuresByResource) {
    const summary = resourceSummaries.get(resourceId)!;
    if (
      accessFor(facetIndex, resourceId, "provider") === "available" &&
      signalsFor(facetIndex, resourceId, "provider").length === 0
    )
      delete summary.provider.counts.unknown;
    for (const classification of sort(
      exposures.map((item) =>
        item.freshness === "fresh" ? item.classification : item.freshness,
      ),
    ))
      // Multiple sources establish one canonical member in this classification.
      summary.provider.counts[classification] = 1;
  }
  scene.summary = aggregateResourceSummaries(
    facetIndex,
    resourceSummaries,
    populationIds,
  );
  for (const node of representations)
    node.summary = aggregateResourceSummaries(
      facetIndex,
      resourceSummaries,
      membersByNode.get(node.id)!,
    );
  scene.searchResults = searchObservatory(scene, input.search ?? "");
  const expanded = new Set(input.expandedRepresentationIds ?? []);
  for (const result of scene.searchResults)
    for (const id of result.path.slice(0, -1)) expanded.add(id);
  const pending = [...scene.rootRepresentationIds],
    visible = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visible.has(id)) continue;
    visible.add(id);
    if (expanded.has(id)) pending.push(...children[id]!);
  }
  // Breadth-first default detail: whole sibling sets only, so a revealed group
  // never shows a partial membership. Membership conservation is unchanged.
  const budget = Math.max(0, input.revealBudget ?? OBSERVATORY_REVEAL_BUDGET);
  const levels: [string, number][] = scene.rootRepresentationIds.map((id) => [
    id,
    0,
  ]);
  for (let index = 0; index < levels.length; index++) {
    const [id, level] = levels[index]!;
    const members = children[id]!,
      hidden = members.filter((child) => !visible.has(child));
    // Explicit expansion of a default-revealed group always opens it.
    if (
      hidden.length &&
      (expanded.has(id) ||
        (level < OBSERVATORY_REVEAL_DEPTH &&
          visible.size + hidden.length <= budget))
    )
      for (const child of hidden) visible.add(child);
    for (const child of members)
      if (visible.has(child)) levels.push([child, level + 1]);
  }
  scene.visibleRepresentationIds = sort(visible);
  return scene;
}

export function searchObservatory(
  scene: ObservatoryScene,
  query: string,
): ObservatorySearchResult[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  const byId = new Map(scene.representations.map((node) => [node.id, node]));
  return scene.representations
    .filter(
      (node) =>
        node.resourceId &&
        !node.referenceTo &&
        (node.label.toLocaleLowerCase().includes(normalized) ||
          node.resourceId.toLocaleLowerCase() === normalized),
    )
    .map((node) => {
      const path = [node.id],
        seen = new Set(path);
      let parent = node.parentRepresentationId;
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        path.unshift(parent);
        parent = byId.get(parent)?.parentRepresentationId ?? null;
      }
      return { resourceId: node.resourceId!, representationId: node.id, path };
    });
}

/** Opaque continuation binds to this scope, structural revision and group. Not an auth token. */
export function readObservatoryMembers(
  scene: ObservatoryScene,
  request: ObservatoryExpansionRef & { cursor?: string | null; limit: number },
): ObservatoryMembershipPage {
  if (
    request.scopeDigest !== scene.scopeDigest ||
    request.projectionRevision !== scene.projectionRevision
  )
    throw new Error("Membership scope or revision changed");
  if (!Number.isSafeInteger(request.limit) || request.limit <= 0)
    throw new Error("Membership limit must be a positive integer");
  const members = observatoryMembers(scene, request.groupId);
  const prefix = `${key(scene.scopeDigest)}|${key(scene.projectionRevision)}|${key(request.groupId)}|`;
  let offset = 0;
  if (request.cursor) {
    if (!request.cursor.startsWith(prefix))
      throw new Error("Membership cursor scope or revision mismatch");
    const raw = request.cursor.slice(prefix.length);
    if (!/^[1-9][0-9]*$/.test(raw))
      throw new Error("Invalid membership cursor");
    offset = Number(raw);
    if (!Number.isSafeInteger(offset) || offset >= members.length)
      throw new Error("Invalid membership cursor offset");
  }
  const items = members
    .slice(offset, offset + request.limit)
    .map((resourceId) => ({
      resourceId,
      representationId: resourceRepresentationId(resourceId),
    }));
  const next = offset + items.length;
  return {
    groupId: request.groupId,
    scopeDigest: scene.scopeDigest,
    projectionRevision: scene.projectionRevision,
    total: members.length,
    digest: observatoryDigest(members),
    items,
    nextCursor: next < members.length ? `${prefix}${next}` : null,
    completeness: next < members.length ? "partial" : "complete",
  };
}
