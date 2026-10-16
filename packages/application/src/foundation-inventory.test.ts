import { describe, expect, it } from "vitest";
import {
  foundationClientSchema,
  foundationConfigurationSchema,
  foundationEvidenceSchema,
  foundationMemorySchema,
  type FoundationConfiguration,
  type FoundationEvidence,
  type FoundationMemory,
} from "@commandry/contracts";
import { foundationTokenDigest } from "@commandry/domain";
import type { FoundationMachineRequest } from "./agent-foundation";
import {
  createFoundationInventoryService,
  type FoundationConfigurationSummary,
  type FoundationEvidenceSummary,
  type FoundationInventoryPage,
  type FoundationInventoryPort,
  type FoundationInventoryQuery,
  type FoundationInventoryRecords,
  type FoundationMemorySummary,
} from "./foundation-inventory";

const id = (value: number) =>
  "00000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const projectId = id(1);
const foreignProjectId = id(2);
const token = "af_" + "A".repeat(43);
const cutoff = "2026-10-15T12:00:00.000Z";
const createdAt = "2026-10-01T00:00:00.000Z";
const future = "2026-10-15T13:00:00.000Z";
const lifecycle = ["proposed", "accepted", "rejected", "superseded"] as const;
const verification = [
  "unverified",
  "source_matched",
  "independently_verified",
] as const;
const category = ["finding", "preference", "instruction", "decision"] as const;
const kinds = [
  "prompt",
  "skill",
  "hook",
  "loop",
  "runtime",
  "model",
  "settings",
] as const;
type Stored<T> = { createdAt: string; record: T };
type LoosePage = {
  items: Record<string, unknown>[];
  nextCursor: string | null;
  asOf: string;
};

function evidence(index: number, project = projectId): FoundationEvidence {
  return foundationEvidenceSchema.parse({
    schemaVersion: 1,
    id: id(index),
    projectId: project,
    sourceKind: ["capture", "knowledge_revision", "artifact", "external"][
      index % 4
    ],
    sourceId: "source-" + index,
    sourceVersion: null,
    contentDigest: "a".repeat(64),
    locator: "source://" + index,
    observedAt: null,
    availability: index % 2 === 0 ? "available" : "unavailable",
    ingestedAt: createdAt,
    recordedBy: "owner",
    verification: verification[index % verification.length],
  });
}

function memory(index: number, project = projectId): FoundationMemory {
  return foundationMemorySchema.parse({
    schemaVersion: 1,
    id: id(index),
    projectId: project,
    knowledgeItemId: id(42),
    version: 2,
    contentDigest: "b".repeat(64),
    content: {
      statement: "PRIVATE MEMORY CONTENT " + index,
      category: category[index % category.length],
      evidenceIds: [id(43)],
      relatedMemoryIds: [],
      relationType: null,
    },
    lifecycle: lifecycle[index % lifecycle.length],
    verification: verification[index % verification.length],
    recordedBy: "owner",
    // Current revisions after the creation cutoff must remain discoverable.
    recordedAt: future,
  });
}

function configuration(
  index: number,
  project = projectId,
): FoundationConfiguration {
  return foundationConfigurationSchema.parse({
    schemaVersion: 1,
    id: id(index),
    projectId: project,
    kind: kinds[index % kinds.length],
    content: "PRIVATE CONFIGURATION CONTENT " + index,
    contentDigest: "c".repeat(64),
    parentIds: [id(44)],
    sourceCommit: "commit-reference",
    recordedAt: createdAt,
    recordedBy: "owner",
  });
}

function memorySummary(record: FoundationMemory): FoundationMemorySummary {
  return {
    id: record.id,
    projectId: record.projectId,
    knowledgeItemId: record.knowledgeItemId,
    version: record.version,
    contentDigest: record.contentDigest,
    lifecycle: record.lifecycle,
    verification: record.verification,
    category: record.content.category,
    recordedAt: record.recordedAt,
  };
}

function configurationSummary(
  record: FoundationConfiguration,
): FoundationConfigurationSummary {
  return {
    id: record.id,
    projectId: record.projectId,
    kind: record.kind,
    contentDigest: record.contentDigest,
    recordedAt: record.recordedAt,
  };
}

// Storage fixture exercises project/cutoff filtering before limit + 1, without
// any overall cap. Memory creation time is deliberately separate from revision.
function paginate<T extends { id: string; projectId: string }>(
  rows: Stored<T>[],
  input: FoundationInventoryQuery,
): FoundationInventoryPage<T> {
  const eligible = rows
    .filter(
      ({ createdAt: firstCreated, record }) =>
        record.projectId === input.projectId &&
        Date.parse(firstCreated) <= Date.parse(input.asOf) &&
        (input.after === undefined || record.id > input.after),
    )
    .sort((a, b) => a.record.id.localeCompare(b.record.id))
    .slice(0, input.limit + 1);
  const items = eligible.slice(0, input.limit).map(({ record }) => record);
  return {
    items,
    nextCursor:
      eligible.length > input.limit ? items[items.length - 1]!.id : null,
    asOf: input.asOf,
  };
}

function fixture(count = 207) {
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(9),
    projectId,
    name: "Inventory reader",
    operations: ["foundation.read"],
    environment: "test",
    createdAt,
    expiresAt: "2026-10-16T00:00:00.000Z",
    revokedAt: null,
    createdBy: "owner",
  });
  const indices = Array.from({ length: count }, (_, index) => index + 1000);
  // Foreign records sort BEFORE the eligible population and cannot fill pages.
  const foreign = Array.from({ length: 12 }, (_, index) => index + 100);
  const all = [
    ...indices.map((index) => ({ index, project: projectId })),
    ...foreign.map((index) => ({ index, project: foreignProjectId })),
  ];
  const evidenceRows = all.map(({ index, project }) => ({
    createdAt,
    record: evidence(index, project),
  }));
  const memoryRows = all.map(({ index, project }) => ({
    createdAt,
    record: memory(index, project),
  }));
  const configurationRows = all.map(({ index, project }) => ({
    createdAt,
    record: configuration(index, project),
  }));
  evidenceRows.push({
    createdAt: future,
    record: { ...evidence(500), ingestedAt: future },
  });
  memoryRows.push({ createdAt: future, record: memory(500) });
  configurationRows.push({
    createdAt: future,
    record: { ...configuration(500), recordedAt: future },
  });
  const state = {
    time: new Date(cutoff),
    onRead: undefined as (() => void | Promise<void>) | undefined,
    afterCallback: undefined as (() => void | Promise<void>) | undefined,
    corrupt: undefined as ((page: unknown) => unknown) | undefined,
    substitute: undefined as ((page: unknown) => unknown) | undefined,
    bypass: false,
  };
  const requests: FoundationMachineRequest[] = [];
  const reads: FoundationInventoryQuery[] = [];
  const events: string[] = [];
  async function retrieve<T>(
    rows: () => Stored<T & { id: string; projectId: string }>[],
    input: FoundationInventoryQuery,
  ): Promise<FoundationInventoryPage<T>> {
    reads.push({ ...input });
    events.push("read");
    await state.onRead?.();
    const page = paginate(rows(), input);
    return (state.corrupt?.(structuredClone(page)) ??
      page) as FoundationInventoryPage<T>;
  }
  const records: FoundationInventoryRecords = {
    listEvidence: (input) =>
      retrieve<FoundationEvidenceSummary>(() => evidenceRows, input),
    listMemory: (input) =>
      retrieve<FoundationMemorySummary>(
        () =>
          memoryRows.map((row) => ({
            ...row,
            record: memorySummary(row.record),
          })),
        input,
      ),
    listConfigurations: (input) =>
      retrieve<FoundationConfigurationSummary>(
        () =>
          configurationRows.map((row) => ({
            ...row,
            record: configurationSummary(row.record),
          })),
        input,
      ),
  };
  const port: FoundationInventoryPort = {
    async withClient(request, callback) {
      requests.push({ ...request });
      events.push("lock");
      expect(request.tokenDigest).toBe(foundationTokenDigest(token));
      const value = state.bypass ? undefined : await callback(client, records);
      await state.afterCallback?.();
      events.push("audit", "commit");
      return (state.substitute?.(value) ?? value) as Awaited<
        ReturnType<typeof callback>
      >;
    },
  };
  const service = createFoundationInventoryService(port, {
    environment: "test",
    now: () => state.time,
    createId: () => id(99),
  });
  return {
    service,
    state,
    client,
    requests,
    reads,
    events,
    evidenceRows,
    memoryRows,
    configurationRows,
  };
}
const methods = ["listEvidence", "listMemory", "listConfigurations"] as const;

async function expectInvalid(action: Promise<unknown>) {
  await expect(action).rejects.toMatchObject({
    name: "FoundationError",
    code: "INVALID_REFERENCE",
    message: "Invalid foundation inventory result",
  });
}

describe("foundation inventory populations and continuations", () => {
  it.each(methods)(
    "%s reaches all 207 eligible records across 100-row pages",
    async (method) => {
      const f = fixture();
      const seen: string[] = [];
      let page = await f.service[method](token, {
        projectId: projectId.toUpperCase(),
        limit: 100,
      });
      const selectedAsOf = page.asOf;
      for (;;) {
        seen.push(...page.items.map((item) => item.id));
        expect(page.items.every((item) => item.projectId === projectId)).toBe(
          true,
        );
        if (page.nextCursor === null) break;
        f.state.time = new Date("2026-10-15T12:30:00.000Z");
        page = await f.service[method](token, {
          projectId,
          limit: 100,
          after: page.nextCursor,
          asOf: selectedAsOf,
        });
      }
      expect(seen).toEqual(
        Array.from({ length: 207 }, (_, index) => id(index + 1000)),
      );
      expect(new Set(seen).size).toBe(207);
      expect(f.reads.map((read) => read.limit)).toEqual([100, 100, 100]);
      expect(f.reads.every((read) => read.asOf === cutoff)).toBe(true);
      expect(f.events).toEqual(
        Array.from({ length: 3 }, () => [
          "lock",
          "read",
          "audit",
          "commit",
        ]).flat(),
      );
    },
  );

  it("keeps every lifecycle, verification, availability, category and configuration kind discoverable", async () => {
    const f = fixture(24);
    const e = await f.service.listEvidence(token, { projectId });
    const m = await f.service.listMemory(token, { projectId });
    const c = await f.service.listConfigurations(token, { projectId });
    expect(new Set(e.items.map((item) => item.availability))).toEqual(
      new Set(["available", "unavailable"]),
    );
    expect(new Set(e.items.map((item) => item.verification))).toEqual(
      new Set(verification),
    );
    expect(new Set(m.items.map((item) => item.lifecycle))).toEqual(
      new Set(lifecycle),
    );
    expect(new Set(m.items.map((item) => item.verification))).toEqual(
      new Set(verification),
    );
    expect(new Set(m.items.map((item) => item.category))).toEqual(
      new Set(category),
    );
    expect(new Set(c.items.map((item) => item.kind))).toEqual(new Set(kinds));
    expect(m.items.every((item) => item.recordedAt === future)).toBe(true);
  });

  it("returns metadata only and keeps evidence canonical", async () => {
    const f = fixture(1);
    const e = await f.service.listEvidence(token, { projectId });
    const m = await f.service.listMemory(token, { projectId });
    const c = await f.service.listConfigurations(token, { projectId });
    expect(e.items).toEqual([evidence(1000)]);
    expect(Object.keys(m.items[0]!).sort()).toEqual(
      [
        "id",
        "projectId",
        "knowledgeItemId",
        "version",
        "contentDigest",
        "lifecycle",
        "verification",
        "category",
        "recordedAt",
      ].sort(),
    );
    expect(Object.keys(c.items[0]!).sort()).toEqual(
      ["id", "projectId", "kind", "contentDigest", "recordedAt"].sort(),
    );
    expect(JSON.stringify([m, c])).not.toContain("PRIVATE");
    expect(JSON.stringify([m, c])).not.toContain("parentIds");
    expect(JSON.stringify([m, c])).not.toContain("statement");
  });

  it("defaults to 25 and accepts a truthful earlier creation cutoff", async () => {
    const f = fixture(30);
    const first = await f.service.listEvidence(token, { projectId });
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).toBe(id(1024));
    const earlier = await f.service.listEvidence(token, {
      projectId,
      asOf: "2026-09-01T00:00:00Z",
    });
    expect(earlier).toEqual({
      items: [],
      nextCursor: null,
      asOf: "2026-09-01T00:00:00Z",
    });
  });

  it("hashes credentials and supplies only server authority in the access request", async () => {
    const f = fixture(1);
    await f.service.listMemory(token, { projectId });
    expect(f.requests).toEqual([
      {
        operation: "foundation.read",
        projectId,
        environment: "test",
        targetId: null,
        correlationId: id(99),
        tokenDigest: foundationTokenDigest(token),
      },
    ]);
    expect(JSON.stringify(f.requests)).not.toContain(token);
  });
});

describe("creation-cutoff semantics", () => {
  it("keeps later current-head metadata visible without admitting new memories", async () => {
    const f = fixture(2);
    const first = await f.service.listMemory(token, { projectId, limit: 1 });
    const next = f.memoryRows.find((row) => row.record.id === id(1001))!;
    next.record.version = 3;
    next.record.lifecycle = "rejected";
    next.record.recordedAt = "2026-10-15T12:15:00.000Z";
    f.memoryRows.push({
      createdAt: "2026-10-15T12:10:00.000Z",
      record: memory(1002),
    });
    f.state.time = new Date("2026-10-15T12:30:00.000Z");
    const second = await f.service.listMemory(token, {
      projectId,
      limit: 1,
      after: first.nextCursor,
      asOf: first.asOf,
    });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({
      id: id(1001),
      version: 3,
      lifecycle: "rejected",
      recordedAt: "2026-10-15T12:15:00.000Z",
    });
    expect(second.nextCursor).toBeNull();
    expect(second.asOf).toBe(cutoff);
  });

  it("normalizes requested project identity before authorizing and retrieving", async () => {
    const f = fixture(1);
    const normalized = "abcdef00-0000-4000-8000-000000000001";
    f.client.projectId = normalized;
    f.memoryRows[0]!.record.projectId = normalized;
    const result = await f.service.listMemory(token, {
      projectId: normalized.toUpperCase(),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.projectId).toBe(normalized);
    expect(f.requests[0]!.projectId).toBe(normalized);
    expect(f.reads[0]!.projectId).toBe(normalized);
  });
});

describe("exact fractional timestamp comparison", () => {
  it.each([
    "2026-10-15T12:00:00.099999Z",
    "2026-10-15T12:00:00.099999999999999999Z",
  ])(
    "accepts past cutoff %s against a .100 server instant without rewriting it",
    async (asOf) => {
      const f = fixture(1);
      f.state.time = new Date("2026-10-15T12:00:00.100Z");
      const result = await f.service.listMemory(token, { projectId, asOf });
      expect(result.items).toHaveLength(1);
      expect(result.asOf).toBe(asOf);
      expect(f.reads[0]!.asOf).toBe(asOf);
    },
  );

  describe.each(["listEvidence", "listConfigurations"] as const)(
    "%s",
    (method) => {
      it.each([
        [
          "2026-10-15T12:00:00.099999999999999999Z",
          "2026-10-15T12:00:00.100Z",
          false,
        ],
        [
          "2026-10-15T14:00:00.099999999999999999+02:00",
          "2026-10-15T12:00:00.099999999999999999Z",
          true,
        ],
        ["2026-10-15T12:00:00.1Z", "2026-10-15T07:00:00.100000-05:00", true],
        [
          "2026-10-15T12:00:00.100000000000000001Z",
          "2026-10-15T14:00:00.100000000000000002+02:00",
          false,
        ],
        [
          "2026-10-15T14:00:00.100000000000000002+02:00",
          "2026-10-15T12:00:00.100000000000000001Z",
          true,
        ],
      ] as const)(
        "compares cutoff %s and metadata %s exactly (accepted %s)",
        async (asOf, metadataAt, accepted) => {
          const f = fixture(1);
          f.state.time = new Date("2026-10-15T12:00:01.000Z");
          f.state.corrupt = (value) => {
            const page = value as LoosePage;
            page.items[0]![
              method === "listEvidence" ? "ingestedAt" : "recordedAt"
            ] = metadataAt;
            return page;
          };
          const action = f.service[method](token, { projectId, asOf });
          if (accepted) {
            const page = await action;
            expect(page.asOf).toBe(asOf);
            expect(page.items[0]).toHaveProperty(
              method === "listEvidence" ? "ingestedAt" : "recordedAt",
              metadataAt,
            );
          } else {
            await expectInvalid(action);
          }
        },
      );
    },
  );

  it("rejects a cutoff later than server time by only submillisecond digits", async () => {
    const f = fixture(1);
    f.state.time = new Date("2026-10-15T12:00:00.100Z");
    await expectInvalid(
      f.service.listMemory(token, {
        projectId,
        asOf: "2026-10-15T12:00:00.100000000000000001Z",
      }),
    );
    expect(f.requests).toHaveLength(0);
  });
});

describe("strict inputs and live authorization", () => {
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { after: "forged" },
    { asOf: "not-a-date" },
    { owner: true },
    { environment: "production" },
    { correlationId: id(77) },
    { tokenDigest: "f".repeat(64) },
    { lifecycle: "accepted" },
    { healthy: true },
    { model: "chosen" },
    { actor: { capabilities: ["foundation.read"] } },
  ])("rejects forged or unsupported input %j before access", async (extra) => {
    const f = fixture(1);
    await expect(
      f.service.listEvidence(token, { projectId, ...extra }),
    ).rejects.toThrow();
    expect(f.requests).toHaveLength(0);
  });

  it.each(methods)("%s does not broaden a write-only grant", async (method) => {
    const f = fixture(1);
    f.client.operations = ["evidence.record"];
    await expect(f.service[method](token, { projectId })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    expect(f.reads).toHaveLength(0);
  });

  it.each(["invalid", "ck_" + "A".repeat(43)])(
    "rejects unsupported credential %s before access",
    async (credential) => {
      const f = fixture(1);
      await expect(
        f.service.listMemory(credential, { projectId }),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
      expect(f.requests).toHaveLength(0);
    },
  );

  it.each([
    ["revoked", "REVOKED"],
    ["expired", "EXPIRED"],
    ["environment", "FORBIDDEN"],
    ["project", "FORBIDDEN"],
    ["invalid expiry", "FORBIDDEN"],
    ["invalid revocation", "FORBIDDEN"],
  ])("rejects %s grants before retrieval", async (change, code) => {
    const f = fixture(1);
    if (change === "revoked") f.client.revokedAt = cutoff;
    if (change === "expired") f.client.expiresAt = cutoff;
    if (change === "environment") f.client.environment = "production";
    if (change === "project") f.client.projectId = foreignProjectId;
    if (change === "invalid expiry")
      f.client.expiresAt = "2026-02-30T00:00:00Z";
    if (change === "invalid revocation") f.client.revokedAt = "invalid";
    await expect(
      f.service.listMemory(token, { projectId }),
    ).rejects.toMatchObject({ code });
    expect(f.reads).toHaveLength(0);
  });

  it.each(["read", "wrapper"])(
    "rechecks every grant property and the clock after the %s await",
    async (boundary) => {
      for (const change of [
        "revoked",
        "expired",
        "environment",
        "project",
        "capabilities",
        "clock",
        "identity",
      ]) {
        const f = fixture(1);
        const mutate = () => {
          if (change === "revoked") f.client.revokedAt = cutoff;
          if (change === "expired")
            f.state.time = new Date("2026-10-16T00:00:00Z");
          if (change === "environment") f.client.environment = "production";
          if (change === "project") f.client.projectId = foreignProjectId;
          if (change === "capabilities")
            f.client.operations = ["memory.propose"];
          if (change === "clock") f.state.time = new Date(Number.NaN);
          if (change === "identity") f.client.id = id(10);
        };
        if (boundary === "read") f.state.onRead = mutate;
        else f.state.afterCallback = mutate;
        await expect(
          f.service.listMemory(token, { projectId }),
        ).rejects.toMatchObject({
          code:
            change === "revoked"
              ? "REVOKED"
              : change === "expired"
                ? "EXPIRED"
                : change === "identity"
                  ? "INVALID_REFERENCE"
                  : "FORBIDDEN",
        });
      }
    },
  );

  it("fails closed on an invalid initial server date", async () => {
    const f = fixture(1);
    f.state.time = new Date(Number.NaN);
    await expect(
      f.service.listMemory(token, { projectId, asOf: createdAt }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.requests).toHaveLength(0);
  });

  it("rejects future creation cutoffs before invoking the port", async () => {
    const f = fixture(1);
    await expectInvalid(
      f.service.listMemory(token, { projectId, asOf: future }),
    );
    expect(f.requests).toHaveLength(0);
  });
});

describe("untrusted page validation", () => {
  const corruptions: [string, (page: LoosePage) => unknown][] = [
    [
      "foreign project",
      (p) => {
        p.items[0]!.projectId = foreignProjectId;
        return p;
      },
    ],
    [
      "duplicate IDs",
      (p) => {
        p.items[1] = p.items[0]!;
        return p;
      },
    ],
    [
      "descending IDs",
      (p) => {
        p.items.reverse();
        return p;
      },
    ],
    [
      "malformed identity",
      (p) => {
        p.items[0]!.id = "secret-foreign-identity";
        return p;
      },
    ],
    [
      "non-normalized identity",
      (p) => {
        p.items[0]!.id = "ABCDEF00-0000-4000-8000-000000000001";
        return p;
      },
    ],
    [
      "extra private content",
      (p) => {
        p.items[0]!.content = "PRIVATE STORAGE BYTES";
        return p;
      },
    ],
    [
      "unknown metadata",
      (p) => {
        p.items[0]!.healthy = true;
        return p;
      },
    ],
    [
      "oversized page",
      (p) => {
        p.items.push({ ...p.items[1]!, id: id(9999) });
        return p;
      },
    ],
    [
      "invalid continuation",
      (p) => {
        p.nextCursor = id(9999);
        return p;
      },
    ],
    [
      "malformed continuation",
      (p) => {
        p.nextCursor = "forged";
        return p;
      },
    ],
    [
      "empty continuation",
      (p) => {
        p.items = [];
        p.nextCursor = id(1001);
        return p;
      },
    ],
    [
      "different cutoff",
      (p) => {
        p.asOf = createdAt;
        return p;
      },
    ],
    [
      "malformed cutoff",
      (p) => {
        p.asOf = "invalid";
        return p;
      },
    ],
    ["extra envelope field", (p) => ({ ...p, total: 999 })],
    [
      "missing envelope field",
      (p) => ({ items: p.items, nextCursor: p.nextCursor }),
    ],
    ["non-array items", (p) => ({ ...p, items: "private database output" })],
    [
      "invalid digest",
      (p) => {
        p.items[0]!.contentDigest = "secret-digest";
        return p;
      },
    ],
    [
      "non-JSON accessor",
      (p) => {
        Object.defineProperty(p.items[0]!, "hidden", { get: () => "PRIVATE" });
        return p;
      },
    ],
  ];
  describe.each(methods)("%s", (method) => {
    it.each(corruptions)("rejects %s with a safe error", async (_, corrupt) => {
      const f = fixture(3);
      f.state.corrupt = (value) => corrupt(value as LoosePage);
      await expectInvalid(f.service[method](token, { projectId, limit: 2 }));
      expect(f.events).toEqual(["lock", "read"]);
    });
    it("rejects IDs at or before the requested cursor", async () => {
      const f = fixture(3);
      f.state.corrupt = (value) => {
        const page = value as LoosePage;
        page.items[0]!.id = id(1000);
        return page;
      };
      await expectInvalid(
        f.service[method](token, {
          projectId,
          limit: 2,
          after: id(1000),
          asOf: cutoff,
        }),
      );
    });
    it("detects replacement or mutation after the authorized callback", async () => {
      const f = fixture(3);
      f.state.substitute = (value) => {
        const page = value as LoosePage;
        page.items[0]!.contentDigest = "f".repeat(64);
        return page;
      };
      await expectInvalid(f.service[method](token, { projectId, limit: 2 }));
    });
  });

  it("rejects an access wrapper that skips authorization entirely", async () => {
    const f = fixture(1);
    f.state.bypass = true;
    await expectInvalid(f.service.listMemory(token, { projectId }));
  });

  it.each(["listEvidence", "listConfigurations"] as const)(
    "%s rejects creation after the cutoff with submillisecond precision",
    async (method) => {
      const f = fixture(2);
      f.state.corrupt = (value) => {
        const page = value as LoosePage;
        page.items[0]![
          method === "listEvidence" ? "ingestedAt" : "recordedAt"
        ] = "2026-10-15T12:00:00.000001Z";
        return page;
      };
      await expectInvalid(f.service[method](token, { projectId }));
    },
  );

  it.each(methods)("%s rejects schema-invalid metadata", async (method) => {
    const f = fixture(2);
    f.state.corrupt = (value) => {
      const page = value as LoosePage;
      page.items[0]![method === "listEvidence" ? "observedAt" : "recordedAt"] =
        "2026-02-30T00:00:00Z";
      return page;
    };
    await expectInvalid(f.service[method](token, { projectId }));
  });
});
