import { describe, expect, it } from "vitest";
import {
  evaluateObservatoryProviderExposure,
  observatoryFreshness,
  observatoryMembers,
  projectObservatory,
  readObservatoryMembers,
  reduceObservatoryFacets,
  searchObservatory,
} from "./observatory";
import type {
  ObservatoryGrouping,
  ObservatoryInput,
  ObservatoryScene,
  ObservatorySignal,
} from "./observatory";
import {
  mixedObservatoryFixture,
  operationalObservatoryFixture,
  observatoryFixtureInput,
  observatoryFixtureProvenance,
  observatoryFixtureResource,
  observatoryFixtureSignal,
  scaleObservatoryFixture,
} from "../../../tests/fixtures/observatory";

const groupings: ObservatoryGrouping[] = [
  "operational",
  "hosts",
  "projects",
  "providers",
  "inventory",
  "custom",
];
function expectConservation(scene: ObservatoryScene, ids: readonly string[]) {
  const represented = new Set(
    scene.visibleRepresentationIds.flatMap((id) =>
      observatoryMembers(scene, id),
    ),
  );
  expect([...represented].sort()).toEqual([...ids].sort());
  expect(scene.population.canonicalResourceCount).toBe(new Set(ids).size);
  expect(new Set(scene.representations.map((node) => node.id)).size).toBe(
    scene.representations.length,
  );
  expect(
    scene.representations.filter(
      (node) => node.resourceId && !node.referenceTo,
    ),
  ).toHaveLength(ids.length);
}
const representation = (scene: ObservatoryScene, resourceId: string) =>
  scene.representations.find(
    (node) => node.resourceId === resourceId && !node.referenceTo,
  )!;

describe("complete semantic Observatory population", () => {
  it("defines F1 totals independently and preserves zero monitored availability", () => {
    const fixture = mixedObservatoryFixture();
    expect(fixture.resources).toHaveLength(91);
    expect(
      fixture.resources.filter((resource) => resource.kind === "repository"),
    ).toHaveLength(60);
    expect(
      fixture.resources.filter((resource) => resource.kind === "host"),
    ).toHaveLength(18);
    expect(
      fixture.resources.filter((resource) => resource.kind === "service"),
    ).toHaveLength(13);
    expect(fixture.projects).toHaveLength(15);
    expect(
      new Set(
        fixture.resources.flatMap((resource) =>
          resource.projects.map((project) => project.id),
        ),
      ).size,
    ).toBe(15);
    expect(
      fixture.resources.filter(
        (resource) =>
          resource.kind === "repository" && !resource.projects.length,
      ),
    ).toHaveLength(48);
    expect(
      fixture.resources.filter((resource) => resource.projects.length > 1),
    ).toHaveLength(7);
    expect(
      fixture.resources.filter((resource) => resource.sources.length),
    ).toHaveLength(4);
    const scene = projectObservatory(fixture);
    expectConservation(
      scene,
      fixture.resources.map((resource) => resource.id),
    );
    expect(scene.summary.availability).toMatchObject({
      passing: 0,
      failing: 0,
      unknown: 13,
    });
    expect(scene.summary.coverage).toEqual({
      eligible: 13,
      monitored: 0,
      unmonitored: 13,
      stale: 0,
      state: "not_monitored",
    });
    expect(scene.summary.telemetry.counts.reporting).toBe(4);
    expect(scene.sourceObservations).toHaveLength(4);
    expect(scene.capacityObservations).toHaveLength(4);
    expect(scene.sourceObservations[0]?.evidenceRefs).toContain(
      scene.capacityObservations[0]?.evidenceRef,
    );
    expect(scene.sourceObservations[0]?.observedAt).toBe(
      "2026-10-16T12:00:00.000Z",
    );
    expect(scene.summary.capacity.counts).toEqual({ unknown: 91 });
    expect(scene.summary.security.counts.unsupported).toBe(91);
    const roots = scene.rootRepresentationIds.map((id) =>
      scene.representations.find((node) => node.id === id)!,
    );
    expect(roots.filter((node) => node.kind === "host")).toHaveLength(4);
    expect(roots.some((node) => node.kind === "repository")).toBe(false);
    expect(
      roots.find((node) => node.label === "Repositories")?.memberCount,
    ).toBe(60);
  });

  it.each(groupings)(
    "conserves every identity and its containment under %s, expansion and input reversal",
    (grouping) => {
      const fixture = mixedObservatoryFixture();
      const input = {
        ...fixture,
        grouping,
        sectors: [
          {
            id: "hosts",
            label: "Machines",
            resourceIds: fixture.resources
              .filter((resource) => resource.kind !== "repository")
              .map((resource) => resource.id),
            grouping: "hosts" as const,
          },
          {
            id: "code",
            label: "Code",
            resourceIds: fixture.resources
              .filter((resource) => resource.kind === "repository")
              .map((resource) => resource.id),
            grouping: "projects" as const,
          },
        ],
      };
      const baseline = JSON.stringify(fixture);
      const collapsed = projectObservatory(input);
      const expanded = projectObservatory({
        ...input,
        expandedRepresentationIds: collapsed.representations.map(
          (node) => node.id,
        ),
      });
      const reversed = projectObservatory({
        ...input,
        resources: [...fixture.resources].reverse().map((resource) => ({
          ...resource,
          projects: [...resource.projects].reverse(),
        })),
      });
      expectConservation(
        collapsed,
        fixture.resources.map((resource) => resource.id),
      );
      expectConservation(
        expanded,
        fixture.resources.map((resource) => resource.id),
      );
      expect(collapsed.containment).toEqual(
        projectObservatory(fixture).containment,
      );
      expect(reversed).toEqual(collapsed);
      expect(expanded.population).toEqual(collapsed.population);
      expect(expanded.projectionRevision).toBe(collapsed.projectionRevision);
      expect(JSON.stringify(fixture)).toBe(baseline);
      for (const resource of fixture.resources.filter(
        (resource) => resource.projects.length > 1,
      )) {
        const aliases = collapsed.representations.filter(
          (node) => node.resourceId === resource.id && node.referenceTo,
        );
        expect(aliases.length).toBeGreaterThanOrEqual(resource.projects.length);
        for (const alias of aliases)
          expect(observatoryMembers(collapsed, alias.id)).toEqual([
            resource.id,
          ]);
      }
    },
  );

  it("does not select the first UUID as a shared resource's primary project", () => {
    const fixture = mixedObservatoryFixture();
    const resource = fixture.resources.find(
      (item) => item.projects.length > 1,
    )!;
    const scene = projectObservatory({ ...fixture, grouping: "projects" });
    const canonical = representation(scene, resource.id);
    expect(
      scene.representations.find(
        (node) => node.id === canonical.parentRepresentationId,
      )?.label,
    ).toBe("Shared resources");
    expect(canonical.projects).toHaveLength(2);
    const nested = fixture.resources.find(
      (item) => item.kind === "host" && item.parentResourceId,
    )!;
    expect(representation(scene, nested.id).kind).toBe("host");
    expect(
      scene.containment.find((item) => item.resourceId === nested.id)
        ?.parentResourceId,
    ).toBe(nested.parentResourceId);
  });

  it("reveals every collapsed unmapped repository and restores the same grouping on clear", () => {
    const fixture = mixedObservatoryFixture();
    const initial = projectObservatory(fixture);
    for (const resource of fixture.resources.filter(
      (item) => item.kind === "repository" && !item.projects.length,
    )) {
      expect(initial.visibleRepresentationIds).not.toContain(
        `resource:${resource.id}`,
      );
      const searched = projectObservatory({ ...fixture, search: resource.id });
      expect(searched.searchResults).toHaveLength(1);
      expect(searched.searchResults[0]?.resourceId).toBe(resource.id);
      expect(searched.visibleRepresentationIds).toContain(
        `resource:${resource.id}`,
      );
      expectConservation(
        searched,
        fixture.resources.map((item) => item.id),
      );
    }
    expect(projectObservatory({ ...fixture, search: "" })).toEqual(initial);
    expect(searchObservatory(initial, "does not exist")).toEqual([]);
  });

  it("keeps layout identities and structural revision stable across labels and observations", () => {
    const fixture = mixedObservatoryFixture();
    const before = projectObservatory(fixture);
    const after = projectObservatory({
      ...fixture,
      now: "2026-10-16T13:00:00.000Z",
      resources: fixture.resources.map((resource) => ({
        ...resource,
        name: `${resource.name} renamed`,
        telemetry: "stale",
      })),
    });
    expect(after.projectionRevision).toBe(before.projectionRevision);
    expect(
      after.representations.map((node) => [
        node.id,
        node.layoutKey,
        node.parentRepresentationId,
      ]),
    ).toEqual(
      before.representations.map((node) => [
        node.id,
        node.layoutKey,
        node.parentRepresentationId,
      ]),
    );
    expect(after.summary.telemetry.counts.stale).toBe(4);
  });

  it("does not infer a deployment or operated role from names, co-membership or telemetry badges", () => {
    const host = {
      ...observatoryFixtureResource(90001, "host"),
      name: "Production server workers.example.com",
      telemetry: "reporting" as const,
    };
    const repository = {
      ...observatoryFixtureResource(90002, "repository"),
      name: "Production server workers.example.com",
    };
    const scene = projectObservatory(
      observatoryFixtureInput([host, repository]),
    );
    expect(scene.relations).toEqual([]);
    expect(scene.providerExposures).toEqual([]);
    expect(
      scene.representations.find(
        (node) =>
          node.id === representation(scene, host.id).parentRepresentationId,
      )?.label,
    ).toBe("Other infrastructure");
    const pinned = projectObservatory({
      ...observatoryFixtureInput([host]),
      metadata: [
        {
          resourceId: host.id,
          role: "unknown",
          pinned: true,
          environment: null,
          provenance: observatoryFixtureProvenance,
        },
      ],
    });
    expect(representation(pinned, host.id).parentRepresentationId).toBeNull();
    expect(pinned.summary.coverage.monitored).toBe(0);
  });

  it.each(groupings)(
    "handles a 1000-resource mixed deep/wide/cyclic/orphan shape in %s",
    (grouping) => {
      const fixture = scaleObservatoryFixture();
      const scene = projectObservatory({ ...fixture, grouping });
      expect(scene.population.canonicalResourceCount).toBe(1000);
      expectConservation(
        scene,
        fixture.resources.map((resource) => resource.id),
      );
      expect(
        scene.containment.filter((item) => item.state === "cycle"),
      ).toHaveLength(2);
      expect(
        scene.containment.filter((item) => item.state === "missing"),
      ).toHaveLength(1);
      expect(scene.relations).toHaveLength(2);
      expect(searchObservatory(scene, "complete search token")).toHaveLength(1);
      expect(
        searchObservatory(scene, "Synthetic duplicate name").length,
      ).toBeGreaterThan(1);
      const directCount = Object.values(
        scene.membershipIndex.directMembers,
      ).reduce((sum, ids) => sum + ids.length, 0);
      expect(directCount).toBe(1000);
      if (grouping === "inventory")
        expect(scene.representations).toHaveLength(1000);
    },
  );

  it("handles empty input and overlapping custom sectors with one canonical identity", () => {
    const resource = observatoryFixtureResource(90003, "host");
    const scene = projectObservatory({
      ...observatoryFixtureInput([resource]),
      grouping: "custom",
      sectors: ["shared", "unassigned"].map((id) => ({
        id,
        label: id,
        grouping: "inventory",
        resourceIds: [resource.id, resource.id],
      })),
    });
    expectConservation(scene, [resource.id]);
    expect(
      scene.representations.filter((node) => node.referenceTo),
    ).toHaveLength(2);
    const empty = projectObservatory(scaleObservatoryFixture(0));
    expectConservation(empty, []);
    expect(empty.rootRepresentationIds).toEqual([]);
    expect(empty.summary.coverage.state).toBe("not_monitored");
  });
});

describe("scope-bound membership and explicitly authorized inputs", () => {
  it("rejects a partial, aborted or inconsistent population instead of publishing a partial scene", () => {
    const fixture = mixedObservatoryFixture();
    expect(() =>
      projectObservatory({
        ...fixture,
        resources: fixture.resources.slice(0, 90),
      }),
    ).toThrow(/incomplete or inconsistent/);
    expect(() =>
      projectObservatory({
        ...fixture,
        collection: { complete: false as true, resourceCount: 91 },
      }),
    ).toThrow(/incomplete or inconsistent/);
    expect(() =>
      projectObservatory({
        ...fixture,
        collection: { complete: true, resourceCount: 92 },
      }),
    ).toThrow(/incomplete or inconsistent/);
  });

  it("follows every continuation and rejects scope, group, revision and malformed cursors", () => {
    const fixture = mixedObservatoryFixture();
    const scene = projectObservatory(fixture);
    const collection = scene.representations.find(
      (node) => node.label === "Repositories",
    )!;
    const request = { ...collection.expansionRef, limit: 7 };
    const ids: string[] = [];
    let page = readObservatoryMembers(scene, request);
    const firstCursor = page.nextCursor!;
    while (true) {
      expect(page.total).toBe(60);
      expect(page.digest).toBe(collection.memberDigest);
      ids.push(...page.items.map((item) => item.resourceId));
      if (!page.nextCursor) break;
      expect(page.completeness).toBe("partial");
      page = readObservatoryMembers(scene, {
        ...request,
        cursor: page.nextCursor,
      });
    }
    expect(page.completeness).toBe("complete");
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    for (const override of [
      { scopeDigest: "another-scope" },
      { projectionRevision: "another-revision" },
      { groupId: scene.rootRepresentationIds[0]! },
      { cursor: "malformed" },
      { limit: 0 },
      { cursor: firstCursor.replace(/\d+$/, "999999") },
    ])
      expect(() =>
        readObservatoryMembers(scene, {
          ...request,
          cursor: firstCursor,
          ...override,
        }),
      ).toThrow();
    const refreshed = projectObservatory({
      ...fixture,
      viewRevision: "fixture:view:2",
    });
    expect(() =>
      readObservatoryMembers(refreshed, { ...request, cursor: firstCursor }),
    ).toThrow(/revision/);
    expect(() =>
      readObservatoryMembers(scene, { ...request, groupId: "unknown" }),
    ).toThrow();
  });

  it("does not traverse or count absent parents, endpoints, evidence, providers or shared identities", () => {
    const fixture = operationalObservatoryFixture();
    const service = fixture.services[0]!;
    const scene = projectObservatory({
      ...fixture,
      resources: [service],
      collection: { complete: true, resourceCount: 1 },
      scopeDigest: "fixture:resource-only",
    });
    expectConservation(scene, [service.id]);
    expect(scene.containment).toEqual([
      { resourceId: service.id, parentResourceId: null, state: "missing" },
    ]);
    expect(scene.relations).toEqual([]);
    expect(scene.providerExposures).toEqual([]);
    expect(
      scene.signals.every((signal) => signal.resourceId === service.id),
    ).toBe(true);
    expect(JSON.stringify(scene)).not.toContain(fixture.hosts[0]!.id);
    expect(scene.summary.coverage.eligible).toBe(1);
    const revoked = projectObservatory({
      ...fixture,
      resources: [],
      collection: { complete: true, resourceCount: 0 },
      scopeDigest: "fixture:revoked",
    });
    expectConservation(revoked, []);
    expect(revoked.signals).toEqual([]);
    expect(revoked.summary.incidentIds).toEqual([]);
  });

  it("keeps denied security and work independent of readable availability", () => {
    const fixture = operationalObservatoryFixture();
    const repository = fixture.repositories[0]!;
    const scene = projectObservatory({
      ...fixture,
      facetAccess: [
        { resourceId: repository.id, facet: "security", state: "inaccessible" },
        { resourceId: repository.id, facet: "work", state: "inaccessible" },
      ],
      signals: fixture.signals.filter(
        (signal) => signal.facet !== "security" && signal.facet !== "work",
      ),
    });
    expect(
      representation(scene, repository.id).summary.security.counts,
    ).toEqual({ inaccessible: 1 });
    expect(representation(scene, repository.id).summary.work.counts).toEqual({
      inaccessible: 1,
    });
    expect(scene.summary.availability.passing).toBe(4);
    expect(scene.summary.availability.failing).toBe(2);
  });
});

describe("independent operational evidence", () => {
  it("does not use a development observation or maintenance label to pass a production requirement", () => {
    const resource = observatoryFixtureResource(90007);
    const production = observatoryFixtureSignal(
      resource.id,
      "production",
      "passing",
      "production",
    );
    const development = observatoryFixtureSignal(
      resource.id,
      "development",
      "failing",
      "development",
    );
    const input: ObservatoryInput = {
      ...observatoryFixtureInput([resource]),
      requirements: [
        {
          id: "production-required",
          resourceId: resource.id,
          role: "required",
          environment: "production",
        },
      ],
      signals: [production, development],
    };
    expect(reduceObservatoryFacets(input).availability).toMatchObject({
      passing: 1,
      failing: 0,
      confirmedImpact: false,
    });
    expect(
      reduceObservatoryFacets({
        ...input,
        signals: [
          observatoryFixtureSignal(
            resource.id,
            "development-passing",
            "passing",
            "development",
          ),
        ],
      }).coverage,
    ).toMatchObject({ monitored: 0, unmonitored: 1 });
    const maintenance: ObservatorySignal = {
      ...development,
      id: "development-maintenance",
      facet: "lifecycle",
      state: "maintenance",
    };
    expect(
      reduceObservatoryFacets({ ...input, signals: [production, maintenance] })
        .availability.passing,
    ).toBe(1);
    const twoEnvironments = {
      ...input,
      requirements: [
        ...input.requirements!,
        {
          id: "development-required",
          resourceId: resource.id,
          role: "optional" as const,
          environment: "development",
        },
      ],
    };
    expect(() => reduceObservatoryFacets(twoEnvironments)).toThrow(
      /Select an environment/,
    );
    expect(
      reduceObservatoryFacets({
        ...twoEnvironments,
        environment: "development",
      }).availability,
    ).toMatchObject({ failing: 1, confirmedImpact: false });
  });

  it("reports four passing, one required failing and one unmonitored requirement exactly", () => {
    const fixture = operationalObservatoryFixture();
    expect(fixture.resources).toHaveLength(18);
    const scene = projectObservatory({ ...fixture, environment: "production" });
    expect(scene.summary.availability).toMatchObject({
      passing: 4,
      failing: 1,
      unknown: 1,
      confirmedImpact: true,
      required: { passing: 4, failing: 1, unknown: 1 },
      optional: { failing: 0 },
    });
    expect(scene.summary.coverage).toEqual({
      eligible: 6,
      monitored: 5,
      unmonitored: 1,
      stale: 0,
      state: "incomplete",
    });
    expect(scene.summary.capacity.counts.pressure).toBe(1);
    expect(scene.summary.security.counts.zero_findings).toBe(1);
    expect(scene.summary.security.counts).not.toHaveProperty("uncompromised");
    expect(scene.summary.work.counts.waiting_approval).toBe(1);
    expect(
      scene.providerExposures.map((item) => item.classification).sort(),
    ).toEqual(["confirmed_local_impact", "potential_exposure"]);
    expect(scene.summary.provider.counts.potential_exposure).toBe(1);
    expect(scene.summary.provider.counts.confirmed_local_impact).toBe(1);
    const all = projectObservatory(fixture);
    expect(all.summary.availability.optional.failing).toBe(1);
    expect(all.summary.incidentIds).toHaveLength(2);
    const database = fixture.services[4]!;
    const inherited = representation(all, fixture.hosts[0]!.id).summary;
    expect(inherited.incidentIds).toContain(
      "fixture:incident:fixture:database-failure",
    );
    expect(
      inherited.incidentIds.filter(
        (id) => id === "fixture:incident:fixture:database-failure",
      ),
    ).toHaveLength(1);
    expect(
      all.representations.filter(
        (node) => node.resourceId === database.id && node.referenceTo,
      ),
    ).toHaveLength(2);
    expect(representation(all, database.id).parentRepresentationId).toBe(
      `resource:${fixture.hosts[0]!.id}`,
    );
  });

  it("never promotes passing observed subsets to complete, or optional development failure to required impact", () => {
    const fixture = operationalObservatoryFixture();
    const passing = {
      ...fixture,
      signals: fixture.signals.filter(
        (signal) =>
          signal.facet !== "availability" || signal.state === "passing",
      ),
    };
    expect(
      reduceObservatoryFacets({ ...passing, environment: "production" })
        .coverage,
    ).toMatchObject({
      eligible: 6,
      monitored: 4,
      unmonitored: 2,
      state: "incomplete",
    });
    const development = reduceObservatoryFacets({
      ...fixture,
      environment: "development",
    });
    expect(development.availability).toMatchObject({
      failing: 1,
      confirmedImpact: false,
      optional: { failing: 1 },
      required: { failing: 0 },
    });
  });

  it("uses observation expiry, preserves conflicting failure evidence, and keeps incident identity", () => {
    const resource = observatoryFixtureResource(90004);
    const fail = observatoryFixtureSignal(resource.id, "failure", "failing");
    const pass = observatoryFixtureSignal(resource.id, "pass", "passing");
    const input = {
      ...observatoryFixtureInput([resource]),
      signals: [fail, pass],
      requirements: [
        {
          id: "required",
          resourceId: resource.id,
          role: "required" as const,
          environment: "production",
        },
      ],
    };
    const current = projectObservatory(input);
    expect(current.summary.availability).toMatchObject({
      passing: 0,
      failing: 1,
      confirmedImpact: true,
    });
    expect(current.signals).toHaveLength(2);
    expect(current.signals.flatMap((signal) => signal.evidenceRefs)).toContain(
      "fixture:observation:pass",
    );
    const expired = projectObservatory({
      ...input,
      readStartedAt: "2026-10-16T13:00:00Z",
      readCompletedAt: "2026-10-16T13:00:01Z",
      now: "2026-10-16T13:00:02Z",
    });
    expect(expired.summary.availability).toMatchObject({
      passing: 0,
      failing: 0,
      unknown: 1,
      confirmedImpact: false,
    });
    expect(expired.summary.coverage).toMatchObject({
      monitored: 0,
      stale: 1,
      state: "not_monitored",
    });
    expect(
      expired.signals.every((signal) => signal.freshness === "stale"),
    ).toBe(true);
    expect(expired.projectionRevision).toBe(current.projectionRevision);
    expect(
      observatoryFreshness(
        fail.observedAt,
        fail.freshnessMs,
        "2026-10-16T12:05:00Z",
      ),
    ).toBe("stale");
    expect(
      observatoryFreshness(
        fail.observedAt,
        fail.freshnessMs,
        "2026-10-16T11:59:59Z",
      ),
    ).toBe("future");
  });

  it.each(["maintenance", "retired", "stopped"] as const)(
    "retains explicit %s lifecycle without turning a failure healthy",
    (state) => {
      const resource = observatoryFixtureResource(90005);
      const pass = observatoryFixtureSignal(resource.id, "passing", "passing");
      const lifecycle: ObservatorySignal = {
        ...pass,
        id: "lifecycle",
        facet: "lifecycle",
        state,
      };
      const input = {
        ...observatoryFixtureInput([resource]),
        signals: [pass, lifecycle],
      };
      const summary = reduceObservatoryFacets(input);
      expect(summary.lifecycle.counts[state]).toBe(1);
      expect(summary.availability.maintenance).toBe(1);
      expect(summary.availability.passing).toBe(0);
      const failing = reduceObservatoryFacets({
        ...input,
        signals: [
          ...input.signals,
          observatoryFixtureSignal(resource.id, "failure", "failing"),
        ],
      });
      expect(failing.availability.failing).toBe(1);
      expect(failing.lifecycle.counts[state]).toBe(1);
    },
  );

  it("distinguishes scanner missing, inaccessible, disabled, unavailable, expired and zero results", () => {
    const repository = observatoryFixtureResource(90006, "repository");
    const base = observatoryFixtureInput([repository]);
    expect(reduceObservatoryFacets(base).security.counts).toEqual({
      unsupported: 1,
    });
    for (const state of ["inaccessible", "disabled", "unavailable"] as const)
      expect(
        reduceObservatoryFacets({
          ...base,
          facetAccess: [
            { resourceId: repository.id, facet: "security", state },
          ],
        }).security.counts,
      ).toEqual({ [state]: 1 });
    const signal: ObservatorySignal = {
      ...observatoryFixtureSignal(repository.id, "scan", "unknown"),
      facet: "security",
      state: "zero_findings",
    };
    const input: ObservatoryInput = {
      ...base,
      signals: [signal],
      facetAccess: [
        { resourceId: repository.id, facet: "security", state: "available" },
      ],
    };
    expect(reduceObservatoryFacets(input).security.counts).toEqual({
      zero_findings: 1,
    });
    expect(
      reduceObservatoryFacets({ ...input, now: "2026-10-16T12:06:00Z" })
        .security.counts,
    ).toEqual({ stale: 1 });
    expect(reduceObservatoryFacets(base).work.counts).toEqual({
      unsupported: 1,
    });
  });

  it("rejects conflicting IDs, malformed evidence, invalid timestamps and unreviewed relation endpoints", () => {
    const fixture = operationalObservatoryFixture();
    expect(() =>
      projectObservatory({
        ...fixture,
        resources: [
          ...fixture.resources,
          { ...fixture.resources[0]!, name: "conflicting identity" },
        ],
      }),
    ).toThrow(/Conflicting/);
    expect(() =>
      projectObservatory({
        ...fixture,
        relations: [{ ...fixture.relations[0]!, sourceKind: "host" }],
      }),
    ).toThrow(/kind/);
    expect(() =>
      projectObservatory({
        ...fixture,
        relations: [
          {
            ...fixture.relations[0]!,
            provenance: { ...observatoryFixtureProvenance, evidenceRefs: [] },
          },
        ],
      }),
    ).toThrow(/provenance/);
    expect(() =>
      projectObservatory({
        ...fixture,
        signals: [{ ...fixture.signals[0]!, evidenceRefs: [] }],
      }),
    ).toThrow(/evidence/);
    expect(() => projectObservatory({ ...fixture, now: "not-a-date" })).toThrow(
      /timestamp/,
    );
    expect(() =>
      projectObservatory({
        ...fixture,
        readCompletedAt: "2026-10-16T11:00:00Z",
      }),
    ).toThrow(/predates/);
    expect(() => observatoryFreshness(fixture.now, 0, fixture.now)).toThrow(
      /positive/,
    );
  });
});

describe("provider severity, relevance, local impact and attribution", () => {
  it("requires explicit product, environment, geography and plane matches", () => {
    const fixture = operationalObservatoryFixture();
    const notice = fixture.providerNotices[0]!;
    const dependency = fixture.providerDependencies[0]!;
    const context = { resourceId: dependency.resourceId, now: fixture.now };
    expect(
      evaluateObservatoryProviderExposure(notice, dependency, context),
    ).toMatchObject({
      severity: "major",
      relevance: "matched",
      classification: "potential_exposure",
      localImpact: "unknown",
      causation: "unknown",
      confidence: "reported",
    });
    for (const override of [
      { product: "warp" },
      { environment: "development" },
      { geography: "asia" },
      { plane: "control" as const },
    ]) {
      const result = evaluateObservatoryProviderExposure(
        { ...notice, environment: "production", geography: "eu", ...override },
        dependency,
        context,
      );
      expect(result.relevance).toBe("unrelated");
      expect(result.classification).toBe("advisory");
      expect(result.localImpact).toBe("unknown");
    }
    expect(
      evaluateObservatoryProviderExposure(
        { ...notice, geography: null },
        dependency,
        context,
      ).relevance,
    ).toBe("unknown");
    expect(
      evaluateObservatoryProviderExposure(notice, null, context).classification,
    ).toBe("relevance_unknown");
  });

  it("separates confirmed local failure from a provider cause and respects stale/resolved notices", () => {
    const fixture = operationalObservatoryFixture();
    const notice = fixture.providerNotices[0]!;
    const dependency = fixture.providerDependencies[1]!;
    const context = {
      resourceId: dependency.resourceId,
      now: fixture.now,
      localSignals: fixture.signals,
    };
    const result = evaluateObservatoryProviderExposure(
      notice,
      dependency,
      context,
    );
    expect(result).toMatchObject({
      classification: "confirmed_local_impact",
      localImpact: "confirmed",
      causation: "unknown",
    });
    const attributed = evaluateObservatoryProviderExposure(notice, dependency, {
      ...context,
      attribution: {
        noticeId: notice.id,
        resourceId: dependency.resourceId,
        status: "suspected",
        provenance: observatoryFixtureProvenance,
      },
    });
    expect(attributed.causation).toBe("suspected");
    expect(attributed.localImpact).toBe("confirmed");
    const unobserved = {
      resourceId: dependency.resourceId,
      now: "2026-10-16T13:00:00Z",
    };
    expect(
      evaluateObservatoryProviderExposure(notice, dependency, unobserved),
    ).toMatchObject({
      freshness: "stale",
      classification: "advisory",
      localImpact: "unknown",
    });
    expect(
      evaluateObservatoryProviderExposure(
        { ...notice, status: "resolved" },
        dependency,
        { ...context, localSignals: [] },
      ).classification,
    ).toBe("advisory");
    expect(() =>
      evaluateObservatoryProviderExposure(notice, dependency, {
        ...context,
        attribution: {
          noticeId: "wrong",
          resourceId: dependency.resourceId,
          status: "established",
          provenance: observatoryFixtureProvenance,
        },
      }),
    ).toThrow(/mismatch/);
  });
});
