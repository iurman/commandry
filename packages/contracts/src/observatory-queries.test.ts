import { describe, expect, it } from "vitest";
import {
  observatoryMembershipQuerySchema,
  observatoryNamedViewCreateSchema,
  observatoryNamedViewUpdateSchema,
  observatoryProviderExplanationQuerySchema,
  observatorySceneQuerySchema,
  observatorySceneReadResultSchema,
  observatorySignalEvidenceQuerySchema,
  observatoryViewConfigurationSchema,
} from "./observatory-queries";
import { projectObservatory } from "@commandry/domain";
import {
  mixedObservatoryFixture,
  observatoryFixtureId,
} from "@commandry/test-support";

describe("strict public Observatory queries", () => {
  it("defaults to the complete operational view and accepts every grouping", () => {
    expect(observatorySceneQuerySchema.parse({})).toEqual({
      schemaVersion: 1,
      grouping: "operational",
      environment: null,
      expandedRepresentationIds: [],
      reveal: "members",
      search: "",
      sectors: [],
      viewRevision: "1",
    });
    for (const grouping of [
      "operational",
      "hosts",
      "projects",
      "providers",
      "inventory",
      "custom",
    ])
      expect(observatorySceneQuerySchema.parse({ grouping }).grouping).toBe(
        grouping,
      );
    expect(
      observatorySceneQuerySchema.parse({
        projectId: observatoryFixtureId(1).toUpperCase(),
        search: "  exact member  ",
      }).search,
    ).toBe("exact member");
  });
  it.each([
    "actor",
    "owner",
    "grants",
    "operations",
    "capabilities",
    "resourceIds",
    "limit",
    "scopeDigest",
    "now",
    "readStartedAt",
  ])("rejects public authority or unsupported field %s", (field) => {
    expect(
      observatorySceneQuerySchema.safeParse({ [field]: "injected" }).success,
    ).toBe(false);
  });
  it("validates distinct sectors and expansion identifiers without imposing a fleet cap", () => {
    const resourceIds = Array.from({ length: 1000 }, (_, index) =>
      observatoryFixtureId(index + 1),
    );
    expect(
      observatorySceneQuerySchema.parse({
        grouping: "custom",
        sectors: [{ id: "all", label: "All", resourceIds, grouping: "hosts" }],
      }).sectors[0]?.resourceIds,
    ).toHaveLength(1000);
    for (const query of [
      { projectId: "bad" },
      { schemaVersion: 2 },
      { search: "x".repeat(501) },
      { expandedRepresentationIds: ["a", "a"] },
      {
        sectors: [
          {
            id: "s",
            label: "S",
            resourceIds: [resourceIds[0], resourceIds[0]],
            grouping: "hosts",
          },
        ],
      },
      {
        sectors: [{ id: "s", label: "S", resourceIds: [], grouping: "custom" }],
      },
    ])
      expect(observatorySceneQuerySchema.safeParse(query).success).toBe(false);
  });
  it("bounds member pages and requires exact scope/revision/group with continuation", () => {
    const base = {
      groupId: "group:repositories",
      scopeDigest: "scope",
      projectionRevision: "revision",
    };
    expect(observatoryMembershipQuerySchema.parse(base)).toMatchObject({
      limit: 25,
      cursor: null,
    });
    for (const extra of [
      { limit: 0 },
      { limit: 101 },
      { limit: "25" },
      { cursor: "" },
      { scopeDigest: "" },
      { projectionRevision: "" },
      { groupId: "" },
      { approved: true },
    ])
      expect(
        observatoryMembershipQuerySchema.safeParse({ ...base, ...extra })
          .success,
      ).toBe(false);
  });
  it("requires exact resource and facet for evidence and provider explanations", () => {
    const resourceId = observatoryFixtureId(1);
    expect(
      observatorySignalEvidenceQuerySchema.parse({ resourceId, facet: "work" })
        .facet,
    ).toBe("work");
    expect(
      observatorySignalEvidenceQuerySchema.safeParse({
        resourceId,
        facet: "health",
      }).success,
    ).toBe(false);
    expect(
      observatoryProviderExplanationQuerySchema.safeParse({
        resourceId: "foreign text",
      }).success,
    ).toBe(false);
  });
});

describe("version 2 presentation configuration", () => {
  it("defaults composed, structural services, no lens and explicit display preferences", () => {
    expect(
      observatoryViewConfigurationSchema.parse({ schemaVersion: 2 }),
    ).toEqual({
      schemaVersion: 2,
      grouping: "operational",
      environment: null,
      sectors: [],
      palette: {},
      palettePreset: "semantic",
      ambient: false,
      textScale: 1,
      paused: false,
      reducedMotion: false,
      sizeBasis: "services",
      camera: "composed",
      lens: false,
      theme: "system",
      labels: true,
      tv: false,
      motion: true,
    });
    for (const camera of ["composed", "manual", "orbit", "tour"])
      expect(
        observatoryViewConfigurationSchema.parse({ schemaVersion: 2, camera })
          .camera,
      ).toBe(camera);
    for (const sizeBasis of ["services", "ram", "uniform"])
      expect(
        observatoryViewConfigurationSchema.parse({
          schemaVersion: 2,
          sizeBasis,
        }).sizeBasis,
      ).toBe(sizeBasis);
    expect(
      observatoryViewConfigurationSchema.parse({
        schemaVersion: 2,
        palette: { warning: "#A1b2C3" },
        theme: "midnight",
        lens: true,
      }).palette.warning,
    ).toBe("#A1b2C3");
    // Icon choices travel with an account view, keyed by canonical resource.
    expect(
      observatoryViewConfigurationSchema.parse({
        schemaVersion: 2,
        icons: { "00000000-0000-4000-8000-000000000001": "proxmox" },
      }).icons,
    ).toEqual({ "00000000-0000-4000-8000-000000000001": "proxmox" });
  });
  it("rejects invalid colors, unsupported versions, authority and canonical mappings", () => {
    for (const extra of [
      { schemaVersion: 1 },
      { palette: { warning: "javascript:alert(1)" } },
      { palette: { warning: "#fff" } },
      { token: "private" },
      { owner: true },
      { mappings: [] },
      { shareUrl: "https://example.test/?private=1" },
      { camera: "auto" },
      { lens: "false" },
      { sectors: [{ id: "", label: "", resourceIds: [], grouping: "hosts" }] },
      { icons: { "not-a-resource": "debian" } },
      { icons: { "00000000-0000-4000-8000-000000000001": "Debian" } },
      { icons: { "00000000-0000-4000-8000-000000000001": "<svg/>" } },
      { icons: { "00000000-0000-4000-8000-000000000001": "x".repeat(41) } },
      { icons: { "00000000-0000-4000-8000-000000000001": 1 } },
      {
        icons: Object.fromEntries(
          Array.from({ length: 1001 }, (_, index) => [
            `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            "debian",
          ]),
        ),
      },
    ])
      expect(
        observatoryViewConfigurationSchema.safeParse({
          schemaVersion: 2,
          ...extra,
        }).success,
      ).toBe(false);
  });
  it("requires bounded names and expected versions for named writes without persisting them", () => {
    const configuration = { schemaVersion: 2 };
    const create = {
      name: "  Home operations  ",
      expectedVersion: 0,
      configuration,
    };
    expect(observatoryNamedViewCreateSchema.parse(create).name).toBe(
      "Home operations",
    );
    expect(
      observatoryNamedViewCreateSchema.safeParse({
        ...create,
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      observatoryNamedViewCreateSchema.safeParse({
        ...create,
        name: "x".repeat(101),
      }).success,
    ).toBe(false);
    const update = {
      viewId: observatoryFixtureId(1),
      name: "Home",
      expectedVersion: 1,
      configuration,
    };
    expect(observatoryNamedViewUpdateSchema.parse(update).expectedVersion).toBe(
      1,
    );
    expect(
      observatoryNamedViewUpdateSchema.safeParse({
        ...update,
        expectedVersion: 0,
      }).success,
    ).toBe(false);
    expect(
      observatoryNamedViewUpdateSchema.safeParse({ ...update, actor: "owner" })
        .success,
    ).toBe(false);
  });
  it("requires complete facet-access reasons alongside the unchanged scene DTO", () => {
    const fixture = mixedObservatoryFixture();
    const scene = projectObservatory(fixture);
    expect(
      observatorySceneReadResultSchema.safeParse({
        schemaVersion: 1,
        scene,
        facetAccess: [],
      }).success,
    ).toBe(false);
    expect(
      observatorySceneReadResultSchema.safeParse({
        schemaVersion: 1,
        scene,
        facetAccess: [
          {
            resourceId: observatoryFixtureId(999999),
            facet: "work",
            state: "inaccessible",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
