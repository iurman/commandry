import type {
  ObservatoryInput,
  ObservatoryProviderDependency,
  ObservatoryProviderNotice,
  ObservatoryProvenance,
  ObservatoryRelation,
  ObservatoryResource,
  ObservatorySignal,
} from "@commandry/domain";

/** Entirely synthetic. No owner inventory, addresses, credentials or runtime records. */
export const observatoryFixtureTime = "2026-10-16T12:00:00.000Z";
export const observatoryFixtureId = (index: number) =>
  `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
export const observatoryFixtureProvenance: ObservatoryProvenance = {
  actorId: "synthetic-fixture-author",
  recordedAt: observatoryFixtureTime,
  evidenceRefs: ["fixture:reviewed-mapping"],
};
export const observatoryFixtureResource = (
  index: number,
  kind = "service",
): ObservatoryResource => ({
  id: observatoryFixtureId(index),
  name: `Synthetic ${kind} ${index}`,
  kind,
  parentResourceId: null,
  projects: [],
  sources: [],
  metrics: [],
  telemetry: "unknown",
});
export function observatoryFixtureSignal(
  resourceId: string,
  id: string,
  state: "passing" | "degraded" | "failing" | "unknown",
  environment: string | null = "production",
): ObservatorySignal {
  return {
    id,
    resourceId,
    facet: "availability",
    state,
    sourceId: "fixture:availability-adapter",
    observedAt: observatoryFixtureTime,
    freshnessMs: 300000,
    evidenceRefs: [`fixture:observation:${id}`],
    environment,
    incidentId: state === "failing" ? `fixture:incident:${id}` : null,
  };
}
export const observatoryFixtureInput = (
  resources: readonly ObservatoryResource[],
): ObservatoryInput => ({
  resources,
  collection: { complete: true, resourceCount: resources.length },
  scopeDigest: "fixture:owner:all",
  viewRevision: "fixture:view:1",
  readStartedAt: "2026-10-16T12:00:01.000Z",
  readCompletedAt: "2026-10-16T12:00:02.000Z",
  now: "2026-10-16T12:00:03.000Z",
});

/** F1 independently defined population: 60 repositories + 18 hosts + 13 services. */
export function mixedObservatoryFixture() {
  const projects = Array.from({ length: 15 }, (_, index) => ({
    id: observatoryFixtureId(10000 + index),
    name: `Synthetic project ${index + 1}`,
  }));
  const repositories = Array.from(
    { length: 60 },
    (_, index): ObservatoryResource => ({
      ...observatoryFixtureResource(index + 1, "repository"),
      projects:
        index < 48
          ? []
          : index < 53
            ? [projects[index - 48]!, projects[12 + ((index - 48) % 3)]!]
            : [projects[index - 48]!],
    }),
  );
  const hosts = Array.from({ length: 18 }, (_, index): ObservatoryResource => ({
    ...observatoryFixtureResource(61 + index, "host"),
    parentResourceId: index === 4 ? observatoryFixtureId(61) : null,
    projects: index < 2 ? [projects[index]!, projects[index + 2]!] : [],
    telemetry: index < 4 ? "reporting" : "unknown",
    sources:
      index < 4
        ? [
            {
              id: observatoryFixtureId(20000 + index),
              enabled: true,
              observedAt: observatoryFixtureTime,
              freshnessWindowMinutes: 5,
              error: null,
            },
          ]
        : [],
    metrics:
      index < 4
        ? [
            {
              name: "memory.total",
              unit: "bytes",
              value: 17179869184,
              sampledAt: observatoryFixtureTime,
              evidenceHref: `/api/v1/source-envelopes/${observatoryFixtureId(30000 + index)}`,
            },
          ]
        : [],
  }));
  const services = Array.from(
    { length: 13 },
    (_, index): ObservatoryResource => ({
      ...observatoryFixtureResource(79 + index),
      parentResourceId: hosts[index % 4]!.id,
      projects: [projects[index % 15]!],
    }),
  );
  return {
    ...observatoryFixtureInput([...repositories, ...hosts, ...services]),
    projects,
    expected: {
      resources: 91,
      repositories: 60,
      hosts: 18,
      services: 13,
      projects: 15,
      unlinkedRepositories: 48,
      sharedResources: 7,
      observedHosts: 4,
      monitoredAvailability: 0,
    },
  };
}

/** F2: explicit reviewed mappings, two environments and independent operational facets. */
export function operationalObservatoryFixture() {
  const providers = [
    observatoryFixtureResource(40001, "provider"),
    observatoryFixtureResource(40002, "provider"),
  ];
  const hosts = [
    observatoryFixtureResource(40003, "host"),
    observatoryFixtureResource(40004, "host"),
  ];
  const projects = [0, 1, 2].map((index) => ({
    id: observatoryFixtureId(41000 + index),
    name: `Operational project ${index + 1}`,
  }));
  const repositories = [0, 1, 2].map((index) => ({
    ...observatoryFixtureResource(40005 + index, "repository"),
    projects: index === 0 ? projects : [projects[1]!],
  }));
  const deployments = [0, 1, 2, 3].map((index) =>
    observatoryFixtureResource(40008 + index, "deployment"),
  );
  const services = [
    "API",
    "Frontend",
    "Jobs",
    "Queue",
    "Shared database",
    "Unmonitored endpoint",
    "Optional development service",
  ].map((name, index) => ({
    ...observatoryFixtureResource(40012 + index),
    name: `Synthetic ${name}`,
    parentResourceId: hosts[index < 6 ? 0 : 1]!.id,
  }));
  const resources = [
    ...providers,
    ...hosts,
    ...repositories,
    ...deployments,
    ...services,
  ];
  const relations: ObservatoryRelation[] = [];
  const relate = (
    type: ObservatoryRelation["type"],
    from: ObservatoryResource,
    to: ObservatoryResource,
    environment = "production",
  ) =>
    relations.push({
      id: `fixture:relation:${relations.length}`,
      type,
      sourceId: from.id,
      targetId: to.id,
      sourceKind: from.kind,
      targetKind: to.kind,
      environment,
      provenance: observatoryFixtureProvenance,
    });
  relate("deploys", repositories[0]!, deployments[0]!);
  relate("deploys", repositories[0]!, deployments[1]!, "development");
  relate("deploys", repositories[0]!, deployments[3]!);
  relate("deploys", repositories[1]!, deployments[2]!);
  relate("deploys", repositories[2]!, deployments[2]!);
  relate("executes_on", deployments[0]!, providers[0]!);
  relate("executes_on", deployments[0]!, hosts[0]!);
  relate("executes_on", deployments[1]!, hosts[1]!, "development");
  relate("executes_on", deployments[2]!, hosts[0]!);
  relate("executes_on", deployments[3]!, providers[0]!);
  for (const index of [0, 1, 4])
    relate("provides_service", deployments[0]!, services[index]!);
  for (const index of [2, 3, 4, 5])
    relate("provides_service", deployments[2]!, services[index]!);
  relate("provides_service", deployments[1]!, services[6]!, "development");
  const signals: ObservatorySignal[] = [0, 1, 2, 3].map((index) =>
    observatoryFixtureSignal(
      services[index]!.id,
      `fixture:check:${index}`,
      "passing",
    ),
  );
  signals.push(
    observatoryFixtureSignal(
      services[4]!.id,
      "fixture:database-failure",
      "failing",
    ),
    observatoryFixtureSignal(
      services[6]!.id,
      "fixture:optional-failure",
      "failing",
      "development",
    ),
  );
  const base = observatoryFixtureSignal(
    repositories[0]!.id,
    "fixture:base",
    "unknown",
  );
  signals.push(
    {
      ...base,
      id: "fixture:scan",
      facet: "security",
      state: "zero_findings",
      sourceId: "fixture:scanner",
    },
    {
      ...base,
      id: "fixture:run",
      facet: "work",
      state: "waiting_approval",
      sourceId: "fixture:accepted-runtime",
    },
    {
      ...base,
      id: "fixture:capacity",
      resourceId: hosts[0]!.id,
      facet: "capacity",
      state: "pressure",
      sourceId: "fixture:capacity-policy",
    },
  );
  const providerDependencies: ObservatoryProviderDependency[] = [0, 4].map(
    (index) => ({
      id: `fixture:dependency:${index}`,
      resourceId: services[index]!.id,
      providerId: providers[0]!.id,
      product: "workers",
      environment: "production",
      geography: "eu",
      plane: "data",
      provenance: observatoryFixtureProvenance,
    }),
  );
  const providerNotices: ObservatoryProviderNotice[] = [
    {
      id: "fixture:provider-incident",
      updateId: "fixture:provider-update:1",
      providerId: providers[0]!.id,
      componentIds: ["fixture:component:workers"],
      product: "workers",
      environment: "*",
      geography: "*",
      plane: "data",
      severity: "major",
      status: "open",
      confidence: "reported",
      sourceId: "fixture:official-provider-api",
      observedAt: observatoryFixtureTime,
      freshnessMs: 600000,
      evidenceRefs: ["fixture:provider-status-evidence"],
    },
  ];
  return {
    ...observatoryFixtureInput(resources),
    projects,
    providers,
    hosts,
    repositories,
    deployments,
    services,
    relations,
    signals,
    requirements: services.map((service, index) => ({
      id: `fixture:requirement:${index}`,
      resourceId: service.id,
      role: index === 6 ? ("optional" as const) : ("required" as const),
      environment: index === 6 ? "development" : "production",
    })),
    facetAccess: [
      {
        resourceId: repositories[0]!.id,
        facet: "security" as const,
        state: "available" as const,
      },
      {
        resourceId: repositories[0]!.id,
        facet: "work" as const,
        state: "available" as const,
      },
    ],
    providerDependencies,
    providerNotices,
    metadata: hosts.map((host) => ({
      resourceId: host.id,
      role: "operated" as const,
      pinned: false,
      environment: null,
      provenance: observatoryFixtureProvenance,
    })),
    expected: {
      resources: 18,
      repositories: 3,
      hosts: 2,
      deployments: 4,
      providers: 2,
      services: 7,
      productionRequirements: 6,
      passing: 4,
      failing: 1,
      unmonitored: 1,
      optionalFailures: 1,
    },
  };
}

/** F3: 1,000 canonical resources; deep hosts, wide services, orphan and dependency cycles. */
export function scaleObservatoryFixture(size = 1000): ObservatoryInput {
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error("Fixture size must be a nonnegative integer");
  const repositoryCount = Math.floor(size * 0.3),
    hostCount = Math.floor(size * 0.3);
  const resources = Array.from(
    { length: size },
    (_, index): ObservatoryResource => {
      const kind =
        index < repositoryCount
          ? "repository"
          : index < repositoryCount + hostCount
            ? "host"
            : "service";
      const parentResourceId =
        kind === "host" && index > repositoryCount
          ? observatoryFixtureId(50000 + index - 1)
          : kind === "service" && hostCount
            ? observatoryFixtureId(
                50000 + repositoryCount + (index % 2 ? hostCount - 1 : 0),
              )
            : null;
      return {
        ...observatoryFixtureResource(50000 + index, kind),
        name:
          index % 11 === 0
            ? "Synthetic duplicate name"
            : index === size - 1
              ? `Synthetic long label ${"complete search token ".repeat(30)}`
              : `Synthetic scale ${index}`,
        parentResourceId:
          index === size - 1 ? observatoryFixtureId(999999) : parentResourceId,
      };
    },
  );
  if (repositoryCount >= 2) {
    resources[0] = { ...resources[0]!, parentResourceId: resources[1]!.id };
    resources[1] = { ...resources[1]!, parentResourceId: resources[0]!.id };
  }
  const relations: ObservatoryRelation[] =
    resources.length >= 2
      ? [
          [resources[0]!, resources[1]!],
          [resources[1]!, resources[0]!],
        ].map(([from, to], index) => ({
          id: `fixture:cycle:${index}`,
          type: "depends_on",
          sourceId: from!.id,
          targetId: to!.id,
          sourceKind: from!.kind,
          targetKind: to!.kind,
          environment: null,
          provenance: observatoryFixtureProvenance,
        }))
      : [];
  return { ...observatoryFixtureInput(resources), relations };
}

// Test-only access to the canonical projector for UI integration fixtures.
export { projectObservatory } from "@commandry/domain";
