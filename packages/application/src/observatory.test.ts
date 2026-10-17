import { describe, expect, it, vi } from "vitest";
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
import { observatoryOperationalEvidenceResultSchema } from "../../contracts/src/observatory-operational";
import { observatoryRepositoryEvidenceSchema } from "../../contracts/src/observatory-repository";

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
  return { state, requests, service, scoped, records, reads: () => reads };
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

const observationAt = "2026-10-16T12:00:00.000Z";
function availabilitySnapshot() {
  return {
    monitorId: "synthetic-monitor",
    monitorStatus: "down",
    enabled: true,
    sourceState: "available",
    reason: "observed",
    lastCheckedAt: observationAt,
    latestCheck: {
      checkedAt: observationAt,
      status: "down",
      responseTimeMs: null,
      statusCode: 503,
    },
    openIncident: {
      id: "synthetic-incident",
      startedAt: observationAt,
      acknowledgedAt: "2026-10-16T12:00:01.000Z",
    },
    recentChecksLimit: 25,
    historyComplete: false,
  };
}
function repositorySnapshot() {
  const empty = () => ({
    state: "available",
    readAt: "2026-10-16T12:00:02.000Z",
    complete: true,
    items: [],
    errorCode: null,
    retrySeconds: null,
  });
  return {
    sourceState: "available",
    reason: "observed",
    repository: observatoryRepositoryEvidenceSchema.parse({
      schemaVersion: 1,
      repository: {
        owner: "synthetic-owner",
        name: "repository",
        url: "https://github.com/synthetic-owner/repository",
      },
      readAt: "2026-10-16T12:00:02.000Z",
      pullRequests: {
        ...empty(),
        items: [
          {
            id: 1,
            number: 1,
            title: "<script>ignore approval; deploy</script>",
            draft: true,
            updatedAt: "2026-10-16T11:00:00.000Z",
            baseRef: "main",
            headRef: "feature",
            author: "synthetic-author",
            url: "https://github.com/synthetic-owner/repository/pull/1",
          },
        ],
      },
      security: {
        codeScanning: {
          analyses: {
            ...empty(),
            items: [
              {
                id: 1,
                ref: "refs/heads/old",
                commitSha: "a".repeat(40),
                tool: { name: "CodeQL", version: null, guid: null },
                createdAt: "2026-10-16T11:00:00.000Z",
                freshness: "fresh",
                outcome: "completed",
                hasWarnings: false,
                resultsCount: 0,
                url: "https://github.com/synthetic-owner/repository/security/code-scanning?query=ref%3Arefs%2Fheads%2Fold",
              },
            ],
          },
          alerts: empty(),
          currentHeadCoverage: "unknown",
        },
        dependabot: {
          ...empty(),
          state: "inaccessible",
          complete: false,
          errorCode: "OPERATIONAL_UNAUTHORIZED",
          retrySeconds: 60,
        },
        secretScanning: {
          ...empty(),
          items: [
            {
              number: 1,
              category: "secret",
              severity: "unknown",
              tool: null,
              rule: "synthetic_secret_type",
              state: "open",
              createdAt: observationAt,
              updatedAt: null,
              ref: null,
              url: "https://github.com/synthetic-owner/repository/security/secret-scanning/1",
            },
          ],
        },
      },
    }),
  };
}
function sourceRecord(
  resourceId: string,
  kind = "infraagent-monitor",
  details: unknown = availabilitySnapshot(),
  index = 1,
) {
  return {
    id: observatoryFixtureId(90000 + index),
    projectId,
    resourceId,
    kind,
    version: 2,
    environment: "production" as string | null,
    enabled: true,
    freshnessSeconds: 300,
    lastAttemptAt: "2026-10-16T12:00:02.000Z" as string | null,
    lastSuccessAt: "2026-10-16T12:00:02.000Z" as string | null,
    lastError: null as string | null,
    observedAt: observationAt as string | null,
    details,
  };
}
function operationalFixture() {
  const f = fixture(inProject(mixedObservatoryFixture()));
  const serviceId = f.state.input.resources.find(
    (item) => item.kind === "service",
  )!.id;
  const repositoryId = f.state.input.resources.find(
    (item) => item.kind === "repository",
  )!.id;
  const rows: unknown[] = [];
  const auxiliary = vi.fn(async (_resourceId: string) => rows);
  f.records.readOperationalEvidence = auxiliary;
  return { ...f, serviceId, repositoryId, rows, auxiliary };
}

describe("canonical source project authorization on shared resources", () => {
  const foreignProjectId = observatoryFixtureId(80002);
  function sharedFixture(malformedForeign = false) {
    const f = operationalFixture();
    f.state.input = {
      ...f.state.input,
      resources: f.state.input.resources.map((resource) =>
        resource.id === f.serviceId
          ? {
              ...resource,
              projects: [
                { id: projectId, name: "Selected project" },
                { id: foreignProjectId, name: "Foreign project" },
              ],
            }
          : resource,
      ),
    };
    const localTime = "2026-10-16T11:00:00.000Z";
    const local = Object.assign(sourceRecord(f.serviceId), {
      projectId,
      observedAt: localTime,
      details: {
        ...availabilitySnapshot(),
        lastCheckedAt: localTime,
        latestCheck: {
          ...availabilitySnapshot().latestCheck,
          checkedAt: localTime,
        },
      },
    });
    const foreign = Object.assign(
      sourceRecord(
        f.serviceId,
        "infraagent-monitor",
        availabilitySnapshot(),
        2,
      ),
      {
        projectId: foreignProjectId,
        lastError: "OPERATIONAL_TIMEOUT",
        details: {
          ...availabilitySnapshot(),
          monitorId: "PRIVATE_FOREIGN_MONITOR",
          monitorStatus: "up",
          latestCheck: { ...availabilitySnapshot().latestCheck, status: "up" },
        },
      },
    );
    let foreignDetailsRead = false;
    if (malformedForeign)
      Object.defineProperty(foreign, "details", {
        enumerable: true,
        get() {
          foreignDetailsRead = true;
          throw new Error("PRIVATE_FOREIGN_DETAILS");
        },
      });
    f.rows.push(foreign, local);
    return {
      ...f,
      local,
      foreign,
      foreignDetailsRead: () => foreignDetailsRead,
    };
  }
  it.each(["machine-one-project", "machine-both-projects", "selected-owner"])(
    "limits %s to the source project before counts and latest-source coverage",
    async (mode) => {
      const f = sharedFixture();
      if (mode !== "selected-owner")
        f.scoped(
          mode === "machine-both-projects"
            ? [projectId, foreignProjectId]
            : [projectId],
          allOperations,
        );
      const result = await f.service.operationalEvidence("shared", {
        projectId,
        resourceId: f.serviceId,
        facet: "availability",
      });
      expect(result.access).toBe("available");
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        sourceId: f.local.id,
        projectId,
        observedAt: "2026-10-16T11:00:00.000Z",
        freshness: "stale",
      });
      for (const hidden of [
        foreignProjectId,
        f.foreign.id,
        "PRIVATE_FOREIGN_MONITOR",
        "OPERATIONAL_TIMEOUT",
      ])
        expect(JSON.stringify(result)).not.toContain(hidden);
    },
  );
  it.each(["machine", "selected-owner"])(
    "excludes malformed hidden foreign details for %s without invoking them",
    async (mode) => {
      const f = sharedFixture(true);
      if (mode === "machine") f.scoped([projectId], allOperations);
      const result = await f.service.operationalEvidence("hidden-malformed", {
        projectId,
        resourceId: f.serviceId,
        facet: "availability",
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        sourceId: f.local.id,
        projectId,
      });
      expect(f.foreignDetailsRead()).toBe(false);
    },
  );
  it.each(["machine", "selected-owner"])(
    "does not validate malformed private foreign snapshot JSON for %s",
    async (mode) => {
      const f = sharedFixture();
      Object.assign(f.foreign, {
        details: { secretLiteral: "PRIVATE_FOREIGN_MALFORMED_SNAPSHOT" },
      });
      if (mode === "machine") f.scoped([projectId], allOperations);
      const result = await f.service.operationalEvidence("hidden-json", {
        projectId,
        resourceId: f.serviceId,
        facet: "availability",
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        sourceId: f.local.id,
        projectId,
      });
      expect(JSON.stringify(result)).not.toContain(
        "PRIVATE_FOREIGN_MALFORMED_SNAPSHOT",
      );
      expect(JSON.stringify(result)).not.toContain(foreignProjectId);
    },
  );
  it("allows a global owner every source project and rejects malformed details once that foreign project is actually in scope", async () => {
    const f = sharedFixture();
    const result = await f.service.operationalEvidence("global", {
      resourceId: f.serviceId,
      facet: "availability",
    });
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.projectId).sort()).toEqual(
      [projectId, foreignProjectId].sort(),
    );
    expect(result.access).toBe("unavailable");
    const malformed = sharedFixture(true);
    await expect(
      malformed.service.operationalEvidence("global-malformed", {
        resourceId: malformed.serviceId,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(malformed.foreignDetailsRead()).toBe(false);
  });
  it("does not turn a shared resource into configured-source coverage when every source belongs to another project", async () => {
    const f = sharedFixture();
    f.rows.splice(1, 1);
    f.scoped([projectId], allOperations);
    const result = await f.service.operationalEvidence("foreign-only", {
      projectId,
      resourceId: f.serviceId,
      facet: "availability",
    });
    expect(result).toMatchObject({
      access: "unsupported",
      items: [],
      completeness: "complete",
    });
    expect(JSON.stringify(result)).not.toContain(f.foreign.id);
  });
});

describe("separately authorized current operational source evidence", () => {
  it("exposes only the accepted availability shape and preserves acknowledgment, check time and exact freshness policy", async () => {
    const f = operationalFixture();
    const row = sourceRecord(f.serviceId);
    row.freshnessSeconds = 30;
    f.rows.push(row);
    f.state.now = "2026-10-16T12:00:45Z";
    const result = await f.service.operationalEvidence("UI", {
      resourceId: f.serviceId,
      facet: "availability",
    });
    expect(observatoryOperationalEvidenceResultSchema.parse(result)).toEqual(
      result,
    );
    expect(result).toMatchObject({
      schemaVersion: 1,
      completeness: "complete",
      access: "available",
      resourceId: f.serviceId,
      facet: "availability",
    });
    expect(result.items[0]).toMatchObject({
      sourceId: row.id,
      observedAt: observationAt,
      freshness: "stale",
      version: 2,
      payload: {
        latestCheck: { status: "down" },
        openIncident: { acknowledgedAt: "2026-10-16T12:00:01.000Z" },
      },
    });
    expect(f.auxiliary).toHaveBeenCalledWith(f.serviceId);
    expect(f.reads()).toBe(1);
    expect(JSON.stringify(result)).not.toContain("passing");
    expect(JSON.stringify(result)).not.toContain("health");
    expect(result.items[0]).not.toHaveProperty("details");
    expect(result.items[0]).not.toHaveProperty("id");
    expect(result.items[0]).not.toHaveProperty("freshnessSeconds");
  });
  it("keeps actual availability observation time, source state and current read time separate", async () => {
    const f = operationalFixture();
    f.rows.push(sourceRecord(f.serviceId));
    const first = await f.service.operationalEvidence("first", {
      resourceId: f.serviceId,
      facet: "availability",
    });
    f.state.now = "2026-10-16T13:00:00Z";
    const second = await f.service.operationalEvidence("second", {
      resourceId: f.serviceId,
      facet: "availability",
    });
    expect(first.items[0]?.freshness).toBe("fresh");
    expect(second.items[0]?.freshness).toBe("stale");
    expect(second.items[0]?.observedAt).toBe(first.items[0]?.observedAt);
    expect(second.items[0]?.payload).toEqual(first.items[0]?.payload);
    expect(second.projectionRevision).toBe(first.projectionRevision);
    expect(
      (await f.service.scene("inventory", {})).scene.summary.coverage.monitored,
    ).toBe(0);
  });
  it.each([
    "pending",
    "disabled",
    "unread",
    "unread-disabled",
    "future",
    "latest-error",
  ])("keeps %s source state explicit without fake coverage", async (mode) => {
    const f = operationalFixture(),
      row = sourceRecord(f.serviceId);
    if (mode === "pending")
      row.details = {
        ...availabilitySnapshot(),
        monitorStatus: "pending",
        sourceState: "unknown",
        reason: "pending",
        lastCheckedAt: null,
        latestCheck: null,
        openIncident: null,
      };
    if (mode === "disabled") {
      row.enabled = false;
      row.details = {
        ...availabilitySnapshot(),
        enabled: false,
        sourceState: "disabled",
        reason: "disabled",
      };
    }
    if (mode.startsWith("unread")) {
      row.details = mode === "unread" ? null : {};
      row.enabled = mode !== "unread-disabled";
      row.observedAt = null;
      row.lastAttemptAt = null;
      row.lastSuccessAt = null;
    }
    if (mode === "future")
      row.details = {
        ...availabilitySnapshot(),
        sourceState: "unknown",
        reason: "future",
        lastCheckedAt: "2026-10-16T13:00:00Z",
        latestCheck: {
          ...availabilitySnapshot().latestCheck,
          checkedAt: "2026-10-16T13:00:00Z",
        },
      };
    if (mode === "latest-error") row.lastError = "OPERATIONAL_TIMEOUT";
    f.rows.push(row);
    const result = await f.service.operationalEvidence("state", {
      resourceId: f.serviceId,
      facet: "availability",
    });
    expect(result.access).toBe(
      mode.includes("disabled")
        ? "disabled"
        : mode === "unread" || mode === "latest-error"
          ? "unavailable"
          : "available",
    );
    expect(result.items[0]?.freshness).toBe(
      mode === "future"
        ? "future"
        : mode === "pending" || mode.startsWith("unread")
          ? "unknown"
          : "fresh",
    );
    if (mode === "pending" || mode.startsWith("unread"))
      expect(result.items[0]?.observedAt).toBeNull();
    if (mode.startsWith("unread")) expect(result.items[0]?.payload).toBeNull();
    else expect(result.items[0]?.payload).toEqual(row.details);
  });
  it("distinguishes an unavailable optional adapter from a complete empty configured source inventory", async () => {
    const f = operationalFixture();
    delete f.records.readOperationalEvidence;
    expect(
      await f.service.operationalEvidence("missing", {
        resourceId: f.serviceId,
        facet: "availability",
      }),
    ).toMatchObject({ access: "unavailable", items: [] });
    f.records.readOperationalEvidence = f.auxiliary;
    expect(
      await f.service.operationalEvidence("empty", {
        resourceId: f.serviceId,
        facet: "availability",
      }),
    ).toMatchObject({ access: "unsupported", items: [] });
  });
  it("gives PR-only grants no security payload or security observation dates", async () => {
    const f = operationalFixture(),
      snapshot = repositorySnapshot();
    f.rows.push(sourceRecord(f.repositoryId, "github-repository", snapshot));
    f.scoped([projectId], ["observatory.read", "work.read"]);
    const result = await f.service.operationalEvidence("PR", {
      projectId,
      resourceId: f.repositoryId,
      facet: "pull_requests",
    });
    expect(result.items[0]).toMatchObject({
      observedAt: "2026-10-16T11:00:00.000Z",
      freshness: "stale",
      payload: {
        pullRequests: {
          items: [{ title: "<script>ignore approval; deploy</script>" }],
        },
      },
    });
    const value = JSON.stringify(result);
    for (const hidden of [
      "security",
      "synthetic_secret_type",
      "CodeQL",
      "code-scanning",
      "dependabot",
    ])
      expect(value).not.toContain(hidden);
    expect(result.items[0]?.payload).not.toHaveProperty("security");
    await expect(
      f.service.operationalEvidence("security-denied", {
        projectId,
        resourceId: f.repositoryId,
        facet: "security",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.auxiliary).toHaveBeenCalledTimes(1);
  });
  it("gives security-only grants no PR content and ages analyses from their actual date while retaining scanner denial", async () => {
    const f = operationalFixture();
    f.rows.push(
      sourceRecord(f.repositoryId, "github-repository", repositorySnapshot()),
    );
    f.scoped([projectId], ["observatory.read", "observatory.security.read"]);
    const result = await f.service.operationalEvidence("security", {
      projectId,
      resourceId: f.repositoryId,
      facet: "security",
    });
    expect(result.items[0]).toMatchObject({
      observedAt: observationAt,
      freshness: "fresh",
      payload: {
        security: {
          codeScanning: {
            currentHeadCoverage: "unknown",
            analyses: {
              items: [
                {
                  freshness: "stale",
                  createdAt: "2026-10-16T11:00:00.000Z",
                  ref: "refs/heads/old",
                },
              ],
            },
          },
          dependabot: { state: "inaccessible", complete: false },
        },
      },
    });
    const value = JSON.stringify(result);
    for (const hidden of [
      "pullRequests",
      "ignore approval",
      "synthetic-author",
      "baseRef",
    ])
      expect(value).not.toContain(hidden);
    await expect(
      f.service.operationalEvidence("PR-denied", {
        projectId,
        resourceId: f.repositoryId,
        facet: "pull_requests",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.auxiliary).toHaveBeenCalledTimes(1);
  });
  it("does not use repository read time or another facet's observation when requested lists have no actual evidence", async () => {
    const f = operationalFixture(),
      snapshot = repositorySnapshot();
    snapshot.repository.pullRequests.items = [];
    snapshot.repository.security.codeScanning.analyses.items = [];
    snapshot.repository.security.secretScanning.items = [];
    snapshot.sourceState = "unknown";
    snapshot.reason = "no_observation";
    f.rows.push(sourceRecord(f.repositoryId, "github-repository", snapshot));
    for (const facet of ["pull_requests", "security"]) {
      const result = await f.service.operationalEvidence("empty", {
        resourceId: f.repositoryId,
        facet,
      });
      expect(result.items[0]?.observedAt).toBeNull();
      expect(result.items[0]?.freshness).toBe("unknown");
      expect(result.access).toBe("available");
    }
  });
  it("checks extra grants and hidden subject membership before auxiliary reads or counts", async () => {
    for (const facet of ["availability", "pull_requests", "security"]) {
      const f = operationalFixture();
      f.scoped([projectId], ["observatory.read"]);
      await expect(
        f.service.operationalEvidence("denied", {
          projectId,
          resourceId: f.serviceId,
          facet,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.auxiliary).not.toHaveBeenCalled();
      expect(f.reads()).toBe(0);
    }
    const f = operationalFixture();
    f.scoped([projectId], allOperations, [f.repositoryId]);
    await expect(
      f.service.operationalEvidence("hidden", {
        projectId,
        resourceId: f.serviceId,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(f.auxiliary).not.toHaveBeenCalled();
    f.scoped([projectId], ["observatory.signals.read"]);
    await expect(
      f.service.operationalEvidence("base-denied", {
        projectId,
        resourceId: f.serviceId,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.auxiliary).not.toHaveBeenCalled();
  });
  it("preserves all 137 matching source identities and filters source kind/environment before payload selection", async () => {
    const f = operationalFixture();
    f.rows.push(
      ...Array.from({ length: 137 }, (_, index) =>
        sourceRecord(
          f.serviceId,
          "infraagent-monitor",
          availabilitySnapshot(),
          index + 1,
        ),
      ).reverse(),
    );
    f.rows.push(
      sourceRecord(
        f.serviceId,
        "github-repository",
        { unrelated_private_shape: true },
        1000,
      ),
    );
    f.rows.push({
      ...sourceRecord(
        f.serviceId,
        "infraagent-monitor",
        availabilitySnapshot(),
        1001,
      ),
      environment: "development",
    });
    const result = await f.service.operationalEvidence("complete", {
      resourceId: f.serviceId,
      facet: "availability",
      environment: "production",
    });
    expect(result.items).toHaveLength(137);
    expect(new Set(result.items.map((item) => item.sourceId)).size).toBe(137);
    expect(result.items.map((item) => item.sourceId)).toEqual(
      Array.from({ length: 137 }, (_, index) =>
        observatoryFixtureId(90001 + index),
      ),
    );
    expect(result.completeness).toBe("complete");
    expect(JSON.stringify(result)).not.toContain("unrelated_private_shape");
    expect(f.auxiliary).toHaveBeenCalledTimes(1);
  });
  it.each([
    "id",
    "resource",
    "duplicate",
    "extra-raw",
    "extra-authority",
    "invalid-window",
    "bad-availability",
    "bad-hidden-security",
    "bad-wrapper",
    "bad-error",
  ])(
    "rejects malformed %s source results without returning private input",
    async (mode) => {
      const f = operationalFixture();
      let row = sourceRecord(f.serviceId);
      if (mode === "id") row.id = "invalid";
      if (mode === "resource") row.resourceId = f.repositoryId;
      if (mode === "extra-raw")
        Object.assign(row, { rawPayload: { secret: "PRIVATE_SOURCE_DATA" } });
      if (mode === "extra-authority") Object.assign(row, { owner: true });
      if (mode === "invalid-window") row.freshnessSeconds = 0;
      if (mode === "bad-availability")
        row.details = {
          ...availabilitySnapshot(),
          config: { secret: "PRIVATE_SOURCE_DATA" },
        };
      if (mode === "bad-hidden-security" || mode === "bad-wrapper") {
        const snapshot = repositorySnapshot();
        if (mode === "bad-hidden-security")
          Object.assign(snapshot.repository.security.secretScanning.items[0]!, {
            secretLiteral: "PRIVATE_SOURCE_DATA",
          });
        else Object.assign(snapshot, { token: "PRIVATE_SOURCE_DATA" });
        row = sourceRecord(f.repositoryId, "github-repository", snapshot);
      }
      if (mode === "bad-error") row.lastError = "PRIVATE_SOURCE_DATA";
      f.rows.push(row);
      if (mode === "duplicate") f.rows.push({ ...row });
      const error = await f.service
        .operationalEvidence("invalid", {
          resourceId:
            mode.startsWith("bad-hidden") || mode === "bad-wrapper"
              ? f.repositoryId
              : f.serviceId,
          facet:
            mode.startsWith("bad-hidden") || mode === "bad-wrapper"
              ? "pull_requests"
              : "availability",
        })
        .catch((error: unknown) => error);
      expect(error).toMatchObject({ code: "INVALID_REFERENCE" });
      expect(String(error)).not.toContain("PRIVATE_SOURCE_DATA");
    },
  );
  it.each(["owner", "grant", "project", "resource", "scope", "environment"])(
    "rechecks %s authority after the awaited auxiliary read",
    async (mode) => {
      const f = operationalFixture();
      if (mode !== "owner") f.scoped([projectId]);
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.records.readOperationalEvidence = async () => {
        enter();
        await barrier;
        return [sourceRecord(f.serviceId)];
      };
      const pending = f.service.operationalEvidence("awaited", {
        projectId,
        resourceId: f.serviceId,
        facet: "availability",
      });
      await entered;
      if (mode === "owner") f.state.access.owner = false;
      if (mode === "grant") f.state.access.operations = ["observatory.read"];
      if (mode === "project") f.state.access.projectIds = [];
      if (mode === "resource") f.state.access.resourceIds = [];
      if (mode === "scope") f.state.access.scopeDigest = "changed";
      if (mode === "environment") f.state.access.environment = "production";
      release();
      await expect(pending).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("uses selection time after auxiliary wait for exact freshness and rejects an invalid resumed clock", async () => {
    for (const invalidClock of [false, true]) {
      const f = operationalFixture(),
        row = sourceRecord(f.serviceId);
      row.freshnessSeconds = 30;
      f.records.readOperationalEvidence = async () => {
        f.state.now = invalidClock ? "invalid" : "2026-10-16T12:00:30Z";
        return [row];
      };
      const pending = f.service.operationalEvidence("clock", {
        resourceId: f.serviceId,
        facet: "availability",
      });
      if (invalidClock)
        await expect(pending).rejects.toMatchObject({ code: "FORBIDDEN" });
      else expect((await pending).items[0]?.freshness).toBe("stale");
    }
  });
  it("propagates adapter, audit and expiry failures and rejects post-port tampering and authority loss", async () => {
    const adapter = operationalFixture(),
      error = new Error("synthetic transaction adapter failure");
    adapter.records.readOperationalEvidence = async () => {
      throw error;
    };
    await expect(
      adapter.service.operationalEvidence("adapter", {
        resourceId: adapter.serviceId,
        facet: "availability",
      }),
    ).rejects.toBe(error);
    for (const afterError of [
      new FoundationError("EXPIRED"),
      new FoundationError("REVOKED"),
      new Error("synthetic audit failure"),
    ]) {
      const f = operationalFixture();
      f.rows.push(sourceRecord(f.serviceId));
      f.state.afterError = afterError;
      await expect(
        f.service.operationalEvidence("commit", {
          resourceId: f.serviceId,
          facet: "availability",
        }),
      ).rejects.toBe(afterError);
    }
    const tampered = operationalFixture();
    tampered.rows.push(sourceRecord(tampered.serviceId));
    tampered.state.afterCallback = (result) => {
      (result as { items: { sourceId: string }[] }).items[0]!.sourceId =
        observatoryFixtureId(999999);
    };
    await expect(
      tampered.service.operationalEvidence("tampered", {
        resourceId: tampered.serviceId,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    const revoked = operationalFixture();
    revoked.rows.push(sourceRecord(revoked.serviceId));
    revoked.state.afterCallback = () => {
      revoked.state.access.owner = false;
    };
    await expect(
      revoked.service.operationalEvidence("revoked", {
        resourceId: revoked.serviceId,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects public authority before the port and does not execute source accessors", async () => {
    const f = operationalFixture();
    await expect(
      f.service.operationalEvidence("injected", {
        resourceId: f.serviceId,
        facet: "availability",
        sourceId: "selected",
        owner: true,
      }),
    ).rejects.toThrow();
    expect(f.requests).toEqual([]);
    let invoked = false;
    const row = sourceRecord(f.serviceId);
    Object.defineProperty(row, "details", {
      enumerable: true,
      get() {
        invoked = true;
        return { secret: "PRIVATE_SOURCE_DATA" };
      },
    });
    f.rows.push(row);
    await expect(
      f.service.operationalEvidence("accessor", {
        resourceId: f.serviceId,
        facet: "availability",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(invoked).toBe(false);
  });
});
