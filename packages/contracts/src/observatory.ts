import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const evidence = z.array(id).min(1);
export const observatoryGroupingSchema = z.enum([
  "operational",
  "hosts",
  "projects",
  "providers",
  "inventory",
  "custom",
]);
export const observatoryKindSchema = z.enum([
  "host",
  "service",
  "deployment",
  "provider",
  "repository",
  "collection",
  "project",
  "reference",
]);
export const observatoryFacetSchema = z.enum([
  "availability",
  "telemetry",
  "capacity",
  "lifecycle",
  "security",
  "provider",
  "work",
]);
export const observatoryAccessSchema = z.enum([
  "available",
  "unsupported",
  "unavailable",
  "inaccessible",
  "disabled",
]);
export const observatoryFreshnessSchema = z.enum(["fresh", "stale", "future"]);
export const observatoryProvenanceSchema = z.strictObject({
  actorId: id,
  recordedAt: timestamp,
  evidenceRefs: evidence,
});
export const observatoryMetadataSchema = z.strictObject({
  resourceId: z.uuid(),
  role: z.enum(["operated", "unknown"]),
  pinned: z.boolean(),
  environment: id.nullable(),
  provenance: observatoryProvenanceSchema,
});
export const observatoryRequirementSchema = z.strictObject({
  id,
  resourceId: z.uuid(),
  role: z.enum(["required", "optional", "unspecified"]),
  environment: id.nullable(),
});
export const observatoryFacetAccessSchema = z.strictObject({
  resourceId: z.uuid(),
  facet: observatoryFacetSchema,
  state: observatoryAccessSchema,
});
const signalFields = {
  id,
  resourceId: z.uuid(),
  sourceId: id,
  observedAt: timestamp,
  freshnessMs: z.number().positive().finite(),
  evidenceRefs: evidence,
  environment: id.nullable(),
  incidentId: id.nullable(),
  sourceQualification: z.enum(["current", "last_known"]).optional(),
  freshness: observatoryFreshnessSchema,
};
export const observatorySignalSchema = z.discriminatedUnion("facet", [
  z.strictObject({
    ...signalFields,
    facet: z.literal("availability"),
    state: z.enum(["passing", "degraded", "failing", "unknown"]),
  }),
  z.strictObject({
    ...signalFields,
    facet: z.literal("telemetry"),
    state: z.enum(["reporting", "error", "unknown"]),
  }),
  z.strictObject({
    ...signalFields,
    facet: z.literal("capacity"),
    state: z.enum(["normal", "pressure", "critical", "unknown"]),
  }),
  z.strictObject({
    ...signalFields,
    facet: z.literal("lifecycle"),
    state: z.enum(["active", "maintenance", "retired", "stopped", "unknown"]),
  }),
  z.strictObject({
    ...signalFields,
    facet: z.literal("security"),
    state: z.enum([
      "zero_findings",
      "findings",
      "confirmed_incident",
      "reported",
      "unknown",
    ]),
  }),
  z.strictObject({
    ...signalFields,
    facet: z.literal("provider"),
    state: z.enum(["exposure", "advisory", "unknown"]),
  }),
  z.strictObject({
    ...signalFields,
    facet: z.literal("work"),
    state: z.enum([
      "queued",
      "running",
      "waiting_approval",
      "review",
      "failed",
      "complete",
      "unknown",
    ]),
  }),
]);
export const observatoryRelationSchema = z
  .strictObject({
    id,
    type: z.enum(["deploys", "executes_on", "provides_service", "depends_on"]),
    sourceId: z.uuid(),
    targetId: z.uuid(),
    sourceKind: id,
    targetKind: id,
    environment: id.nullable(),
    provenance: observatoryProvenanceSchema,
  })
  .refine(
    (relation) =>
      relation.type === "depends_on" ||
      (relation.type === "deploys" &&
        relation.sourceKind === "repository" &&
        relation.targetKind === "deployment") ||
      (relation.type === "executes_on" &&
        relation.sourceKind === "deployment" &&
        ["host", "provider"].includes(relation.targetKind)) ||
      (relation.type === "provides_service" &&
        relation.sourceKind === "deployment" &&
        relation.targetKind === "service"),
    "Invalid typed relation endpoints",
  );
export const observatoryProviderDependencySchema = z.strictObject({
  id,
  resourceId: z.uuid(),
  providerId: z.uuid(),
  product: id,
  environment: id.nullable(),
  geography: id.nullable(),
  plane: z.enum(["control", "data"]),
  provenance: observatoryProvenanceSchema,
});
export const observatoryProviderNoticeSchema = z.strictObject({
  id,
  updateId: id,
  providerId: z.uuid(),
  componentIds: z.array(id),
  product: id.nullable(),
  environment: id.nullable(),
  geography: id.nullable(),
  plane: z.enum(["control", "data"]).nullable(),
  severity: z.enum(["minor", "major", "critical", "unknown"]),
  status: z.enum(["open", "monitoring", "resolved", "maintenance", "unknown"]),
  confidence: z.enum(["reported", "verified"]),
  sourceId: id,
  observedAt: timestamp,
  freshnessMs: z.number().positive().finite(),
  feedState: z
    .enum(["current", "stale", "unavailable", "disabled", "unknown"])
    .optional(),
  evidenceRefs: evidence,
});
export const observatoryProviderExposureSchema = z
  .strictObject({
    noticeId: id,
    updateId: id,
    providerId: z.uuid(),
    resourceId: z.uuid(),
    dependencyId: id.nullable(),
    relevance: z.enum(["matched", "unrelated", "unknown"]),
    classification: z.enum([
      "confirmed_local_impact",
      "potential_exposure",
      "advisory",
      "relevance_unknown",
    ]),
    severity: z.enum(["minor", "major", "critical", "unknown"]),
    confidence: z.enum(["reported", "verified"]),
    localImpact: z.enum(["confirmed", "unknown"]),
    causation: z.enum(["unknown", "suspected", "established"]),
    freshness: observatoryFreshnessSchema,
    feedState: z
      .enum(["current", "stale", "unavailable", "disabled", "unknown"])
      .optional(),
    status: z.enum([
      "open",
      "monitoring",
      "resolved",
      "maintenance",
      "unknown",
    ]),
    sourceId: id,
    observedAt: timestamp,
    evidenceRefs: evidence,
  })
  .superRefine((value, context) => {
    if (
      value.classification === "potential_exposure" &&
      (value.relevance !== "matched" ||
        value.freshness !== "fresh" ||
        !["open", "monitoring"].includes(value.status) ||
        (value.feedState !== undefined && value.feedState !== "current"))
    )
      context.addIssue({
        code: "custom",
        message: "Potential exposure requires a fresh active dependency match",
      });
    if (
      value.classification === "confirmed_local_impact" &&
      (value.relevance !== "matched" || value.localImpact !== "confirmed")
    )
      context.addIssue({
        code: "custom",
        message: "Confirmed impact requires independent local evidence",
      });
  });
const stateCounts = z.strictObject({
  passing: count,
  degraded: count,
  failing: count,
  unknown: count,
  maintenance: count,
});
const facetSummary = z.strictObject({
  counts: z.record(id, count),
  signalIds: z.array(id),
});
export const observatorySummarySchema = z
  .strictObject({
    availability: stateCounts.extend({
      required: stateCounts,
      optional: stateCounts,
      unspecified: stateCounts,
      confirmedImpact: z.boolean(),
    }),
    coverage: z.strictObject({
      eligible: count,
      monitored: count,
      unmonitored: count,
      stale: count,
      state: z.enum(["not_monitored", "incomplete", "complete"]),
    }),
    telemetry: facetSummary,
    capacity: facetSummary,
    lifecycle: facetSummary,
    security: facetSummary,
    provider: facetSummary,
    work: facetSummary,
    incidentIds: z.array(id),
  })
  .superRefine((value, context) => {
    const coverage = value.coverage;
    const total = (counts: z.infer<typeof stateCounts>) =>
      Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (
      coverage.monitored + coverage.unmonitored !== coverage.eligible ||
      coverage.stale > coverage.unmonitored ||
      total(value.availability.required) +
        total(value.availability.optional) +
        total(value.availability.unspecified) !==
        coverage.eligible
    )
      context.addIssue({
        code: "custom",
        message: "Inconsistent coverage counts",
      });
    for (const state of [
      "passing",
      "degraded",
      "failing",
      "unknown",
      "maintenance",
    ] as const)
      if (
        value.availability[state] !==
        value.availability.required[state] +
          value.availability.optional[state] +
          value.availability.unspecified[state]
      )
        context.addIssue({
          code: "custom",
          message: "Inconsistent availability counts",
        });
    const expected =
      coverage.monitored === 0
        ? "not_monitored"
        : coverage.monitored < coverage.eligible
          ? "incomplete"
          : "complete";
    if (
      coverage.state !== expected ||
      value.availability.confirmedImpact !==
        value.availability.required.failing > 0
    )
      context.addIssue({
        code: "custom",
        message: "Summary overstates observed coverage or impact",
      });
  });
export const observatoryExpansionRefSchema = z.strictObject({
  groupId: id,
  scopeDigest: id,
  projectionRevision: id,
});
export const observatoryRepresentationSchema = z
  .strictObject({
    id,
    kind: observatoryKindSchema,
    resourceId: z.uuid().nullable(),
    aggregateId: id.nullable(),
    referenceTo: id.nullable(),
    label: z.string(),
    layoutKey: id,
    parentRepresentationId: id.nullable(),
    projects: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
    memberCount: count,
    memberDigest: id,
    expansionRef: observatoryExpansionRefSchema,
    summary: observatorySummarySchema,
  })
  .superRefine((value, context) => {
    const valid =
      value.kind === "reference"
        ? value.resourceId !== null &&
          value.referenceTo !== null &&
          value.aggregateId === null
        : value.referenceTo === null &&
          (value.resourceId !== null) !== (value.aggregateId !== null);
    if (!valid)
      context.addIssue({
        code: "custom",
        message:
          "Representation must declare one canonical or aggregate identity; aliases require a target",
      });
  });
export const observatorySearchResultSchema = z.strictObject({
  resourceId: z.uuid(),
  representationId: id,
  path: z.array(id).min(1),
});
export const observatorySourceObservationSchema = z.strictObject({
  resourceId: z.uuid(),
  sourceId: id,
  observedAt: timestamp.nullable(),
  freshnessWindowMinutes: z.number().int().positive(),
  enabled: z.boolean(),
  error: z.string().nullable(),
  state: z.enum([
    "reporting",
    "stale",
    "unknown",
    "disabled",
    "future",
    "error",
  ]),
  evidenceRefs: evidence,
});
export const observatoryCapacityObservationSchema = z.strictObject({
  resourceId: z.uuid(),
  name: id,
  unit: z.string(),
  value: z.number().finite(),
  observedAt: timestamp,
  evidenceRef: id,
});
export const observatorySceneSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    completeness: z.literal("complete"),
    scopeDigest: id,
    viewRevision: id,
    projectionRevision: id,
    grouping: observatoryGroupingSchema,
    readStartedAt: timestamp,
    readCompletedAt: timestamp,
    evaluatedAt: timestamp,
    population: z.strictObject({
      canonicalResourceCount: count,
      representationCount: count,
      digest: id,
    }),
    rootRepresentationIds: z.array(id),
    visibleRepresentationIds: z.array(id),
    representations: z.array(observatoryRepresentationSchema),
    membershipIndex: z.strictObject({
      resourceIds: z.array(z.uuid()),
      directMembers: z.record(id, z.array(z.uuid())),
      children: z.record(id, z.array(id)),
    }),
    containment: z.array(
      z.strictObject({
        resourceId: z.uuid(),
        parentResourceId: z.uuid().nullable(),
        state: z.enum(["root", "known", "missing", "cycle"]),
      }),
    ),
    relations: z.array(observatoryRelationSchema),
    signals: z.array(observatorySignalSchema),
    sourceObservations: z.array(observatorySourceObservationSchema),
    capacityObservations: z.array(observatoryCapacityObservationSchema),
    providerExposures: z.array(observatoryProviderExposureSchema),
    summary: observatorySummarySchema,
    searchResults: z.array(observatorySearchResultSchema),
  })
  .superRefine((scene, context) => {
    const fail = (message: string) =>
      context.addIssue({ code: "custom", message });
    const resources = new Set(scene.membershipIndex.resourceIds);
    const nodes = new Map(scene.representations.map((node) => [node.id, node]));
    const canonical = scene.representations.filter(
      (node) => node.resourceId && !node.referenceTo,
    );
    if (
      resources.size !== scene.membershipIndex.resourceIds.length ||
      nodes.size !== scene.representations.length ||
      scene.population.canonicalResourceCount !== resources.size ||
      scene.population.representationCount !== nodes.size ||
      canonical.length !== resources.size ||
      new Set(canonical.map((node) => node.resourceId)).size !== resources.size
    )
      fail("Population identities or totals disagree");
    if (Date.parse(scene.readCompletedAt) < Date.parse(scene.readStartedAt))
      fail("Read completion predates read start");
    const roots = new Set(scene.rootRepresentationIds);
    const visible = new Set(scene.visibleRepresentationIds);
    if (
      roots.size !== scene.rootRepresentationIds.length ||
      visible.size !== scene.visibleRepresentationIds.length ||
      [...roots].some((id) => !nodes.has(id) || !visible.has(id)) ||
      scene.visibleRepresentationIds.some((id) => !nodes.has(id))
    )
      fail("Invalid root or visible identity");
    const visibleMembers = new Set<string>();
    const represented = new Set<string>();
    const pendingVisible = [...visible];
    while (pendingVisible.length) {
      const current = pendingVisible.pop()!;
      if (represented.has(current)) continue;
      represented.add(current);
      for (const member of scene.membershipIndex.directMembers[current] ?? [])
        visibleMembers.add(member);
      const reference = nodes.get(current)?.referenceTo;
      if (reference) pendingVisible.push(reference);
      pendingVisible.push(...(scene.membershipIndex.children[current] ?? []));
    }
    if (
      visibleMembers.size !== resources.size ||
      [...visibleMembers].some((id) => !resources.has(id))
    )
      fail("Visible representation membership is incomplete");
    for (const [groupId, members] of Object.entries(
      scene.membershipIndex.directMembers,
    ))
      if (
        !nodes.has(groupId) ||
        members.some((id) => !resources.has(id)) ||
        new Set(members).size !== members.length
      )
        fail("Foreign or duplicate member");
    for (const [groupId, children] of Object.entries(
      scene.membershipIndex.children,
    ))
      if (
        !nodes.has(groupId) ||
        children.some(
          (id) => nodes.get(id)?.parentRepresentationId !== groupId,
        ) ||
        new Set(children).size !== children.length
      )
        fail("Invalid member adjacency");
    for (const node of scene.representations) {
      if (
        (node.resourceId && !resources.has(node.resourceId)) ||
        (node.referenceTo &&
          (!nodes.has(node.referenceTo) ||
            nodes.get(node.referenceTo)?.resourceId !== node.resourceId ||
            nodes.get(node.referenceTo)?.referenceTo !== null)) ||
        (node.parentRepresentationId &&
          !nodes.has(node.parentRepresentationId)) ||
        roots.has(node.id) !== (node.parentRepresentationId === null)
      )
        fail("Invalid canonical reference or parent");
      if (
        !Object.hasOwn(scene.membershipIndex.directMembers, node.id) ||
        !Object.hasOwn(scene.membershipIndex.children, node.id)
      )
        fail("Incomplete membership index");
      const direct = scene.membershipIndex.directMembers[node.id] ?? [];
      if (
        node.resourceId && !node.referenceTo
          ? direct.length !== 1 || direct[0] !== node.resourceId
          : direct.length !== 0
      )
        fail("Invalid direct canonical membership");
      if (
        node.parentRepresentationId &&
        !(
          scene.membershipIndex.children[node.parentRepresentationId] ?? []
        ).includes(node.id)
      )
        fail("Missing child adjacency");
      const pending = [node.id],
        visited = new Set<string>(),
        members = new Set<string>();
      while (pending.length) {
        const current = pending.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const member of scene.membershipIndex.directMembers[current] ?? [])
          members.add(member);
        const reference = nodes.get(current)?.referenceTo;
        if (reference)
          for (const member of scene.membershipIndex.directMembers[reference] ??
            [])
            members.add(member);
        pending.push(...(scene.membershipIndex.children[current] ?? []));
      }
      if (members.size !== node.memberCount)
        fail("Aggregate unique member count disagrees");
      if (
        node.expansionRef.groupId !== node.id ||
        node.expansionRef.scopeDigest !== scene.scopeDigest ||
        node.expansionRef.projectionRevision !== scene.projectionRevision
      )
        fail("Expansion reference is not bound to the scene");
      const seen = new Set([node.id]);
      let parent = node.parentRepresentationId;
      while (parent && nodes.has(parent)) {
        if (seen.has(parent)) {
          fail("Cyclic representation parents");
          break;
        }
        seen.add(parent);
        parent = nodes.get(parent)!.parentRepresentationId;
      }
    }
    if (
      scene.containment.length !== resources.size ||
      new Set(scene.containment.map((item) => item.resourceId)).size !==
        resources.size
    )
      fail("Incomplete containment index");
    for (const item of scene.containment)
      if (
        !resources.has(item.resourceId) ||
        (item.parentResourceId && !resources.has(item.parentResourceId))
      )
        fail("Foreign containment subject");
    for (const relation of scene.relations)
      if (
        !resources.has(relation.sourceId) ||
        !resources.has(relation.targetId)
      )
        fail("Foreign relation endpoint");
    for (const signal of scene.signals) {
      if (!resources.has(signal.resourceId)) fail("Foreign signal subject");
      const age = Date.parse(scene.evaluatedAt) - Date.parse(signal.observedAt);
      if (
        signal.freshness !==
        (age < 0 ? "future" : age >= signal.freshnessMs ? "stale" : "fresh")
      )
        fail("Signal freshness disagrees with observation time");
    }
    for (const source of scene.sourceObservations) {
      if (!resources.has(source.resourceId)) fail("Foreign source subject");
      const age = source.observedAt
        ? Date.parse(scene.evaluatedAt) - Date.parse(source.observedAt)
        : null;
      const expected = !source.enabled
        ? "disabled"
        : source.error
          ? "error"
          : age === null
            ? "unknown"
            : age < 0
              ? "future"
              : age >= source.freshnessWindowMinutes * 60000
                ? "stale"
                : "reporting";
      if (source.state !== expected)
        fail("Source freshness disagrees with observation time");
    }
    for (const metric of scene.capacityObservations)
      if (!resources.has(metric.resourceId)) fail("Foreign capacity subject");
    for (const exposure of scene.providerExposures)
      if (
        !resources.has(exposure.resourceId) ||
        !resources.has(exposure.providerId)
      )
        fail("Foreign provider subject");
    for (const result of scene.searchResults)
      if (
        !resources.has(result.resourceId) ||
        nodes.get(result.representationId)?.resourceId !== result.resourceId ||
        result.path.at(-1) !== result.representationId ||
        result.path.some((id) => !nodes.has(id))
      )
        fail("Invalid search result path");
  });
export const observatoryMembershipPageSchema = observatoryExpansionRefSchema
  .extend({
    total: count,
    digest: id,
    items: z.array(
      z.strictObject({ resourceId: z.uuid(), representationId: id }),
    ),
    nextCursor: id.nullable(),
    completeness: z.enum(["partial", "complete"]),
  })
  .superRefine((page, context) => {
    if (
      page.items.length > page.total ||
      new Set(page.items.map((item) => item.resourceId)).size !==
        page.items.length ||
      (page.nextCursor === null) !== (page.completeness === "complete")
    )
      context.addIssue({
        code: "custom",
        message: "Invalid membership continuation or count",
      });
  });

export type ObservatorySceneDto = z.infer<typeof observatorySceneSchema>;
export type ObservatoryMembershipPageDto = z.infer<
  typeof observatoryMembershipPageSchema
>;
export type ObservatoryRepresentationDto = z.infer<
  typeof observatoryRepresentationSchema
>;
export type ObservatorySignalDto = z.infer<typeof observatorySignalSchema>;
export type ObservatoryProviderExposureDto = z.infer<
  typeof observatoryProviderExposureSchema
>;
