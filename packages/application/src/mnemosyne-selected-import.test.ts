import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type {
  FoundationEvidence,
  FoundationMemory,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import type {
  FoundationOwnerRequest,
  FoundationIdentity,
} from "./agent-foundation.js";
import {
  fingerprintMnemosyneSelection,
  type MnemosyneImportEnvelope,
} from "./mnemosyne-import-preview.js";
import {
  createMnemosyneSelectedImportService,
  type FoundationImportExisting,
  type FoundationImportRevision,
  type FoundationImportOriginalSource,
  type FoundationImportOriginalPage,
  type FoundationImportRecordPort,
  type FoundationSelectedImportPort,
  type MnemosyneSelectedImportInput,
} from "./mnemosyne-selected-import.js";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const projectId = id(1);
const knowledgeItemId = id(2);
const now = "2026-10-16T10:00:00.000Z";
const expiry = "2026-10-16T11:00:00.000Z";
const digest = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
function envelope(count = 1, sources = 1): MnemosyneImportEnvelope {
  return {
    schemaVersion: 1,
    projectId,
    namespace: "synthetic-selected",
    records: Array.from({ length: count }, (_, row) => ({
      externalId: "synthetic-" + row,
      knowledgeItemId,
      statement: "Synthetic owner-reviewed assertion " + row,
      category: "instruction",
      sourceTier: "private",
      selected: true,
      sources: Array.from({ length: sources }, (_, index) => {
        const originalContent =
          index === 1
            ? ""
            : index === 2
              ? "NUL\0 exact\r\n"
              : "Original café\r\n" + index;
        return {
          originalContent,
          evidence: {
            projectId,
            sourceKind: index === 0 ? "knowledge_revision" : "external",
            sourceId: index === 0 ? knowledgeItemId : "source-" + index,
            sourceVersion: index === 0 ? "1" : "metadata-version-" + index,
            contentDigest: digest(originalContent),
            locator: "synthetic://source/" + index,
            observedAt: "2026-10-16T01:00:00.123456+01:00",
            availability: "available",
          },
        };
      }),
    })),
  };
}
/** Synthetic orchestration and rollback fake. It provides no PostgreSQL locking,
 * isolation, persistence, race, runtime-role or atomic audit proof. */
function fixture() {
  const state = {
    time: Date.parse(now),
    sequence: 100,
    events: [] as string[],
    requests: [] as FoundationOwnerRequest[],
    memories: new Map<string, FoundationMemory>(),
    aliases: new Map<string, string>(),
    evidences: new Map<string, FoundationEvidence>(),
    revisions: new Map<string, FoundationImportRevision>(),
    originals: new Map<string, FoundationImportOriginalSource[]>(),
    receipts: new Map<
      string,
      { digest: string; value: unknown; responseDigest: string }
    >(),
    at: undefined as string | undefined,
    lateFailure: undefined as string | undefined,
    corruptExisting: undefined as
      ((value: FoundationImportExisting | null) => unknown) | undefined,
    corruptEvidence: undefined as
      ((value: FoundationEvidence) => unknown) | undefined,
    corruptInsertion: undefined as
      | ((value: {
          revision: FoundationImportRevision;
          sources: FoundationImportOriginalSource[];
        }) => unknown)
      | undefined,
    corruptPage: undefined as
      ((page: FoundationImportOriginalPage) => unknown) | undefined,
    afterCallback: undefined as (() => void) | undefined,
    substitute: undefined as ((value: unknown) => unknown) | undefined,
    repeatCallback: false,
    wrongAnchor: false,
    missingReference: false,
  };
  function event(name: string) {
    state.events.push(name);
    if (state.at === name) state.time = Date.parse(expiry);
    if (state.lateFailure === name)
      throw new FoundationError("INVALID_REFERENCE");
  }
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected authority operation");
  };
  const records: FoundationImportRecordPort = {
    async idempotent<T>(
      key: string,
      requestDigest: string,
      perform: () => Promise<T>,
    ) {
      event("receipt.enter");
      const prior = state.receipts.get(key);
      if (prior) {
        if (prior.digest !== requestDigest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        if (prior.responseDigest !== foundationDigest(prior.value))
          throw new FoundationError("INVALID_REFERENCE");
        event("receipt.replay");
        return { value: structuredClone(prior.value) as T, replayed: true };
      }
      const value = await perform();
      state.receipts.set(key, {
        digest: requestDigest,
        value: structuredClone(value),
        responseDigest: foundationDigest(value),
      });
      event("receipt.persist");
      return { value, replayed: false };
    },
    async validateEvidenceReference(input) {
      event("source.validate");
      if (
        state.missingReference ||
        input.projectId !== projectId ||
        (input.sourceKind === "knowledge_revision" &&
          (input.sourceId !== knowledgeItemId || input.sourceVersion !== "1"))
      )
        throw new FoundationError("INVALID_REFERENCE");
    },
    async assertReferences(input) {
      event("references");
      if (input.evidenceIds.some((id) => !state.evidences.has(id)))
        throw new FoundationError("INVALID_REFERENCE");
    },
    async getEvidence(id) {
      return structuredClone(state.evidences.get(id) ?? null);
    },
    async getMemory(id) {
      event("memory.get");
      return structuredClone(state.memories.get(id) ?? null);
    },
    getConfiguration: unexpected,
    async resolveMemoryAnchor(knowledge, evidenceIds) {
      event("anchor");
      const evidence = evidenceIds
        .map((id) => state.evidences.get(id))
        .find((e) => e?.sourceKind === "knowledge_revision");
      if (!evidence) throw new FoundationError("INVALID_REFERENCE");
      return {
        knowledgeItemId: state.wrongAnchor ? id(99) : knowledge,
        knowledgeVersion: 1,
        evidenceId: evidence.id,
        sourceVersion: evidence.sourceVersion,
        contentDigest: evidence.contentDigest,
        freshness: "fresh",
      };
    },
    getMemoryAnchor: unexpected,
    hasUnresolvedContradictions: unexpected,
    async insertEvidence(record) {
      event("evidence.insert");
      state.evidences.set(record.id, structuredClone(record));
      return structuredClone(
        state.corruptEvidence?.(record) ?? record,
      ) as FoundationEvidence;
    },
    async saveMemory(record, expectedVersion, alias) {
      event("memory.save");
      if (
        expectedVersion !== null &&
        state.memories.get(record.id)?.version !== expectedVersion
      )
        throw new FoundationError("VERSION_CONFLICT");
      state.memories.set(record.id, structuredClone(record));
      if (alias !== null) {
        if (state.aliases.has(alias.externalId))
          throw new FoundationError("VERSION_CONFLICT");
        state.aliases.set(alias.externalId, record.id);
      }
      return structuredClone(record);
    },
    reviewMemory: unexpected,
    verifyMemory: unexpected,
    insertInstructionApproval: unexpected,
    insertConfiguration: unexpected,
    async getImportExisting(query) {
      event("existing:" + query.alias.externalId);
      const memoryId = state.aliases.get(query.alias.externalId);
      const memory =
        memoryId === undefined ? null : state.memories.get(memoryId)!;
      const baseline =
        [...state.revisions.values()]
          .filter((r) => r.memoryId === memoryId)
          .sort((a, b) => b.memoryVersion - a.memoryVersion)[0] ?? null;
      const result =
        memory === null ? null : { alias: query.alias, memory, baseline };
      return structuredClone(
        state.corruptExisting?.(result) ?? result,
      ) as FoundationImportExisting | null;
    },
    async insertImportRevision(value) {
      event("baseline.insert");
      state.revisions.set(value.revision.id, structuredClone(value.revision));
      state.originals.set(
        value.revision.id,
        structuredClone([...value.sources]),
      );
      const result = { revision: value.revision, sources: [...value.sources] };
      return structuredClone(
        state.corruptInsertion?.(result) ?? result,
      ) as typeof result;
    },
    async getImportRevision(query) {
      event("revision.get");
      return structuredClone(state.revisions.get(query.id) ?? null);
    },
    async listImportOriginalSources(query) {
      event("originals.list");
      const rows = state.originals.get(query.revisionId) ?? [];
      const items = rows.slice(
        query.fromOrdinal,
        query.fromOrdinal + query.limit,
      );
      const nextOrdinal =
        query.fromOrdinal + items.length < rows.length
          ? query.fromOrdinal + items.length
          : null;
      const result = { items, nextOrdinal };
      return structuredClone(
        state.corruptPage?.(result) ?? result,
      ) as FoundationImportOriginalPage;
    },
  };
  const port: FoundationSelectedImportPort = {
    async withOwner(request, callback) {
      state.requests.push(structuredClone(request));
      event("owner.enter");
      const saved = structuredClone({
        memories: state.memories,
        aliases: state.aliases,
        evidences: state.evidences,
        revisions: state.revisions,
        originals: state.originals,
        receipts: state.receipts,
      });
      try {
        const value = await callback(records);
        if (state.repeatCallback)
          await callback(records).catch(() => undefined);
        state.afterCallback?.();
        event("owner.return");
        return (state.substitute?.(value) ?? value) as Awaited<
          ReturnType<typeof callback>
        >;
      } catch (error) {
        Object.assign(state, saved);
        state.events.push("fake.rollback");
        throw error;
      }
    },
  };
  const identity: FoundationIdentity = {
    principalId: "synthetic-owner",
    expiresAt: expiry,
  };
  const options = {
    environment: "test" as const,
    now: () => new Date(state.time),
    createId: () => id(state.sequence++),
  };
  const service = createMnemosyneSelectedImportService(port, identity, options);
  async function reviewed(
    raw = envelope(),
  ): Promise<MnemosyneSelectedImportInput> {
    const plan = await service.preview(raw);
    return {
      envelope: structuredClone(raw),
      decision: "apply_proposed_unverified",
      reviewedSelections: plan.records
        .filter((r) => r.selected)
        .map((r) => ({
          externalId: r.alias.externalId,
          selectionFingerprint: r.selectionFingerprint,
          expectedExistingMemory: r.expectedExistingMemory,
        })),
    };
  }
  return { state, records, port, identity, options, service, reviewed };
}
const rejected = (promise: Promise<unknown>) =>
  expect(promise).rejects.toBeInstanceOf(FoundationError);

it("previews selected aliases without writes or manufactured review and retains tier redaction", async () => {
  const f = fixture();
  const raw = envelope(2);
  raw.records[1]!.selected = false;
  const preview = await f.service.preview(raw);
  expect(preview.records[0]).toMatchObject({
    statement: null,
    reviewedSelection: false,
    action: "disclosure_review_required",
  });
  expect(preview.records[1]!.action).toBe("unselected");
  expect(f.state.events).toEqual([
    "owner.enter",
    "existing:synthetic-0",
    "owner.return",
  ]);
  expect(f.state.requests[0]).toMatchObject({
    operation: "foundation.read",
    projectId,
    principalId: "synthetic-owner",
    environment: "test",
  });
  expect(JSON.stringify(preview)).not.toContain(
    raw.records[0]!.sources[0]!.originalContent,
  );
  raw.records[0]!.sourceTier = "public";
  expect((await f.service.preview(raw)).records[0]!.statement).toBe(
    raw.records[0]!.statement,
  );
});

it.each(["public", "private", "client", "unknown"] as const)(
  "requires an exact explicit review for %s and every selected record",
  async (sourceTier) => {
    const f = fixture();
    const raw = envelope(2);
    raw.records.forEach((row) => {
      row.sourceTier = sourceTier;
    });
    const request = await f.reviewed(raw);
    for (const selections of [
      [],
      request.reviewedSelections.slice(0, 1),
      [request.reviewedSelections[0]!, request.reviewedSelections[0]!],
    ]) {
      await rejected(
        f.service.apply({ ...request, reviewedSelections: selections }, "key"),
      );
    }
    const changed = structuredClone(request);
    changed.envelope.records[0]!.sources[0]!.evidence.locator += "/changed";
    await rejected(f.service.apply(changed, "key"));
    const unselected = structuredClone(request);
    unselected.envelope.records[0]!.selected = false;
    await rejected(f.service.apply(unselected, "key"));
    expect(f.state.evidences.size).toBe(0);
    expect((await f.service.apply(request, "key")).record.records).toHaveLength(
      2,
    );
  },
);

it("rejects spoofed authority, extra fields and accessors before evaluating accessors or entering a transaction", async () => {
  const f = fixture();
  const request = await f.reviewed();
  const before = f.state.requests.length;
  for (const extra of [
    { owner: true },
    { principalId: "owner" },
    { environment: "production" },
    {
      reviewedSelections: [
        { ...request.reviewedSelections[0], approved: true },
      ],
    },
  ])
    await rejected(f.service.apply({ ...request, ...extra }, "key"));
  for (const field of ["lifecycle", "verification", "actor", "correlationId"]) {
    const changed = structuredClone(request);
    Object.assign(changed.envelope.records[0]!, { [field]: "forged" });
    await rejected(f.service.apply(changed, "key"));
  }
  let evaluated = false;
  const accessor = { ...request };
  Object.defineProperty(accessor, "decision", {
    get() {
      evaluated = true;
      throw new Error("secret");
    },
    enumerable: true,
  });
  await rejected(f.service.apply(accessor, "key"));
  expect(evaluated).toBe(false);
  expect(f.state.requests.length).toBe(before);
});

it.each([17, 1000])(
  "preserves all %i ordered sources, exact metadata and empty/CRLF/Unicode/NUL originals with complete continuation",
  async (sourceCount) => {
    const f = fixture();
    const request = await f.reviewed(envelope(1, sourceCount));
    const result = await f.service.apply(request, "key");
    const summary = result.record.records[0]!;
    expect(summary).toMatchObject({
      action: "created",
      version: 1,
      sourceCount,
    });
    expect(f.state.evidences.size).toBe(sourceCount);
    const memory = f.state.memories.get(summary.memoryId)!;
    expect(memory).toMatchObject({
      lifecycle: "proposed",
      verification: "unverified",
      recordedBy: "synthetic-owner",
    });
    expect(memory.content.evidenceIds).toHaveLength(sourceCount);
    const evidence = [...f.state.evidences.values()];
    request.envelope.records[0]!.sources.forEach((source, index) => {
      expect(evidence[index]).toMatchObject({
        ...source.evidence,
        verification: "unverified",
        recordedBy: "synthetic-owner",
      });
    });
    const metadata = await f.service.getRevision({
      projectId,
      id: summary.importRevisionId,
    });
    expect(metadata).toMatchObject({
      memoryId: memory.id,
      memoryVersion: 1,
      sourceCount,
      reviewedBy: "synthetic-owner",
    });
    expect(JSON.stringify(metadata)).not.toContain("originalContent");
    expect(JSON.stringify(result)).not.toContain(
      request.envelope.records[0]!.statement,
    );
    expect(JSON.stringify(result)).not.toContain("Original");
    const retrieved: FoundationImportOriginalSource[] = [];
    let fromOrdinal: number | null = 0;
    do {
      const page = await f.service.listOriginalSources({
        projectId,
        revisionId: summary.importRevisionId,
        fromOrdinal,
        limit: 13,
      });
      retrieved.push(...page.items);
      fromOrdinal = page.nextOrdinal;
    } while (fromOrdinal !== null);
    expect(retrieved.map((s) => s.ordinal)).toEqual(
      Array.from({ length: sourceCount }, (_, i) => i),
    );
    expect(retrieved.map((s) => s.originalContent)).toEqual(
      request.envelope.records[0]!.sources.map((s) => s.originalContent),
    );
    expect(
      f.state.requests.every(
        (r) =>
          r.operation === "foundation.read" || r.operation === "memory.import",
      ),
    ).toBe(true);
  },
);

it("returns historical exact retries before current state checks, conflicts on changed input, and preserves owner corrections", async () => {
  const f = fixture();
  const request = await f.reviewed();
  const first = await f.service.apply(request, "key");
  const memory = f.state.memories.get(first.record.records[0]!.memoryId)!;
  memory.version += 1;
  memory.content.statement = "Owner correction must survive";
  memory.contentDigest = foundationDigest(memory.content);
  f.state.events.length = 0;
  const replay = await f.service.apply(request, "key");
  expect(replay).toEqual({ ...first, replayed: true });
  expect(f.state.events).toEqual([
    "owner.enter",
    "receipt.enter",
    "receipt.replay",
    "owner.return",
  ]);
  await rejected(f.service.apply(request, "different-key"));
  await rejected(f.service.apply(await f.reviewed(), "another-key"));
  const changed = structuredClone(request);
  changed.envelope.records[0]!.statement = "different import";
  changed.reviewedSelections[0]!.selectionFingerprint =
    fingerprintMnemosyneSelection(changed.envelope, "synthetic-0");
  await expect(f.service.apply(changed, "key")).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  expect(f.state.memories.get(memory.id)!.content.statement).toBe(
    "Owner correction must survive",
  );
});

it("noops before source IDs and preserves accepted/verified heads, including newer same-content owner versions", async () => {
  const f = fixture();
  const initial = await f.service.apply(await f.reviewed(), "initial");
  const summary = initial.record.records[0]!;
  const memory = f.state.memories.get(summary.memoryId)!;
  memory.lifecycle = "accepted";
  memory.verification = "independently_verified";
  const stale = await f.reviewed();
  memory.version += 1;
  await rejected(f.service.apply(stale, "stale"));
  const request = await f.reviewed();
  const before = f.state.sequence;
  const evidenceCount = f.state.evidences.size;
  const noop = await f.service.apply(request, "noop");
  expect(f.state.sequence - before).toBe(1); // The operation correlation only.
  expect(noop.record.records[0]).toMatchObject({
    action: "unchanged",
    memoryId: memory.id,
    version: 2,
    importRevisionId: summary.importRevisionId,
  });
  expect(f.state.revisions.size).toBe(1);
  expect(f.state.evidences.size).toBe(evidenceCount);
  expect(f.state.memories.get(memory.id)).toMatchObject({
    lifecycle: "accepted",
    verification: "independently_verified",
    version: 2,
  });
});

it("revises a changed source/wording on the same identity and resets lifecycle and verification without approving instructions", async () => {
  const f = fixture();
  const first = await f.service.apply(await f.reviewed(), "first");
  const memoryId = first.record.records[0]!.memoryId;
  Object.assign(f.state.memories.get(memoryId)!, {
    lifecycle: "accepted",
    verification: "independently_verified",
  });
  const raw = envelope();
  raw.records[0]!.statement = "New exact wording";
  raw.records[0]!.sources[0]!.evidence.observedAt = "2026-10-16T02:00:00+01:00";
  const second = await f.service.apply(await f.reviewed(raw), "second");
  expect(second.record.records[0]).toMatchObject({
    action: "revised",
    memoryId,
    version: 2,
  });
  expect(f.state.memories.get(memoryId)).toMatchObject({
    lifecycle: "proposed",
    verification: "unverified",
    content: { statement: "New exact wording" },
  });
  expect(f.state.revisions.size).toBe(2);
  expect(f.state.aliases.size).toBe(1);
  expect(
    (
      await f.service.getRevision({
        projectId,
        id: first.record.records[0]!.importRevisionId,
      })
    ).memoryVersion,
  ).toBe(1);
});

it("rejects missing baselines, changed Knowledge targets, foreign aliases/heads/baselines and unavailable canonical source history", async () => {
  for (const mutation of [
    "baseline",
    "knowledge",
    "alias",
    "project",
    "baseline-project",
    "reference",
  ] as const) {
    const f = fixture();
    await f.service.apply(await f.reviewed(), "initial");
    const raw = envelope();
    const request = await f.reviewed(raw);
    if (mutation === "baseline") f.state.revisions.clear();
    if (mutation === "knowledge") {
      request.envelope.records[0]!.knowledgeItemId = id(88);
      request.reviewedSelections[0]!.selectionFingerprint =
        fingerprintMnemosyneSelection(request.envelope, "synthetic-0");
    }
    if (mutation === "alias")
      f.state.corruptExisting = (value) => ({
        ...value!,
        alias: { namespace: "foreign", externalId: "synthetic-0" },
      });
    if (mutation === "project")
      f.state.corruptExisting = (value) => ({
        ...value!,
        memory: { ...value!.memory, projectId: id(89) },
      });
    if (mutation === "baseline-project")
      f.state.corruptExisting = (value) => ({
        ...value!,
        baseline: { ...value!.baseline!, projectId: id(89) },
      });
    if (mutation === "reference") f.state.missingReference = true;
    const count = f.state.evidences.size;
    await rejected(f.service.apply(request, "reject"));
    expect(f.state.evidences.size).toBe(count);
  }
});

it("validates all selected heads and source references before writes and propagates late failures for whole-batch rollback", async () => {
  const preflight = fixture();
  const request = await preflight.reviewed(envelope(2));
  request.reviewedSelections[1]!.expectedExistingMemory = {
    id: id(99),
    version: 1,
    contentDigest: "a".repeat(64),
    knowledgeItemId,
  };
  await rejected(preflight.service.apply(request, "bad-head"));
  expect(preflight.state.events).not.toContain("evidence.insert");
  for (const failure of [
    "anchor",
    "baseline.insert",
    "receipt.persist",
  ] as const) {
    const f = fixture();
    f.state.lateFailure = failure;
    await rejected(f.service.apply(await f.reviewed(envelope(2)), "atomic"));
    expect(f.state.events).toContain("fake.rollback");
    expect(
      f.state.memories.size +
        f.state.evidences.size +
        f.state.revisions.size +
        f.state.originals.size +
        f.state.receipts.size,
    ).toBe(0);
  }
  const f = fixture();
  const insert = f.records.insertImportRevision;
  let count = 0;
  f.records.insertImportRevision = async (value) => {
    if (++count === 2) throw new FoundationError("INVALID_REFERENCE");
    return insert(value);
  };
  await rejected(
    f.service.apply(await f.reviewed(envelope(2)), "late-second-row"),
  );
  expect(
    f.state.memories.size + f.state.evidences.size + f.state.revisions.size,
  ).toBe(0);
});

it("rejects corrupt canonical writes and ordered provenance outputs inside the callback", async () => {
  for (const variant of [
    "evidence",
    "anchor",
    "revision",
    "sources",
  ] as const) {
    const f = fixture();
    if (variant === "evidence")
      f.state.corruptEvidence = (value) => ({
        ...value,
        locator: "wrong-valid-locator",
      });
    if (variant === "anchor") f.state.wrongAnchor = true;
    if (variant === "revision")
      f.state.corruptInsertion = (value) => ({
        ...value,
        revision: { ...value.revision, memoryVersion: 9 },
      });
    if (variant === "sources")
      f.state.corruptInsertion = (value) => ({
        ...value,
        sources: value.sources.slice(1),
      });
    await rejected(f.service.apply(await f.reviewed(envelope(1, 17)), "key"));
    expect(
      f.state.revisions.size + f.state.memories.size + f.state.evidences.size,
    ).toBe(0);
  }
});

it("binds every ordered receipt result to exact scope, principal, selections and expected head independently of storage integrity", async () => {
  for (const change of [
    "order",
    "fingerprint",
    "tier",
    "action",
    "version",
    "count",
    "scope",
    "principal",
    "extra",
  ] as const) {
    const f = fixture();
    const request = await f.reviewed(envelope(2));
    await f.service.apply(request, "key");
    const stored = f.state.receipts.get("key")!;
    const receipt = stored.value as {
      record: {
        records: Record<string, unknown>[];
        projectId: string;
        appliedBy: string;
      };
    };
    if (change === "order") receipt.record.records.reverse();
    if (change === "fingerprint")
      receipt.record.records[1]!.sourceFingerprint = "a".repeat(64);
    if (change === "tier") receipt.record.records[1]!.sourceTier = "public";
    if (change === "action") receipt.record.records[1]!.action = "unchanged";
    if (change === "version") receipt.record.records[1]!.version = 2;
    if (change === "count") receipt.record.records[1]!.sourceCount = 2;
    if (change === "scope") receipt.record.projectId = id(99);
    if (change === "principal") receipt.record.appliedBy = "foreign-owner";
    if (change === "extra")
      receipt.record.records[1]!.originalContent = "forbidden";
    // Re-sign the synthetic storage checksum to exercise application binding.
    stored.responseDigest = foundationDigest(stored.value);
    await rejected(f.service.apply(request, "key"));
  }
  const f = fixture();
  const request = await f.reviewed();
  await f.service.apply(request, "key");
  (
    f.state.receipts.get("key")!.value as { correlationId: string }
  ).correlationId = id(999);
  await rejected(f.service.apply(request, "key")); // Storage integrity protects opaque IDs/times.
});

it("requires complete contiguous owner-only original continuation and rejects corrupt metadata/pages", async () => {
  for (const change of [
    "gap",
    "short",
    "digest",
    "cursor",
    "project",
  ] as const) {
    const f = fixture();
    const result = await f.service.apply(
      await f.reviewed(envelope(1, 17)),
      "key",
    );
    f.state.corruptPage = (page) => {
      if (change === "gap") page.items[0]!.ordinal += 1;
      if (change === "short") page.items.pop();
      if (change === "digest") page.items[0]!.originalContent += "changed";
      if (change === "cursor") page.nextOrdinal = 14;
      if (change === "project") page.items[0]!.projectId = id(99);
      return page;
    };
    await rejected(
      f.service.listOriginalSources({
        projectId,
        revisionId: result.record.records[0]!.importRevisionId,
        limit: 13,
      }),
    );
  }
  const f = fixture();
  const result = await f.service.apply(await f.reviewed(), "key");
  const revisionId = result.record.records[0]!.importRevisionId;
  await rejected(f.service.getRevision({ projectId: id(99), id: revisionId }));
  await rejected(
    f.service.getRevision({ projectId, id: revisionId, originalContent: true }),
  );
  await rejected(
    f.service.listOriginalSources({ projectId, revisionId, fromOrdinal: 2 }),
  );
  expect(
    await f.service.listOriginalSources({
      projectId,
      revisionId,
      fromOrdinal: 1,
    }),
  ).toEqual({ items: [], nextOrdinal: null });
});

it("rechecks expiry at entry, all async source/write/receipt boundaries and after the outer adapter returns", async () => {
  for (const boundary of [
    "owner.enter",
    "existing:synthetic-0",
    "source.validate",
    "evidence.insert",
    "references",
    "anchor",
    "memory.save",
    "baseline.insert",
    "receipt.persist",
  ] as const) {
    const f = fixture();
    const request = await f.reviewed();
    f.state.at = boundary;
    await expect(f.service.apply(request, "key")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(f.state.events).toContain("fake.rollback");
    expect(
      f.state.memories.size +
        f.state.evidences.size +
        f.state.revisions.size +
        f.state.receipts.size,
    ).toBe(0);
  }
  const f = fixture();
  const request = await f.reviewed();
  f.state.afterCallback = () => {
    f.state.time = Date.parse(expiry);
  };
  await expect(f.service.apply(request, "key")).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  // An adapter that commits before its final expiry check cannot be rolled back
  // by the application's post-return delivery guard. Real DB proof belongs upstream.
  expect(f.state.events).toContain("owner.return");
});

it("snapshots trusted identity/options and raw requests and rejects repeated callbacks and substituted outer results", async () => {
  const f = fixture();
  const request = await f.reviewed();
  const pending = f.service.apply(request, "key");
  request.envelope.records[0]!.statement = "mutable caller data";
  f.identity.principalId = "changed-owner";
  f.identity.expiresAt = now;
  f.options.environment = "production" as "test";
  f.options.createId = () => id(999);
  const result = await pending;
  expect(result.record.appliedBy).toBe("synthetic-owner");
  expect([...f.state.memories.values()][0]!.content.statement).not.toBe(
    "mutable caller data",
  );
  for (const mode of ["repeat", "substitute"] as const) {
    const g = fixture();
    const input = await g.reviewed();
    if (mode === "repeat") g.state.repeatCallback = true;
    else
      g.state.substitute = (value) => ({
        ...(value as object),
        correlationId: id(999),
      });
    await rejected(g.service.apply(input, "key"));
  }
});

it("rejects malformed UTF8 strings, unavailable originals and aggregate/whole-request budgets without truncation", async () => {
  for (const kind of [
    "unicode",
    "unicode-key",
    "unavailable",
    "aggregate",
    "bytes",
    "records",
  ] as const) {
    const f = fixture();
    const raw =
      kind === "aggregate"
        ? envelope(2, 501)
        : kind === "records"
          ? envelope(1001)
          : envelope();
    if (kind === "unicode") {
      raw.records[0]!.sources[0]!.originalContent = "\ud800";
      raw.records[0]!.sources[0]!.evidence.contentDigest = digest("\ud800");
    }
    if (kind === "unicode-key") raw.records[0]!.externalId = "\udfff";
    if (kind === "unavailable") {
      raw.records[0]!.sources[0]!.originalContent = null;
      raw.records[0]!.sources[0]!.evidence.availability = "unavailable";
    }
    if (kind === "bytes") {
      const source = raw.records[0]!.sources[0]!;
      source.originalContent = "x".repeat(8 * 1024 * 1024);
      source.evidence.contentDigest = digest(source.originalContent);
    }
    if (kind === "unavailable") {
      const request = await f.reviewed(raw);
      await rejected(f.service.apply(request, "key"));
    } else await rejected(f.service.preview(raw));
    expect(f.state.evidences.size).toBe(0);
  }
});

it("rejects expired owner sessions on previews, writes and reads without repository entry", async () => {
  const f = fixture();
  const request = await f.reviewed();
  f.state.events.length = 0;
  f.state.time = Date.parse(expiry);
  await expect(f.service.preview(envelope())).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(f.service.apply(request, "key")).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    f.service.getRevision({ projectId, id: id(99) }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    f.service.listOriginalSources({ projectId, revisionId: id(99) }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.state.events).toEqual([]);
});

it("rejects nullable ordinal defaults and inconsistent immutable no-op review bindings", async () => {
  const f = fixture();
  const first = await f.service.apply(await f.reviewed(), "first");
  const revisionId = first.record.records[0]!.importRevisionId;
  for (const option of [{ fromOrdinal: null }, { limit: null }]) {
    await rejected(
      f.service.listOriginalSources({ projectId, revisionId, ...option }),
    );
  }
  const request = await f.reviewed();
  f.state.revisions.get(revisionId)!.selectionFingerprint = "a".repeat(64);
  await rejected(f.service.apply(request, "bad-baseline"));
  expect(f.state.revisions.size).toBe(1);
});
