import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { foundationClientSchema } from "@commandry/contracts";
import {
  foundationDigest,
  foundationInstantMilliseconds,
  foundationTokenDigest,
} from "@commandry/domain";
import type { FoundationMachineRequest } from "./agent-foundation";
import type { FoundationInventoryQuery } from "./foundation-inventory";
import {
  createFoundationGeneralContextService,
  type FoundationGeneralContextPort,
  type FoundationGeneralContextRecords,
} from "./foundation-general-context";
import type {
  FoundationWorkingContextCandidate,
  FoundationWorkingContextResult,
} from "./foundation-working-context";

// Synthetic transaction fixture only. This does not prove PostgreSQL locks,
// HTTP wiring, source acquisition or persistence integration.
const id = (value: number) =>
  "00000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const projectId = id(1);
const foreignProjectId = id(2);
const token = "af_" + "A".repeat(43);
const createdAt = "2026-10-01T00:00:00.000Z";
const startedAt = "2026-10-15T12:00:00.100Z";
const later = "2026-10-15T12:00:01.000Z";
const future = "2026-10-16T00:00:00.000Z";
const taskDirection =
  "  Follow the current user's exact scope.\nKeep this spacing.  ";
const textDigest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function candidate(index: number): FoundationWorkingContextCandidate {
  const evidence = {
    schemaVersion: 1 as const,
    id: id(10000 + index),
    projectId,
    sourceKind: "knowledge_revision" as const,
    sourceId: id(20000 + index),
    sourceVersion: "revision-7",
    contentDigest: textDigest("public synthetic source " + index),
    locator: "synthetic://public/source/" + index,
    observedAt: createdAt,
    availability: "available" as const,
    ingestedAt: createdAt,
    recordedBy: "synthetic-recorder",
    verification: "source_matched" as const,
  };
  const content = {
    statement: "Cite the project source " + index + ".",
    category: "instruction" as const,
    evidenceIds: [evidence.id],
    relatedMemoryIds: [],
    relationType: null,
  };
  const contentDigest = foundationDigest(content);
  return {
    memory: {
      schemaVersion: 1,
      id: id(1000 + index),
      projectId,
      knowledgeItemId: id(20000 + index),
      version: 3,
      contentDigest,
      content,
      lifecycle: "accepted",
      verification: "independently_verified",
      recordedBy: "synthetic-owner",
      recordedAt: createdAt,
    },
    evidences: [evidence],
    approval: {
      schemaVersion: 1,
      id: id(30000 + index),
      projectId,
      memoryId: id(1000 + index),
      version: 3,
      contentDigest,
      disclosureProjectId: projectId,
      approvedAt: createdAt,
      expiresAt: future,
      approvedBy: "synthetic-owner",
      revokedAt: null,
    },
    anchor: {
      knowledgeItemId: id(20000 + index),
      knowledgeVersion: 7,
      evidenceId: evidence.id,
      sourceVersion: evidence.sourceVersion,
      contentDigest: evidence.contentDigest,
      freshness: "fresh",
    },
    hasUnresolvedContradictions: false,
  };
}

function rebind(entry: FoundationWorkingContextCandidate) {
  entry.memory.contentDigest = foundationDigest(entry.memory.content);
  if (entry.approval !== null) {
    entry.approval.contentDigest = entry.memory.contentDigest;
  }
}

type CandidatePage = Awaited<
  ReturnType<FoundationGeneralContextRecords["getCandidates"]>
>;

function fixture(count = 3) {
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: id(9),
    projectId,
    name: "Synthetic general context reader",
    operations: ["foundation.read"],
    environment: "test",
    createdAt,
    expiresAt: future,
    revokedAt: null,
    createdBy: "synthetic-owner",
  });
  const rows = Array.from({ length: count }, (_, index) => ({
    firstCreatedAt: createdAt,
    candidate: candidate(index),
  }));
  // Foreign and newly created rows sort first, so filtering must precede limit.
  const foreign = candidate(-1);
  foreign.memory.projectId = foreignProjectId;
  foreign.evidences = foreign.evidences.map((e) => ({
    ...e,
    projectId: foreignProjectId,
  }));
  foreign.approval!.projectId = foreignProjectId;
  foreign.approval!.disclosureProjectId = foreignProjectId;
  rows.push(
    { firstCreatedAt: createdAt, candidate: foreign },
    { firstCreatedAt: future, candidate: candidate(-2) },
  );
  const state = {
    time: new Date(startedAt),
    onRead: undefined as (() => void | Promise<void>) | undefined,
    afterCallback: undefined as (() => void | Promise<void>) | undefined,
    corrupt: undefined as ((page: CandidatePage) => unknown) | undefined,
    substitute: undefined as
      ((result: FoundationWorkingContextResult) => unknown) | undefined,
    bypass: false,
    repeat: false,
    swallowRepeat: false,
  };
  const requests: FoundationMachineRequest[] = [];
  const reads: FoundationInventoryQuery[] = [];
  const events: string[] = [];
  const records: FoundationGeneralContextRecords = {
    async getCandidates(input) {
      reads.push({ ...input });
      events.push("read");
      await state.onRead?.();
      const eligible = rows
        .filter(
          (row) =>
            row.candidate.memory.projectId === input.projectId &&
            foundationInstantMilliseconds(row.firstCreatedAt) <=
              foundationInstantMilliseconds(input.asOf) &&
            (input.after === undefined ||
              row.candidate.memory.id > input.after),
        )
        .sort((a, b) =>
          a.candidate.memory.id.localeCompare(b.candidate.memory.id),
        )
        .slice(0, input.limit + 1);
      const candidates = eligible
        .slice(0, input.limit)
        .map((row) => structuredClone(row.candidate));
      const page: CandidatePage = {
        candidates,
        nextCursor:
          eligible.length > input.limit
            ? candidates[candidates.length - 1]!.memory.id
            : null,
        asOf: input.asOf,
      };
      return (
        state.corrupt === undefined ? page : state.corrupt(page)
      ) as CandidatePage;
    },
  };
  const port: FoundationGeneralContextPort = {
    async withClient(request, callback) {
      requests.push({ ...request });
      events.push("lock");
      const result = state.bypass ? undefined : await callback(client, records);
      if (state.repeat) {
        if (state.swallowRepeat) {
          await callback(client, records).catch(() => undefined);
        } else {
          await callback(client, records);
        }
      }
      await state.afterCallback?.();
      events.push("audit", "commit");
      return (
        state.substitute === undefined
          ? result
          : state.substitute(result as FoundationWorkingContextResult)
      ) as Awaited<ReturnType<typeof callback>>;
    },
  };
  const service = createFoundationGeneralContextService(port, {
    environment: "test",
    now: () => state.time,
    createId: () => id(99),
  });
  return { service, client, state, requests, reads, events, rows };
}

it("returns and digest-binds the original creation cutoff across delayed pages", async () => {
  const f = fixture(3);
  f.state.onRead = () => {
    f.state.time = new Date(new Date(startedAt).getTime() + 1000);
  };
  const first = await f.service.get(token, { projectId, limit: 1 });
  expect(first.asOf).toBe(startedAt);
  expect(first.snapshot.generatedAt).not.toBe(first.asOf);
  const next = await f.service.get(token, {
    projectId,
    limit: 1,
    after: first.snapshot.continuation,
    asOf: first.asOf,
  });
  expect(next.asOf).toBe(first.asOf);
  expect(f.reads[1]!.asOf).toBe(startedAt);
  f.state.substitute = (value) => ({ ...value, asOf: future });
  await expectInvalid(f.service.get(token, { projectId }));
});

async function expectInvalid(action: Promise<unknown>) {
  await expect(action).rejects.toMatchObject({
    name: "FoundationError",
    code: "INVALID_REFERENCE",
    message: "Invalid foundation general context result",
  });
}

describe("general context authenticated selection", () => {
  it("returns an exact reviewed, verified, approved and source-cited instruction", async () => {
    const f = fixture(1);
    const entry = f.rows[0]!.candidate;
    const result = await f.service.get(token, { projectId, taskDirection });
    expect(result.instructions).toEqual([
      {
        memoryId: entry.memory.id,
        version: 3,
        contentDigest: entry.memory.contentDigest,
        approvalId: entry.approval!.id,
        statement: entry.memory.content.statement,
        evidenceIds: entry.memory.content.evidenceIds,
      },
    ]);
    expect(
      result.content.startsWith(
        "Current task direction (applies to this task only):\n" + taskDirection,
      ),
    ).toBe(true);
    expect(result.content.indexOf(taskDirection)).toBeLessThan(
      result.content.indexOf(entry.memory.content.statement),
    );
    expect(result.content).toContain(entry.evidences[0]!.locator);
    expect(result.content).toContain(entry.anchor.contentDigest);
    expect(result.snapshot).toMatchObject({
      projectId,
      generatedAt: startedAt,
      freshness: "fresh",
      contentDigest: textDigest(result.content),
      omissions: [],
      continuation: null,
      budget: {
        maxCharacters: 12000,
        usedCharacters: result.content.length,
        tokenEstimate: null,
        tokenizer: null,
      },
      sourceVersions: [
        {
          evidenceId: entry.evidences[0]!.id,
          contentDigest: entry.evidences[0]!.contentDigest,
        },
      ],
    });
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
    expect(f.reads).toEqual([{ projectId, limit: 25, asOf: startedAt }]);
    expect(JSON.stringify(f.requests)).not.toContain(token);
    expect(f.events).toEqual(["lock", "read", "audit", "commit"]);
  });

  const omissions: [
    string,
    string,
    (entry: FoundationWorkingContextCandidate) => void,
  ][] = [
    [
      "proposed",
      "not_accepted",
      (e) => {
        e.memory.lifecycle = "proposed";
      },
    ],
    [
      "rejected",
      "not_accepted",
      (e) => {
        e.memory.lifecycle = "rejected";
      },
    ],
    [
      "superseded",
      "not_accepted",
      (e) => {
        e.memory.lifecycle = "superseded";
      },
    ],
    [
      "unverified",
      "memory_unverified",
      (e) => {
        e.memory.verification = "unverified";
      },
    ],
    [
      "stale",
      "source_stale",
      (e) => {
        e.anchor.freshness = "stale";
      },
    ],
    [
      "contradicted",
      "unresolved_contradiction",
      (e) => {
        e.hasUnresolvedContradictions = true;
      },
    ],
    [
      "expired",
      "approval_expired",
      (e) => {
        e.approval!.expiresAt = startedAt;
      },
    ],
    [
      "unapproved",
      "approval_missing",
      (e) => {
        e.approval = null;
      },
    ],
    [
      "revoked",
      "approval_revoked",
      (e) => {
        e.approval!.revokedAt = startedAt;
      },
    ],
    [
      "old approval",
      "approval_mismatch",
      (e) => {
        e.approval!.version -= 1;
      },
    ],
    [
      "noninstruction",
      "not_instruction",
      (e) => {
        e.memory.content.category = "finding";
        rebind(e);
      },
    ],
  ];
  it.each(omissions)(
    "accounts for %s without promoting it",
    async (_, reason, mutate) => {
      const f = fixture(1);
      const entry = f.rows[0]!.candidate;
      mutate(entry);
      const result = await f.service.get(token, { projectId });
      expect(result.instructions).toEqual([]);
      expect(result.snapshot.omissions).toEqual([{ reason, count: 1 }]);
      expect(result.snapshot.sourceVersions).toEqual([]);
      expect(result.content).not.toContain(entry.memory.content.statement);
      expect(f.reads).toHaveLength(1);
    },
  );

  it("preserves every supporting source including the thirteenth", async () => {
    const f = fixture(1);
    const entry = f.rows[0]!.candidate;
    entry.evidences = Array.from({ length: 15 }, (_, index) => ({
      ...entry.evidences[0]!,
      id: id(40000 + index),
      locator: "synthetic://public/extra/" + index,
    }));
    entry.memory.content.evidenceIds = entry.evidences.map((e) => e.id);
    entry.anchor.evidenceId = entry.evidences[0]!.id;
    rebind(entry);
    const result = await f.service.get(token, {
      projectId,
      maxCharacters: 100000,
    });
    expect(result.snapshot.sourceVersions).toHaveLength(15);
    for (const evidence of entry.evidences) {
      expect(result.content).toContain(evidence.locator);
    }
  });

  it("uses retrieval completion time for eligibility and preserves the creation cutoff", async () => {
    const f = fixture(1);
    f.rows[0]!.candidate.approval!.expiresAt = "2026-10-15T12:00:00.500Z";
    f.state.onRead = async () => {
      await Promise.resolve();
      f.state.time = new Date(later);
    };
    const result = await f.service.get(token, { projectId });
    expect(f.reads[0]!.asOf).toBe(startedAt);
    expect(result.snapshot.generatedAt).toBe(later);
    expect(result.snapshot.omissions).toEqual([
      { reason: "approval_expired", count: 1 },
    ]);
  });

  it("budgets the full output and keeps the next candidate page reachable", async () => {
    const f = fixture(2);
    const full = await f.service.get(token, {
      projectId,
      taskDirection,
      limit: 1,
    });
    const result = await f.service.get(token, {
      projectId,
      taskDirection,
      limit: 1,
      maxCharacters: full.content.length - 1,
    });
    expect(
      result.content.startsWith(
        "Current task direction (applies to this task only):\n" + taskDirection,
      ),
    ).toBe(true);
    expect(result.instructions).toEqual([]);
    expect(result.snapshot.omissions).toEqual([{ reason: "budget", count: 1 }]);
    expect(result.snapshot.continuation).toBe(id(1000));
    expect(result.snapshot.budget.usedCharacters).toBe(result.content.length);
    expect(result.content.length).toBeLessThanOrEqual(full.content.length - 1);
    expect(f.reads).toHaveLength(2);
  });

  it("rejects framing plus task direction that cannot fit without truncation", async () => {
    const f = fixture(1);
    await expect(
      f.service.get(token, {
        projectId,
        taskDirection,
        maxCharacters: taskDirection.length,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });

  it("reaches all 207 eligible current heads across pages without a total cap", async () => {
    const f = fixture(207);
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const result = await f.service.get(token, {
        projectId,
        limit: 25,
        maxCharacters: 100000,
        asOf: startedAt,
        ...(after === undefined ? {} : { after }),
      });
      seen.push(
        ...result.instructions.map((instruction) => instruction.memoryId),
      );
      after = result.snapshot.continuation ?? undefined;
    } while (after !== undefined);
    expect(seen).toEqual(
      Array.from({ length: 207 }, (_, index) => id(1000 + index)),
    );
    expect(new Set(seen).size).toBe(207);
    expect(f.reads).toHaveLength(9);
    expect(f.reads.every((read) => read.asOf === startedAt)).toBe(true);
  });

  it("keeps later current revisions in the original creation population", async () => {
    const f = fixture(2);
    const first = await f.service.get(token, { projectId, limit: 1 });
    const entry = f.rows[1]!.candidate;
    entry.memory.version = 4;
    entry.memory.recordedAt = later;
    entry.approval!.version = 4;
    f.state.time = new Date(later);
    const second = await f.service.get(token, {
      projectId,
      limit: 1,
      after: first.snapshot.continuation,
      asOf: startedAt,
    });
    expect(second.instructions).toMatchObject([
      { memoryId: id(1001), version: 4 },
    ]);
    expect(second.snapshot.continuation).toBeNull();
  });

  it("returns an honest empty context for an earlier creation cutoff", async () => {
    const f = fixture(1);
    const asOf = "2026-09-01T00:00:00Z";
    const result = await f.service.get(token, { projectId, asOf });
    expect(f.reads[0]!.asOf).toBe(asOf);
    expect(result.instructions).toEqual([]);
    expect(result.snapshot).toMatchObject({
      freshness: "unknown",
      omissions: [],
      continuation: null,
    });
  });

  it("normalizes the input project before granting and querying", async () => {
    const f = fixture(1);
    const normalized = "abcdef00-0000-4000-8000-000000000001";
    f.client.projectId = normalized;
    const entry = f.rows[0]!.candidate;
    entry.memory.projectId = normalized;
    entry.evidences = entry.evidences.map((e) => ({
      ...e,
      projectId: normalized,
    }));
    entry.approval!.projectId = normalized;
    entry.approval!.disclosureProjectId = normalized;
    const result = await f.service.get(token, {
      projectId: normalized.toUpperCase(),
    });
    expect(result.instructions).toHaveLength(1);
    expect(f.requests[0]!.projectId).toBe(normalized);
    expect(f.reads[0]!.projectId).toBe(normalized);
  });
});

describe("strict request and exact time boundaries", () => {
  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { maxCharacters: 0 },
    { maxCharacters: 100001 },
    { maxCharacters: 1.5 },
    { taskDirection: null },
    { taskDirection: "x".repeat(32001) },
    { after: "forged" },
    { after: null },
    { asOf: "not-a-date" },
    { asOf: "2026-02-30T00:00:00Z" },
    { owner: true },
    { environment: "production" },
    { correlationId: id(77) },
    { tokenDigest: "f".repeat(64) },
    { actor: { capabilities: ["foundation.read"] } },
    { lifecycle: "accepted" },
    { category: "instruction" },
    { model: "chosen" },
    { tokenizer: "made-up" },
  ])(
    "rejects unsupported or malformed input %j before access",
    async (extra) => {
      const f = fixture(1);
      await expect(
        f.service.get(token, { projectId, ...extra }),
      ).rejects.toThrow();
      expect(f.requests).toHaveLength(0);
    },
  );

  it.each(["invalid", "ck_" + "A".repeat(43)])(
    "rejects invalid token %s before access",
    async (credential) => {
      const f = fixture(1);
      await expect(
        f.service.get(credential, { projectId }),
      ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
      expect(f.requests).toHaveLength(0);
    },
  );

  it.each([
    ["2026-10-15T12:00:00.099999999999999999Z", true],
    ["2026-10-15T14:00:00.100000000000000000+02:00", true],
    ["2026-10-15T12:00:00.100000000000000001Z", false],
    [future, false],
  ])("compares creation cutoff %s exactly", async (asOf, accepted) => {
    const f = fixture(1);
    if (accepted) {
      await f.service.get(token, { projectId, asOf });
      expect(f.reads[0]!.asOf).toBe(asOf);
    } else {
      await expectInvalid(f.service.get(token, { projectId, asOf }));
      expect(f.requests).toHaveLength(0);
    }
  });

  it.each([
    ["2026-10-15T12:00:00.099999999999999999Z", false],
    ["2026-10-15T14:00:00.100000000000000000+02:00", false],
    ["2026-10-15T12:00:00.100000000000000001Z", true],
  ])(
    "selects approval expiry %s at the exact server instant",
    async (expiresAt, selected) => {
      const f = fixture(1);
      f.rows[0]!.candidate.approval!.expiresAt = expiresAt;
      const result = await f.service.get(token, { projectId });
      expect(result.instructions).toHaveLength(selected ? 1 : 0);
      expect(result.snapshot.omissions).toEqual(
        selected ? [] : [{ reason: "approval_expired", count: 1 }],
      );
    },
  );

  it.each([
    ["2026-10-15T12:00:00.099999999999999999Z", false],
    ["2026-10-15T14:00:00.100000000000000000+02:00", false],
    ["2026-10-15T12:00:00.100000000000000001Z", true],
  ])(
    "checks grant expiry %s without rounding its live interval",
    async (expiresAt, live) => {
      const f = fixture(1);
      f.client.expiresAt = expiresAt;
      if (live) {
        expect(
          (await f.service.get(token, { projectId })).instructions,
        ).toHaveLength(1);
      } else {
        await expect(f.service.get(token, { projectId })).rejects.toMatchObject(
          { code: "EXPIRED" },
        );
        expect(f.reads).toHaveLength(0);
      }
    },
  );

  it("fails closed on an invalid initial server date", async () => {
    const f = fixture(1);
    f.state.time = new Date(Number.NaN);
    await expect(f.service.get(token, { projectId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(f.requests).toHaveLength(0);
  });
});

describe("live canonical grants", () => {
  const grantChanges: [
    string,
    string,
    (f: ReturnType<typeof fixture>) => void,
  ][] = [
    [
      "revocation",
      "REVOKED",
      (f) => {
        f.client.revokedAt = startedAt;
      },
    ],
    [
      "expiry",
      "EXPIRED",
      (f) => {
        f.state.time = new Date(future);
      },
    ],
    [
      "project",
      "FORBIDDEN",
      (f) => {
        f.client.projectId = foreignProjectId;
      },
    ],
    [
      "environment",
      "FORBIDDEN",
      (f) => {
        f.client.environment = "production";
      },
    ],
    [
      "capability",
      "FORBIDDEN",
      (f) => {
        f.client.operations = ["memory.propose"];
      },
    ],
    [
      "malformed expiry",
      "FORBIDDEN",
      (f) => {
        f.client.expiresAt = "2026-02-30T00:00:00Z";
      },
    ],
    [
      "malformed revocation",
      "FORBIDDEN",
      (f) => {
        f.client.revokedAt = "private-invalid";
      },
    ],
    [
      "clock",
      "FORBIDDEN",
      (f) => {
        f.state.time = new Date(Number.NaN);
      },
    ],
    [
      "identity substitution",
      "INVALID_REFERENCE",
      (f) => {
        f.client.id = id(10);
      },
    ],
    [
      "otherwise valid substitution",
      "INVALID_REFERENCE",
      (f) => {
        f.client.createdBy = "another-owner";
      },
    ],
  ];
  describe.each(["read", "wrapper"] as const)(
    "after the %s await",
    (boundary) => {
      it.each(grantChanges)("rechecks %s", async (_, code, mutate) => {
        const f = fixture(1);
        const change = async () => {
          await Promise.resolve();
          mutate(f);
        };
        if (boundary === "read") f.state.onRead = change;
        else f.state.afterCallback = change;
        await expect(f.service.get(token, { projectId })).rejects.toMatchObject(
          { code },
        );
        if (boundary === "read") expect(f.events).toEqual(["lock", "read"]);
      });
    },
  );

  it.each(grantChanges.slice(0, 7))(
    "rejects initial %s before retrieval",
    async (_, code, mutate) => {
      const f = fixture(1);
      mutate(f);
      await expect(f.service.get(token, { projectId })).rejects.toMatchObject({
        code,
      });
      expect(f.reads).toHaveLength(0);
    },
  );
});

describe("untrusted candidate pages", () => {
  const corruptions: [string, (page: CandidatePage) => unknown][] = [
    [
      "foreign memory",
      (p) => {
        p.candidates[0]!.memory.projectId = foreignProjectId;
        return p;
      },
    ],
    [
      "foreign evidence",
      (p) => {
        p.candidates[0]!.evidences = p.candidates[0]!.evidences.map((e) => ({
          ...e,
          projectId: foreignProjectId,
        }));
        return p;
      },
    ],
    [
      "foreign approval",
      (p) => {
        p.candidates[0]!.approval!.projectId = foreignProjectId;
        return p;
      },
    ],
    [
      "duplicate IDs",
      (p) => {
        p.candidates[1] = p.candidates[0]!;
        return p;
      },
    ],
    [
      "descending IDs",
      (p) => {
        p.candidates.reverse();
        return p;
      },
    ],
    [
      "malformed UUID",
      (p) => {
        p.candidates[0]!.memory.id = "private-invalid";
        return p;
      },
    ],
    [
      "noncanonical UUID",
      (p) => {
        p.candidates[0]!.memory.id = "ABCDEF00-0000-4000-8000-000000000001";
        return p;
      },
    ],
    [
      "oversized page",
      (p) => {
        p.candidates.push(candidate(3));
        return p;
      },
    ],
    [
      "wrong cursor",
      (p) => {
        p.nextCursor = id(9999);
        return p;
      },
    ],
    [
      "malformed cursor",
      (p) => {
        p.nextCursor = "private-invalid";
        return p;
      },
    ],
    [
      "noncanonical cursor",
      (p) => {
        p.nextCursor = "ABCDEF00-0000-4000-8000-000000000001";
        return p;
      },
    ],
    [
      "empty continuation",
      (p) => {
        p.candidates = [];
        p.nextCursor = id(1000);
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
      "invalid cutoff",
      (p) => {
        p.asOf = "private-invalid";
        return p;
      },
    ],
    ["extra envelope key", (p) => ({ ...p, total: 99 })],
    [
      "missing envelope key",
      (p) => ({ candidates: p.candidates, nextCursor: p.nextCursor }),
    ],
    ["non-array candidates", (p) => ({ ...p, candidates: "private-invalid" })],
    [
      "null memory",
      (p) => {
        Object.assign(p.candidates[0]!, { memory: null });
        return p;
      },
    ],
    [
      "missing candidate field",
      (p) => {
        Reflect.deleteProperty(p.candidates[0]!, "hasUnresolvedContradictions");
        return p;
      },
    ],
    [
      "unknown candidate field",
      (p) => {
        Object.assign(p.candidates[0]!, { private: true });
        return p;
      },
    ],
    [
      "wrong content digest",
      (p) => {
        p.candidates[0]!.memory.contentDigest = "f".repeat(64);
        return p;
      },
    ],
    [
      "malformed anchor",
      (p) => {
        p.candidates[0]!.anchor.knowledgeVersion = 0;
        return p;
      },
    ],
    [
      "sparse array",
      (p) => {
        Reflect.deleteProperty(p.candidates, "0");
        return p;
      },
    ],
    [
      "symbol key",
      (p) => {
        Object.assign(p, { [Symbol("private")]: true });
        return p;
      },
    ],
    ["non-JSON prototype", (p) => Object.setPrototypeOf(p, { private: true })],
    [
      "nonfinite value",
      (p) => {
        Object.assign(p.candidates[0]!.memory, { version: Number.NaN });
        return p;
      },
    ],
    [
      "cyclic data",
      (p) => {
        Object.assign(p.candidates[0]!, { private: p });
        return p;
      },
    ],
    [
      "accessor",
      (p) => {
        Object.defineProperty(p, "candidates", {
          enumerable: true,
          get() {
            throw new Error("private accessor");
          },
        });
        return p;
      },
    ],
  ];
  it.each(corruptions)(
    "rejects %s without returning partial context",
    async (_, corrupt) => {
      const f = fixture(3);
      f.state.corrupt = corrupt;
      await expect(
        f.service.get(token, { projectId, limit: 2 }),
      ).rejects.toMatchObject({
        name: "FoundationError",
        code: "INVALID_REFERENCE",
      });
      expect(f.events).toEqual(["lock", "read"]);
    },
  );

  it("does not invoke an adapter accessor while rejecting it", async () => {
    const f = fixture(1);
    let invoked = false;
    f.state.corrupt = (page) => {
      Object.defineProperty(page.candidates[0]!.memory.content, "statement", {
        enumerable: true,
        get() {
          invoked = true;
          throw new Error("private accessor");
        },
      });
      return page;
    };
    await expectInvalid(f.service.get(token, { projectId }));
    expect(invoked).toBe(false);
  });

  it("rejects IDs at or before the requested cursor", async () => {
    const f = fixture(3);
    f.state.corrupt = (page) => {
      page.candidates[0]!.memory.id = id(1000);
      return page;
    };
    await expectInvalid(
      f.service.get(token, {
        projectId,
        after: id(1000),
        limit: 2,
        asOf: startedAt,
      }),
    );
  });

  it("does not silently filter a foreign proposed memory", async () => {
    const f = fixture(1);
    f.state.corrupt = (page) => {
      page.candidates[0]!.memory.projectId = foreignProjectId;
      page.candidates[0]!.memory.lifecycle = "proposed";
      return page;
    };
    await expectInvalid(f.service.get(token, { projectId }));
  });
});

describe("transaction wrapper integrity", () => {
  it("rejects a wrapper that never invokes the callback", async () => {
    const f = fixture(1);
    f.state.bypass = true;
    await expectInvalid(f.service.get(token, { projectId }));
  });

  it.each([false, true])(
    "rejects repeated callbacks even if the wrapper swallows the error: %s",
    async (swallowRepeat) => {
      const f = fixture(1);
      f.state.repeat = true;
      f.state.swallowRepeat = swallowRepeat;
      await expectInvalid(f.service.get(token, { projectId }));
      expect(f.reads).toHaveLength(1);
    },
  );

  const corruptions: [
    string,
    (result: FoundationWorkingContextResult) => unknown,
  ][] = [
    [
      "content",
      (r) => {
        r.content += "tampered";
        return r;
      },
    ],
    [
      "snapshot",
      (r) => {
        r.snapshot.sourceVersions = [];
        return r;
      },
    ],
    [
      "instructions",
      (r) => {
        r.instructions[0]!.statement = "tampered";
        return r;
      },
    ],
    [
      "budget",
      (r) => {
        r.snapshot.budget.usedCharacters = 0;
        return r;
      },
    ],
    [
      "continuation",
      (r) => {
        r.snapshot.continuation = id(9999);
        return r;
      },
    ],
    ["extra result field", (r) => ({ ...r, private: true })],
    ["entire replacement", () => null],
    [
      "accessor",
      (r) => {
        Object.defineProperty(r, "content", {
          enumerable: true,
          get() {
            throw new Error("private wrapper accessor");
          },
        });
        return r;
      },
    ],
  ];
  it.each(corruptions)(
    "rejects wrapper mutation or replacement of %s",
    async (_, corrupt) => {
      const f = fixture(1);
      f.state.substitute = corrupt;
      await expectInvalid(f.service.get(token, { projectId }));
    },
  );
});
