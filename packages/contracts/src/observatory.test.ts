import { describe, expect, it } from "vitest";
import { infrastructureResourceSchema } from "./infrastructure-overview";
import type { ObservatorySceneDto } from "./observatory";
import {
  observatoryMembershipPageSchema,
  observatoryMetadataSchema,
  observatoryProviderExposureSchema,
  observatoryRelationSchema,
  observatorySceneSchema,
  observatorySignalSchema,
  observatorySummarySchema,
} from "./observatory";
import {
  projectObservatory,
  readObservatoryMembers,
} from "../../domain/src/observatory";
import {
  mixedObservatoryFixture,
  operationalObservatoryFixture,
  observatoryFixtureId,
  observatoryFixtureInput,
  observatoryFixtureProvenance,
  scaleObservatoryFixture,
} from "../../../tests/fixtures/observatory";

describe("versioned Observatory DTO", () => {
  it.each([
    "operational",
    "hosts",
    "projects",
    "providers",
    "inventory",
    "custom",
  ] as const)(
    "accepts the complete authorized mixed projection in %s",
    (grouping) => {
      const fixture = mixedObservatoryFixture();
      const scene: ObservatorySceneDto = projectObservatory({
        ...fixture,
        grouping,
      });
      expect(observatorySceneSchema.parse(scene)).toEqual(scene);
      const collection = scene.representations.find(
        (node) => node.memberCount > 1,
      )!;
      const page = readObservatoryMembers(scene, {
        ...collection.expansionRef,
        limit: 1,
      });
      expect(observatoryMembershipPageSchema.parse(page)).toEqual(page);
    },
  );

  it("accepts operational evidence and empty scenes without claiming live adapter or GPU proof", () => {
    const fixture = operationalObservatoryFixture();
    expect(
      observatorySceneSchema.parse(projectObservatory(fixture)).signals,
    ).toHaveLength(9);
    expect(
      observatorySceneSchema.parse(
        projectObservatory(scaleObservatoryFixture(0)),
      ).population.canonicalResourceCount,
    ).toBe(0);
  });

  it("preserves the flat infrastructure contract and accepts its structural input", () => {
    const flat = infrastructureResourceSchema.parse({
      id: observatoryFixtureId(70001),
      name: "Synthetic existing host",
      kind: "host",
      parentResourceId: null,
      projects: [],
      sources: [],
      telemetry: "reporting",
      health: "unknown",
      metrics: [],
    });
    const scene = projectObservatory(observatoryFixtureInput([flat]));
    expect(scene.population.canonicalResourceCount).toBe(1);
    expect(scene.summary.availability.passing).toBe(0);
    expect(
      infrastructureResourceSchema.safeParse({ ...flat, health: "healthy" })
        .success,
    ).toBe(false);
    expect(flat.health).toBe("unknown");
  });

  it("rejects foreign identities, incomplete adjacency, false totals, scope mixing and cyclic presentation", () => {
    const scene = projectObservatory(mixedObservatoryFixture());
    const mutations: ((copy: typeof scene) => void)[] = [
      (copy) => {
        copy.visibleRepresentationIds = [];
      },
      (copy) => {
        copy.rootRepresentationIds.push("missing-root");
      },
      (copy) => {
        copy.visibleRepresentationIds.push(...copy.visibleRepresentationIds);
      },
      (copy) => {
        copy.visibleRepresentationIds = copy.visibleRepresentationIds.filter(
          (id) => id !== copy.rootRepresentationIds[0],
        );
      },
      (copy) => {
        copy.schemaVersion = 2 as 1;
      },
      (copy) => {
        copy.population.canonicalResourceCount++;
      },
      (copy) => {
        copy.representations.push(copy.representations[0]!);
      },
      (copy) => {
        copy.membershipIndex.resourceIds.push(observatoryFixtureId(999999));
      },
      (copy) => {
        copy.representations[0]!.memberCount++;
      },
      (copy) => {
        copy.representations[0]!.expansionRef.scopeDigest = "wrong-scope";
      },
      (copy) => {
        copy.representations[0]!.expansionRef.projectionRevision =
          "wrong-revision";
      },
      (copy) => {
        copy.representations[0]!.parentRepresentationId =
          copy.representations[0]!.id;
      },
      (copy) => {
        const parent = copy.representations.find(
          (node) => copy.membershipIndex.children[node.id]!.length,
        )!;
        copy.membershipIndex.children[parent.id] = [];
      },
      (copy) => {
        copy.membershipIndex.directMembers[copy.representations[0]!.id] = [
          observatoryFixtureId(999999),
        ];
      },
      (copy) => {
        copy.containment[0]!.parentResourceId = observatoryFixtureId(999999);
      },
      (copy) => {
        const alias = copy.representations.find((node) => node.referenceTo)!;
        alias.referenceTo = "unknown";
      },
      (copy) => {
        copy.readCompletedAt = "2026-10-16T11:00:00Z";
      },
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(scene);
      mutate(copy);
      expect(observatorySceneSchema.safeParse(copy).success).toBe(false);
    }
  });

  it("rejects invalid facet states, unsupported health claims, fabricated freshness and empty evidence", () => {
    const scene = projectObservatory(operationalObservatoryFixture());
    const signal = scene.signals.find((item) => item.facet === "availability")!;
    expect(
      observatorySignalSchema.safeParse({ ...signal, state: "healthy" })
        .success,
    ).toBe(false);
    expect(
      observatorySignalSchema.safeParse({
        ...signal,
        facet: "security",
        state: "uncompromised",
      }).success,
    ).toBe(false);
    expect(
      observatorySignalSchema.safeParse({ ...signal, evidenceRefs: [] })
        .success,
    ).toBe(false);
    const copy = structuredClone(scene);
    copy.signals[0]!.observedAt = "2026-10-15T12:00:00Z";
    expect(observatorySceneSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects 100 percent coverage for zero checks, incomplete totals and optional impact inflation", () => {
    const summary = projectObservatory(mixedObservatoryFixture()).summary;
    expect(
      observatorySummarySchema.safeParse({
        ...summary,
        coverage: { ...summary.coverage, state: "complete" },
      }).success,
    ).toBe(false);
    expect(
      observatorySummarySchema.safeParse({
        ...summary,
        coverage: { ...summary.coverage, monitored: 14 },
      }).success,
    ).toBe(false);
    expect(
      observatorySummarySchema.safeParse({
        ...summary,
        availability: { ...summary.availability, confirmedImpact: true },
      }).success,
    ).toBe(false);
  });

  it("requires explicit mapping evidence and typed endpoints", () => {
    const fixture = operationalObservatoryFixture();
    expect(observatoryRelationSchema.parse(fixture.relations[0]!)).toEqual(
      fixture.relations[0],
    );
    expect(
      observatoryRelationSchema.safeParse({
        ...fixture.relations[0]!,
        sourceKind: "host",
      }).success,
    ).toBe(false);
    expect(
      observatoryRelationSchema.safeParse({
        ...fixture.relations[0]!,
        provenance: { ...observatoryFixtureProvenance, evidenceRefs: [] },
      }).success,
    ).toBe(false);
    expect(
      observatoryMetadataSchema.safeParse({
        ...fixture.metadata[0]!,
        provenance: null,
      }).success,
    ).toBe(false);
  });

  it("requires current dependency matching and independent local evidence for exposure labels", () => {
    const scene = projectObservatory(operationalObservatoryFixture());
    const exposure = scene.providerExposures.find(
      (item) => item.classification === "potential_exposure",
    )!;
    expect(
      observatoryProviderExposureSchema.safeParse({
        ...exposure,
        relevance: "unrelated",
      }).success,
    ).toBe(false);
    expect(
      observatoryProviderExposureSchema.safeParse({
        ...exposure,
        freshness: "stale",
      }).success,
    ).toBe(false);
    expect(
      observatoryProviderExposureSchema.safeParse({
        ...exposure,
        classification: "confirmed_local_impact",
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent or duplicate membership pages", () => {
    const scene = projectObservatory(mixedObservatoryFixture());
    const group = scene.representations.find((node) => node.memberCount > 1)!;
    const page = readObservatoryMembers(scene, {
      ...group.expansionRef,
      limit: 1,
    });
    expect(
      observatoryMembershipPageSchema.safeParse({
        ...page,
        completeness: "complete",
      }).success,
    ).toBe(false);
    expect(
      observatoryMembershipPageSchema.safeParse({
        ...page,
        items: [page.items[0], page.items[0]],
      }).success,
    ).toBe(false);
    expect(
      observatoryMembershipPageSchema.safeParse({ ...page, total: 0 }).success,
    ).toBe(false);
  });
});
