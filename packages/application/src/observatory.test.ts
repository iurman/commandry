import { describe, expect, it } from "vitest";
import { FoundationError } from "../../domain/src/agent-foundation";
import type { FoundationOperation } from "../../domain/src/agent-foundation";
import type { ObservatoryInput } from "../../domain/src/observatory";
import { createObservatoryReadService } from "./observatory";
import type {
  ObservatoryReadAccess,
  ObservatoryReadPort,
  ObservatoryReadRecords,
} from "./observatory";
import {
  mixedObservatoryFixture,
  operationalObservatoryFixture,
  observatoryFixtureId,
  scaleObservatoryFixture,
} from "../../../tests/fixtures/observatory";

const allOperations: FoundationOperation[] = [
  "observatory.read",
  "observatory.signals.read",
  "observatory.security.read",
  "observatory.providers.read",
  "work.read",
];
const projectId = observatoryFixtureId(80001);
function inProject(input: ObservatoryInput): ObservatoryInput {
  return {
    ...input,
    resources: input.resources.map((resource) => ({
      ...resource,
      projects: [{ id: projectId, name: "Allowed project" }],
    })),
  };
}
function fixture(input: ObservatoryInput = mixedObservatoryFixture()) {
  const state: {
    input: ObservatoryInput;
    access: ObservatoryReadAccess;
    mode: "single" | "none" | "repeat" | "swallowed-repeat";
    portError: Error | undefined;
    afterError: Error | undefined;
    afterRead: (() => void) | undefined;
    afterCallback: ((result: unknown) => void) | undefined;
    now: string;
  } = {
    input,
    access: {
      owner: true,
      projectIds: [],
      resourceIds: null,
      scopeDigest: "fixture:owner",
      operations: [],
      environment: "test",
    },
    mode: "single",
    portError: undefined,
    afterError: undefined,
    afterRead: undefined,
    afterCallback: undefined,
    now: input.now,
  };
  const requests: string[] = [];
  let reads = 0;
  const records: ObservatoryReadRecords = {
    async readObservatory() {
      reads++;
      state.afterRead?.();
      return state.input;
    },
  };
  const port: ObservatoryReadPort<string> = {
    async withRead<T>(
      request: string,
      callback: (
        access: ObservatoryReadAccess,
        records: ObservatoryReadRecords,
      ) => Promise<T>,
    ): Promise<T> {
      requests.push(request);
      if (state.portError) throw state.portError;
      if (state.mode === "none") return {} as T;
      const result = await callback(state.access, records);
      if (state.mode === "repeat") await callback(state.access, records);
      if (state.mode === "swallowed-repeat")
        try {
          await callback(state.access, records);
        } catch {
          /* Corrupt adapter cannot hide repeated callback. */
        }
      state.afterCallback?.(result);
      if (state.afterError) throw state.afterError;
      return result;
    },
  };
  const service = createObservatoryReadService(port, {
    environment: "test",
    now: () => new Date(state.now),
  });
  const scoped = (
    projects: string[],
    operations: FoundationOperation[] = allOperations,
    resourceIds: string[] | null = null,
  ) => {
    state.access = {
      owner: false,
      projectIds: projects,
      resourceIds,
      scopeDigest: "fixture:scoped",
      operations,
      environment: "test",
    };
  };
  return { state, requests, service, scoped, reads: () => reads };
}

describe("shared authorized Observatory reads", () => {
  it("reads F1's entire owner population through the transaction port with truthful evidence", async () => {
    const f = fixture();
    const { scene, facetAccess } = await f.service.scene("owner-request", {});
    expect(f.requests).toEqual(["owner-request"]);
    expect(f.reads()).toBe(1);
    expect(scene.population.canonicalResourceCount).toBe(91);
    expect(scene.sourceObservations).toHaveLength(4);
    expect(scene.capacityObservations).toHaveLength(4);
    expect(scene.summary.coverage).toMatchObject({
      eligible: 13,
      monitored: 0,
      state: "not_monitored",
    });
    expect(scene.summary.work.counts.unsupported).toBe(91);
    expect(facetAccess).toHaveLength(91 * 7);
    expect(
      facetAccess
        .filter((item) => item.facet === "work")
        .every((item) => item.state === "unsupported"),
    ).toBe(true);
  });

  it("intersects requested projects before any counts, aliases, parent references or search", async () => {
    const source = mixedObservatoryFixture();
    const first = source.projects[0]!.id,
      second = source.projects[1]!.id;
    const f = fixture(source);
    f.scoped([first, second]);
    const a = await f.service.scene("client", {
      projectId: first,
      grouping: "projects",
    });
    const expected = source.resources
      .filter((resource) =>
        resource.projects.some((project) => project.id === first),
      )
      .map((resource) => resource.id)
      .sort();
    expect(a.scene.membershipIndex.resourceIds).toEqual(expected);
    expect(a.scene.population.canonicalResourceCount).toBe(3);
    expect(a.scene.representations.filter((node) => node.referenceTo)).toEqual(
      [],
    );
    expect(
      a.scene.representations
        .flatMap((node) => node.projects)
        .every((project) => project.id === first),
    ).toBe(true);
    const denied = source.resources.find(
      (resource) => !expected.includes(resource.id),
    )!;
    const search = await f.service.scene("client", {
      projectId: first,
      search: denied.id,
    });
    expect(search.scene.searchResults).toEqual([]);
    expect(JSON.stringify(a)).not.toContain(denied.id);
    const b = await f.service.scene("client", { projectId: second });
    expect(b.scene.scopeDigest).not.toBe(a.scene.scopeDigest);
  });

  it("restricts a resource-only read without traversing its hidden parent or exposing source totals", async () => {
    const source = mixedObservatoryFixture();
    const project = source.projects[0]!.id;
    const service = source.resources.find(
      (resource) =>
        resource.kind === "service" &&
        resource.projects.some((item) => item.id === project),
    )!;
    const f = fixture(source);
    f.scoped([project], allOperations, [service.id]);
    const result = await f.service.scene("restricted", { projectId: project });
    expect(result.scene.membershipIndex.resourceIds).toEqual([service.id]);
    expect(result.scene.population.canonicalResourceCount).toBe(1);
    expect(result.scene.containment).toEqual([
      { resourceId: service.id, parentResourceId: null, state: "root" },
    ]);
    expect(JSON.stringify(result)).not.toContain(service.parentResourceId);
    f.scoped([project], allOperations, []);
    expect(
      (await f.service.scene("empty-restriction", { projectId: project })).scene
        .population.canonicalResourceCount,
    ).toBe(0);
  });

  it("requires the independent base grant, explicit non-owner project and matching server environment", async () => {
    for (const configure of [
      (f: ReturnType<typeof fixture>) =>
        f.scoped(
          [projectId],
          ["foundation.read", "resources.read", "work.read"],
        ),
      (f: ReturnType<typeof fixture>) =>
        f.scoped([observatoryFixtureId(80002)]),
      (f: ReturnType<typeof fixture>) => {
        f.scoped([projectId]);
        f.state.access.environment = "production";
      },
    ]) {
      const f = fixture(inProject(mixedObservatoryFixture()));
      configure(f);
      await expect(
        f.service.scene("denied", { projectId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.reads()).toBe(0);
    }
    const f = fixture(inProject(mixedObservatoryFixture()));
    f.scoped([projectId]);
    await expect(f.service.scene("global-machine", {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects public authority and unsupported filters before invoking the port", async () => {
    const f = fixture();
    for (const extra of [
      { owner: true },
      { actor: { principalId: "owner" } },
      { operations: allOperations },
      { resourceIds: [] },
      { limit: 1000 },
      { now: f.state.now },
      { schemaVersion: 2 },
    ])
      await expect(f.service.scene("injected", extra)).rejects.toThrow();
    expect(f.requests).toEqual([]);
  });

  it("keeps independently denied facets inaccessible and removes source identities, metrics and errors", async () => {
    const source = inProject(mixedObservatoryFixture());
    const f = fixture(source);
    f.scoped([projectId], ["observatory.read"]);
    const result = await f.service.scene("inventory-only", { projectId });
    expect(result.scene.population.canonicalResourceCount).toBe(91);
    expect(result.scene.sourceObservations).toEqual([]);
    expect(result.scene.capacityObservations).toEqual([]);
    expect(result.scene.signals).toEqual([]);
    expect(result.scene.providerExposures).toEqual([]);
    expect(
      result.facetAccess.every((item) => item.state === "inaccessible"),
    ).toBe(true);
    expect(result.scene.summary.coverage.monitored).toBe(0);
    expect(result.scene.summary.security.counts).toEqual({ inaccessible: 91 });
    expect(result.scene.summary.work.counts).toEqual({ inaccessible: 91 });
    const serialized = JSON.stringify(result);
    for (const resource of source.resources)
      for (const source of resource.sources)
        expect(serialized).not.toContain(source.id);
    for (const resource of source.resources)
      for (const metric of resource.metrics)
        expect(serialized).not.toContain(metric.evidenceHref);
  });

  it("grants security, provider and Work facets independently from monitoring", async () => {
    const rich = operationalObservatoryFixture();
    const f = fixture(inProject(rich));
    f.scoped([projectId], ["observatory.read", "observatory.security.read"]);
    const security = await f.service.scene("security", { projectId });
    expect(security.scene.signals.map((signal) => signal.facet)).toEqual([
      "security",
    ]);
    expect(security.scene.summary.security.counts.zero_findings).toBe(1);
    expect(security.scene.summary.work.counts.inaccessible).toBe(18);
    expect(security.scene.summary.availability.passing).toBe(0);
    f.scoped([projectId], ["observatory.read", "observatory.providers.read"]);
    const provider = await f.service.scene("provider", { projectId });
    expect(provider.scene.providerExposures).toHaveLength(2);
    expect(
      provider.scene.providerExposures.every(
        (item) =>
          item.localImpact === "unknown" &&
          item.classification === "potential_exposure",
      ),
    ).toBe(true);
    expect(JSON.stringify(provider)).not.toContain("fixture:database-failure");
    f.scoped([projectId], ["observatory.read", "work.read"]);
    const work = await f.service.scene("work", { projectId });
    expect(work.scene.summary.work.counts.waiting_approval).toBe(1);
    expect(work.scene.signals.map((signal) => signal.facet)).toEqual(["work"]);
  });

  it("does not invent runtime runs from Work or assignments when runtime coverage is unsupported", async () => {
    const rich = operationalObservatoryFixture();
    const f = fixture({
      ...inProject(rich),
      signals: rich.signals.filter((signal) => signal.facet !== "work"),
      facetAccess: rich.facetAccess.filter((item) => item.facet !== "work"),
    });
    f.scoped([projectId], ["observatory.read", "work.read"]);
    const result = await f.service.scene("work-without-runtime", { projectId });
    expect(result.scene.summary.work.counts).toEqual({ unsupported: 18 });
    expect(result.scene.signals.some((signal) => signal.facet === "work")).toBe(
      false,
    );
    const evidence = await f.service.signalEvidence("work-without-runtime", {
      projectId,
      resourceId: rich.repositories[0]!.id,
      facet: "work",
    });
    expect(evidence).toMatchObject({ access: "unsupported", signals: [] });
  });

  it("filters provider mappings and logical relation endpoints before explaining exposure", async () => {
    const rich = operationalObservatoryFixture();
    const hiddenProvider = rich.providers[0]!.id;
    const candidate = inProject(rich);
    candidate.resources = candidate.resources.map((resource) =>
      resource.id === hiddenProvider
        ? {
            ...resource,
            projects: [
              {
                id: observatoryFixtureId(80002),
                name: "Private provider account",
              },
            ],
          }
        : resource,
    );
    const f = fixture(candidate);
    f.scoped([projectId]);
    const result = await f.service.scene("project", { projectId });
    expect(result.scene.providerExposures).toEqual([]);
    expect(
      result.scene.relations.some(
        (relation) =>
          relation.sourceId === hiddenProvider ||
          relation.targetId === hiddenProvider,
      ),
    ).toBe(false);
    expect(JSON.stringify(result)).not.toContain(hiddenProvider);
    expect(JSON.stringify(result)).not.toContain("Private provider account");
  });

  it("uses the same authorized projection for UI/API/MCP and detail reads without extra fetches", async () => {
    const rich = operationalObservatoryFixture();
    const f = fixture(rich);
    const ui = await f.service.scene("UI", {}),
      api = await f.service.scene("API", {}),
      mcp = await f.service.scene("MCP", {});
    expect(ui).toEqual(api);
    expect(api).toEqual(mcp);
    const relations = await f.service.relations("API", {});
    expect(relations.items).toEqual(ui.scene.relations);
    const resourceId = rich.services[0]!.id;
    const evidence = await f.service.signalEvidence("MCP", {
      resourceId,
      facet: "availability",
      signalId: "fixture:check:0",
    });
    expect(evidence.signals).toEqual(
      ui.scene.signals.filter((signal) => signal.id === "fixture:check:0"),
    );
    const provider = await f.service.providerExplanation("UI", { resourceId });
    expect(provider.items).toEqual(
      ui.scene.providerExposures.filter(
        (item) => item.resourceId === resourceId,
      ),
    );
    expect(f.reads()).toBe(6);
    expect(
      new Set([
        ui.scene.scopeDigest,
        relations.scopeDigest,
        evidence.scopeDigest,
        provider.scopeDigest,
      ]).size,
    ).toBe(1);
  });

  it("requires facet grants for detail evidence and rejects inaccessible/absent subject IDs", async () => {
    const rich = operationalObservatoryFixture();
    const f = fixture(inProject(rich));
    f.scoped([projectId], ["observatory.read"]);
    await expect(
      f.service.signalEvidence("denied", {
        projectId,
        resourceId: rich.services[0]!.id,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.service.providerExplanation("denied", {
        projectId,
        resourceId: rich.services[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.reads()).toBe(0);
    f.scoped([projectId]);
    await expect(
      f.service.signalEvidence("unknown", {
        projectId,
        resourceId: rich.services[0]!.id,
        facet: "availability",
        signalId: "unknown",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await expect(
      f.service.relations("unknown", {
        projectId,
        resourceId: observatoryFixtureId(999999),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await expect(
      f.service.providerExplanation("unknown", {
        projectId,
        resourceId: rich.services[0]!.id,
        noticeId: "unknown",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });

  it("follows every membership continuation and rejects changed scope, population or view revision", async () => {
    const f = fixture();
    const { scene } = await f.service.scene("owner", {});
    const group = scene.representations.find(
      (node) => node.label === "Repositories",
    )!;
    const query = { ...group.expansionRef, limit: 7 };
    const ids: string[] = [];
    let page = await f.service.members("owner", query);
    const cursor = page.nextCursor!;
    while (true) {
      ids.push(...page.items.map((item) => item.resourceId));
      if (!page.nextCursor) break;
      page = await f.service.members("owner", {
        ...query,
        cursor: page.nextCursor,
      });
    }
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    for (const override of [
      { scopeDigest: "another-scope" },
      { projectionRevision: "another-revision" },
      { viewRevision: "2" },
      { cursor: "bad" },
    ])
      await expect(
        f.service.members("owner", { ...query, cursor, ...override }),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    f.state.access.scopeDigest = "new-grant-scope";
    await expect(
      f.service.members("owner", { ...query, cursor }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    f.state.access.scopeDigest = "fixture:owner";
    f.state.input = {
      ...f.state.input,
      resources: f.state.input.resources.slice(1),
      collection: { complete: true, resourceCount: 90 },
    };
    await expect(
      f.service.members("owner", { ...query, cursor }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });

  it("keeps custom sectors and complete 1000-resource reads within the authorized population", async () => {
    const source = scaleObservatoryFixture();
    const f = fixture(source);
    const result = await f.service.scene("scale", {
      grouping: "custom",
      sectors: [
        {
          id: "fleet",
          label: "Fleet",
          resourceIds: source.resources
            .map((resource) => resource.id)
            .concat(observatoryFixtureId(999999)),
          grouping: "hosts",
        },
      ],
    });
    expect(result.scene.population.canonicalResourceCount).toBe(1000);
    expect(result.scene.membershipIndex.resourceIds).toHaveLength(1000);
    expect(result.facetAccess).toHaveLength(7000);
    expect(JSON.stringify(result)).not.toContain(observatoryFixtureId(999999));
    f.state.input = inProject(source);
    f.scoped([projectId], ["observatory.read"]);
    const denied = await f.service.scene("scale-inventory-only", { projectId });
    expect(denied.scene.population.canonicalResourceCount).toBe(1000);
    expect(denied.facetAccess).toHaveLength(7000);
    expect(
      denied.facetAccess.every((item) => item.state === "inaccessible"),
    ).toBe(true);
    expect(denied.scene.summary.telemetry.counts).toEqual({
      inaccessible: 1000,
    });
    expect(denied.scene.signals).toEqual([]);
  });
});

describe("transaction and malformed-result boundaries", () => {
  it("rejects incomplete input, duplicate IDs, invalid evidence, facet states and malformed observations", async () => {
    const source = operationalObservatoryFixture();
    const malformed: ObservatoryInput[] = [
      { ...source, collection: { complete: false as true, resourceCount: 18 } },
      { ...source, collection: { complete: true, resourceCount: 19 } },
      {
        ...source,
        resources: [
          source.resources[0]!,
          ...source.resources.slice(1, -1),
          source.resources[0]!,
        ],
      },
      { ...source, signals: [{ ...source.signals[0]!, evidenceRefs: [] }] },
      {
        ...source,
        signals: [{ ...source.signals[0]!, evidenceRefs: ["   "] }],
      },
      {
        ...source,
        signals: [
          {
            ...source.signals[0]!,
            facet: "unknown-facet",
          } as unknown as NonNullable<ObservatoryInput["signals"]>[number],
        ],
      },
      {
        ...source,
        signals: [{ ...source.signals[0]!, observedAt: "invalid" }],
      },
      { ...source, signals: [source.signals[0]!, source.signals[0]!] },
      {
        ...source,
        relations: [
          {
            ...source.relations[0]!,
            provenance: {
              ...source.relations[0]!.provenance,
              evidenceRefs: [],
            },
          },
        ],
      },
      { ...source, readCompletedAt: "2026-10-16T11:00:00Z" },
    ];
    for (const input of malformed) {
      const f = fixture(input);
      await expect(f.service.scene("malformed", {})).rejects.toMatchObject({
        code: "INVALID_REFERENCE",
      });
    }
    const mixed = mixedObservatoryFixture();
    const badMetric = {
      ...mixed,
      resources: mixed.resources.map((resource) =>
        resource.metrics.length
          ? {
              ...resource,
              metrics: resource.metrics.map((metric) => ({
                ...metric,
                evidenceHref: "javascript:bad",
              })),
            }
          : resource,
      ),
    };
    await expect(
      fixture(badMetric).service.scene("bad-metric", {}),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });

  it("preserves expiry/revocation/audit failures from the real transaction boundary and never caches grants", async () => {
    const f = fixture();
    await f.service.scene("first", {});
    f.state.portError = new FoundationError("REVOKED");
    await expect(f.service.scene("second", {})).rejects.toMatchObject({
      code: "REVOKED",
    });
    expect(f.reads()).toBe(1);
    const expired = fixture();
    expired.state.afterError = new FoundationError("EXPIRED");
    await expect(
      expired.service.scene("expiry-at-commit", {}),
    ).rejects.toMatchObject({ code: "EXPIRED" });
    const audit = fixture();
    audit.state.afterError = new Error("synthetic audit failure");
    await expect(audit.service.scene("audit-failure", {})).rejects.toThrow(
      "synthetic audit failure",
    );
  });

  it("rejects changed authority before projection or after awaited audit/commit", async () => {
    const f = fixture(inProject(mixedObservatoryFixture()));
    f.scoped([projectId]);
    f.state.afterRead = () => {
      f.state.access.operations = [];
    };
    await expect(
      f.service.scene("changed-before-projection", { projectId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const after = fixture();
    after.state.afterCallback = () => {
      after.state.access.owner = false;
    };
    await expect(
      after.service.scene("changed-at-commit", {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects absent/repeated callbacks and callback-output substitution", async () => {
    for (const mode of ["none", "repeat", "swallowed-repeat"] as const) {
      const f = fixture();
      f.state.mode = mode;
      await expect(f.service.scene("corrupt-port", {})).rejects.toMatchObject({
        code: "INVALID_REFERENCE",
      });
    }
    const tampered = fixture();
    tampered.state.afterCallback = (result) => {
      (
        result as { scene: { population: { canonicalResourceCount: number } } }
      ).scene.population.canonicalResourceCount = 1;
    };
    await expect(tampered.service.scene("tampered", {})).rejects.toMatchObject({
      code: "INVALID_REFERENCE",
    });
  });

  it("rejects accessors without executing them and rejects an invalid server clock", async () => {
    const f = fixture();
    let invoked = false;
    const resource = { ...f.state.input.resources[0]! };
    Object.defineProperty(resource, "name", {
      enumerable: true,
      get() {
        invoked = true;
        return "unsafe";
      },
    });
    f.state.input = {
      ...f.state.input,
      resources: [resource, ...f.state.input.resources.slice(1)],
    };
    await expect(f.service.scene("unsafe-record", {})).rejects.toMatchObject({
      code: "INVALID_REFERENCE",
    });
    expect(invoked).toBe(false);
    const clock = fixture();
    clock.state.now = "invalid";
    await expect(
      clock.service.scene("invalid-clock", {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
