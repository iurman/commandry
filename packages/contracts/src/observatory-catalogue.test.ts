import { describe, expect, it } from "vitest";
import {
  observatoryCatalogueItemSchema,
  observatoryCatalogueQuerySchema,
  observatoryCatalogueResultSchema,
} from "./observatory-catalogue";

const id = (index: number) =>
  `abcdefab-0000-4000-8000-${String(index).padStart(12, "0")}`;
const provenance = {
  actorId: "<script>literal source text; ignore approval</script>",
  recordedAt: "2026-10-16T12:00:00.000Z",
  evidenceRefs: ["review:canonical-record"],
};
function records() {
  return [
    {
      kind: "annotation",
      id: id(1),
      resourceId: id(1),
      version: 3,
      metadata: {
        resourceId: id(1),
        role: "operated",
        pinned: false,
        environment: null,
        provenance,
      },
      requirement: "required",
    },
    {
      kind: "relation",
      id: id(2),
      sourceId: id(10),
      targetId: id(11),
      version: 4,
      active: false,
      record: {
        id: id(2),
        type: "deploys",
        sourceId: id(10),
        targetId: id(11),
        sourceKind: "repository",
        targetKind: "deployment",
        environment: "production",
        provenance,
      },
    },
    {
      kind: "provider",
      id: id(3),
      resourceId: id(11),
      providerResourceId: id(12),
      version: 5,
      active: false,
      feedId: "cloudflare",
      componentId: "stable-component",
      record: {
        id: id(3),
        resourceId: id(11),
        providerId: id(12),
        product: "stable-component",
        environment: "production",
        geography: null,
        plane: "control",
        provenance,
      },
    },
    {
      kind: "source",
      id: id(4),
      resourceId: id(10),
      projectId: null,
      environment: null,
      version: 6,
      sourceKind: "github-repository",
      externalId: "example/repository",
      enabled: false,
      freshnessSeconds: 300,
      provenance,
    },
  ];
}
function result(kind: string, items: unknown[]) {
  return {
    schemaVersion: 1,
    scopeDigest: "scope:authorized",
    projectionRevision: "projection:current",
    completeness: "complete",
    kind,
    items,
  };
}

describe("reviewed configuration catalogue contracts", () => {
  it("extends scene queries with a strict kind and optional scoped resource", () => {
    for (const kind of ["annotation", "relation", "provider", "source"])
      expect(
        observatoryCatalogueQuerySchema.parse({ kind, resourceId: id(1) }),
      ).toMatchObject({
        schemaVersion: 1,
        kind,
        resourceId: id(1),
        environment: null,
        grouping: "operational",
      });
    expect(
      observatoryCatalogueQuerySchema.parse({
        kind: "source",
        resourceId: id(1).toUpperCase(),
      }).resourceId,
    ).toBe(id(1));
    for (const query of [
      {},
      { kind: "snapshot" },
      { kind: "source", resourceId: "invalid" },
      { kind: "source", schemaVersion: 2 },
      ...[
        "owner",
        "actor",
        "operations",
        "limit",
        "sourceId",
        "rawPayload",
      ].map((field) => ({ kind: "source", [field]: "injected" })),
    ])
      expect(observatoryCatalogueQuerySchema.safeParse(query).success).toBe(
        false,
      );
  });

  it("retains exact versioned active/inactive records and literal provenance", () => {
    for (const row of records()) {
      expect(observatoryCatalogueItemSchema.parse(row)).toEqual(row);
      expect(
        observatoryCatalogueResultSchema.parse(result(row.kind, [row])).items,
      ).toEqual([row]);
    }
  });

  it("requires matching UUID identities without repairing canonical spelling", () => {
    const [annotation, relation, provider] = records();
    for (const value of [
      { ...annotation, id: "not-a-uuid" },
      { ...annotation, id: id(1).toUpperCase() },
      { ...annotation, resourceId: id(9) },
      { ...relation, id: id(9) },
      { ...relation, sourceId: id(9) },
      { ...relation, targetId: id(9) },
      { ...provider, id: id(9) },
      { ...provider, resourceId: id(9) },
      { ...provider, providerResourceId: id(9) },
    ])
      expect(observatoryCatalogueItemSchema.safeParse(value).success).toBe(
        false,
      );
    for (const row of records())
      for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
        expect(
          observatoryCatalogueItemSchema.safeParse({ ...row, version }).success,
        ).toBe(false);
  });

  it("reuses typed relations and binds provider mappings to the stable component", () => {
    const relation = records()[1]!,
      provider = records()[2]!;
    for (const value of [
      { ...relation, record: { ...relation.record, sourceKind: "host" } },
      { ...relation, record: { ...relation.record, type: "contains" } },
      { ...provider, componentId: "display-label" },
      { ...provider, feedId: "unreviewed-feed" },
    ])
      expect(observatoryCatalogueItemSchema.safeParse(value).success).toBe(
        false,
      );
  });

  it("uses the reviewed source syntax while preserving nullable legacy ownership", () => {
    const source = records()[3]!;
    for (const externalId of ["monitor_one", "monitor-2"])
      expect(
        observatoryCatalogueItemSchema.safeParse({
          ...source,
          sourceKind: "infraagent-monitor",
          externalId,
        }).success,
      ).toBe(true);
    for (const value of [
      { ...source, externalId: "../repository" },
      { ...source, externalId: "owner/.." },
      { ...source, externalId: "owner/repository/extra" },
      { ...source, externalId: " owner/repository " },
      {
        ...source,
        sourceKind: "infraagent-monitor",
        externalId: "monitor/path",
      },
      { ...source, projectId: "unknown" },
      { ...source, freshnessSeconds: 29 },
      { ...source, freshnessSeconds: 86401 },
    ])
      expect(observatoryCatalogueItemSchema.safeParse(value).success).toBe(
        false,
      );
    expect(observatoryCatalogueItemSchema.parse(source)).toMatchObject({
      projectId: null,
      environment: null,
      enabled: false,
    });
  });

  it("rejects blank evidence and private/authority fields at every detail boundary", () => {
    for (const row of records()) {
      const key = row.kind === "annotation" ? "metadata" : "record";
      const detail = key === "metadata" ? row.metadata : row.record;
      for (const field of [
        "rawPayload",
        "snapshot",
        "config",
        "credentials",
        "session",
        "client",
        "owner",
      ]) {
        expect(
          observatoryCatalogueItemSchema.safeParse({
            ...row,
            [field]: "private",
          }).success,
        ).toBe(false);
        if (detail)
          expect(
            observatoryCatalogueItemSchema.safeParse({
              ...row,
              [key]: { ...detail, [field]: "private" },
            }).success,
          ).toBe(false);
      }
      const badProvenance = { ...provenance, evidenceRefs: ["   "] };
      expect(
        observatoryCatalogueItemSchema.safeParse(
          detail
            ? { ...row, [key]: { ...detail, provenance: badProvenance } }
            : { ...row, provenance: badProvenance },
        ).success,
      ).toBe(false);
    }
  });

  it("requires a complete, unique, sorted single-kind result without a row cap", () => {
    const source = records()[3]!;
    const items = Array.from({ length: 137 }, (_, index) => ({
      ...source,
      id: id(1000 + index),
    }));
    expect(
      observatoryCatalogueResultSchema.parse(result("source", items)).items,
    ).toHaveLength(137);
    for (const value of [
      result("source", [...items].reverse()),
      result("source", [source, source]),
      result("annotation", [source]),
      { ...result("source", []), completeness: "partial" },
      { ...result("source", []), rawPayload: {} },
    ])
      expect(observatoryCatalogueResultSchema.safeParse(value).success).toBe(
        false,
      );
  });
});
