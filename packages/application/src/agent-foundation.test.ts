import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import {
  foundationCreateClientSchema,
  foundationEvidenceInputSchema,
  foundationProposeMemorySchema,
  type FoundationActor,
  type FoundationClient,
  type FoundationConfiguration,
  type FoundationEvidence,
  type FoundationInstructionApproval,
  type FoundationMemory,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import {
  createFoundationMachineService,
  createFoundationOwnerService,
  type FoundationAccessPort,
  type FoundationAnchor,
  type FoundationIdentity,
  type FoundationMachineRequest,
  type FoundationOperationContext,
  type FoundationOwnerRequest,
  type FoundationRecordPort,
} from "./agent-foundation.js";

const id = (value: number) =>
  "00000000-0000-4000-8000-" + String(value).padStart(12, "0");
const projectId = id(1);
const evidenceId = id(2);
const memoryId = id(3);
const knowledgeItemId = id(4);
const clientId = id(5);
const parentId = id(6);
const otherProjectId = id(7);
const now = "2026-10-15T11:00:00.000Z";
const expiry = "2026-10-15T12:00:00.000Z";
const token = "af_" + "A".repeat(43);
const owner: FoundationIdentity = Object.freeze({
  principalId: "human:owner",
  expiresAt: expiry,
});
const machinePrincipal = "foundation-client:" + clientId;
const evidenceInput = Object.freeze({
  projectId,
  sourceKind: "knowledge_revision" as const,
  sourceId: knowledgeItemId,
  sourceVersion: "1",
  contentDigest: "a".repeat(64),
  locator: "knowledge:original",
  observedAt: null,
  availability: "available" as const,
});
const content = Object.freeze({
  statement: "An assertion backed by the original capture.",
  category: "finding" as const,
  evidenceIds: Object.freeze([evidenceId]),
  relatedMemoryIds: Object.freeze([] as string[]),
  relationType: null,
});
const proposal = Object.freeze({
  projectId,
  knowledgeItemId,
  content,
  alias: Object.freeze({ namespace: "agent", externalId: "stable-key" }),
});
const configurationInput = Object.freeze({
  projectId,
  kind: "skill" as const,
  content: "  # Skill\r\nCafé 🧪\n",
  parentIds: Object.freeze([parentId]),
  sourceCommit: null,
});

function memory(overrides: Partial<FoundationMemory> = {}): FoundationMemory {
  const contents = structuredClone(content);
  return {
    schemaVersion: 1,
    id: memoryId,
    projectId,
    knowledgeItemId,
    version: 1,
    contentDigest: foundationDigest(contents),
    content: {
      ...contents,
      evidenceIds: [...contents.evidenceIds],
      relatedMemoryIds: [...contents.relatedMemoryIds],
    },
    lifecycle: "proposed",
    verification: "unverified",
    recordedBy: machinePrincipal,
    recordedAt: now,
    ...overrides,
  };
}
function evidence(): FoundationEvidence {
  return {
    ...evidenceInput,
    schemaVersion: 1,
    id: evidenceId,
    ingestedAt: now,
    recordedBy: machinePrincipal,
    verification: "unverified",
  };
}
function configuration(): FoundationConfiguration {
  return {
    ...configurationInput,
    parentIds: [parentId],
    schemaVersion: 1,
    id: parentId,
    contentDigest: createHash("sha256")
      .update(configurationInput.content, "utf8")
      .digest("hex"),
    recordedBy: machinePrincipal,
    recordedAt: now,
  };
}
function code(expected: string) {
  return (error: unknown) =>
    error instanceof FoundationError && error.code === expected;
}

/** In-memory orchestration fake only. It proves no database locking, rollback,
 * isolation, atomic audits, concurrency or PostgreSQL idempotency guarantee. */
function fixture() {
  const state = {
    nowMilliseconds: Date.parse(now),
    sequence: 100,
    events: [] as string[],
    client: {
      schemaVersion: 1,
      id: clientId,
      projectId,
      name: "Machine",
      operations: [
        "foundation.read",
        "evidence.record",
        "memory.propose",
        "memory.revise",
        "configuration.record",
        "evaluation.record",
      ],
      environment: "test",
      createdAt: "2026-10-15T10:00:00.000Z",
      expiresAt: expiry,
      revokedAt: null,
      createdBy: owner.principalId,
    } as FoundationClient | null,
    memory: memory() as FoundationMemory | null,
    evidence: evidence() as FoundationEvidence | null,
    configuration: configuration() as FoundationConfiguration | null,
    anchor: {
      knowledgeItemId,
      knowledgeVersion: 1,
      evidenceId,
      sourceVersion: "1",
      contentDigest: evidenceInput.contentDigest,
      freshness: "fresh",
    } as FoundationAnchor,
    contradictions: false,
    referenceDenied: false,
    onClientEntry: undefined as (() => void) | undefined,
    onOwnerEntry: undefined as (() => void) | undefined,
    onRead: undefined as (() => void) | undefined,
    evidenceOutput: undefined as
      ((value: FoundationEvidence) => FoundationEvidence) | undefined,
    managementOutput: undefined as
      ((value: FoundationClient) => FoundationClient) | undefined,
    active: undefined as FoundationOperationContext | undefined,
    principal: "",
    clientRequests: [] as FoundationMachineRequest[],
    ownerRequests: [] as FoundationOwnerRequest[],
    assertions: [] as Parameters<FoundationRecordPort["assertReferences"]>[0][],
    evidenceReferences: [] as Parameters<
      FoundationRecordPort["validateEvidenceReference"]
    >[0][],
    anchors: [] as {
      knowledgeItemId: string;
      evidenceIds: readonly string[];
    }[],
    saves: [] as Parameters<FoundationRecordPort["saveMemory"]>[],
    reviews: [] as {
      actor: FoundationActor;
      at: string;
      input: Parameters<FoundationRecordPort["reviewMemory"]>[0];
    }[],
    verifications: [] as {
      actor: FoundationActor;
      at: string;
      input: Parameters<FoundationRecordPort["verifyMemory"]>[0];
    }[],
    approvals: [] as FoundationInstructionApproval[],
    idempotency: new Map<string, { digest: string; value: unknown }>(),
    digests: [] as { key: string; digest: string }[],
    issued: new Map<string, FoundationClient>(),
    issuances: [] as Parameters<FoundationAccessPort["issueClient"]>[0][],
    managementIdentities: [] as FoundationIdentity[],
  };
  const records: FoundationRecordPort = {
    async idempotent<T>(
      key: string,
      digest: string,
      perform: () => Promise<T>,
    ) {
      state.events.push("idempotent");
      state.digests.push({ key, digest });
      const scopedKey = foundationDigest({
        principal: state.principal,
        context: {
          operation: state.active!.operation,
          projectId: state.active!.projectId,
          environment: state.active!.environment,
        },
        key,
      });
      const stored = state.idempotency.get(scopedKey);
      if (stored) {
        if (stored.digest !== digest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        return { value: structuredClone(stored.value) as T, replayed: true };
      }
      const value = await perform();
      state.idempotency.set(scopedKey, {
        digest,
        value: structuredClone(value),
      });
      return { value, replayed: false };
    },
    async validateEvidenceReference(input) {
      state.events.push("evidence.reference");
      state.evidenceReferences.push(structuredClone(input));
      if (state.referenceDenied)
        throw new FoundationError("INVALID_REFERENCE", "Source is unavailable");
    },
    async assertReferences(input) {
      state.events.push("references");
      state.assertions.push(structuredClone(input));
      if (state.referenceDenied)
        throw new FoundationError(
          "INVALID_REFERENCE",
          "References are unavailable",
        );
    },
    async getEvidence() {
      state.events.push("evidence.get");
      state.onRead?.();
      return structuredClone(state.evidence);
    },
    async getMemory(_, lock) {
      state.events.push(lock ? "memory.lock" : "memory.get");
      state.onRead?.();
      return structuredClone(state.memory);
    },
    async getConfiguration() {
      state.events.push("configuration.get");
      state.onRead?.();
      return structuredClone(state.configuration);
    },
    async resolveMemoryAnchor(knowledge, ids) {
      state.events.push("anchor.resolve");
      state.anchors.push({ knowledgeItemId: knowledge, evidenceIds: [...ids] });
      return structuredClone(state.anchor);
    },
    async getMemoryAnchor() {
      state.events.push("anchor.get");
      return structuredClone(state.anchor);
    },
    async hasUnresolvedContradictions() {
      state.events.push("contradictions");
      return state.contradictions;
    },
    async insertEvidence(record) {
      state.events.push("evidence.insert");
      state.evidence = structuredClone(record);
      return (
        state.evidenceOutput?.(structuredClone(record)) ??
        structuredClone(record)
      );
    },
    async saveMemory(record, version, alias, anchor) {
      state.events.push("memory.save");
      state.saves.push(structuredClone([record, version, alias, anchor]));
      state.memory = structuredClone(record);
      return structuredClone(record);
    },
    async reviewMemory(input, actor, at) {
      state.events.push("memory.review");
      state.reviews.push(structuredClone({ input, actor, at }));
      state.memory = { ...state.memory!, lifecycle: input.decision };
      return structuredClone(state.memory);
    },
    async verifyMemory(input, actor, at) {
      state.events.push("memory.verify");
      state.verifications.push(structuredClone({ input, actor, at }));
      state.memory = { ...state.memory!, verification: input.verification };
      return structuredClone(state.memory);
    },
    async insertInstructionApproval(record) {
      state.events.push("approval.insert");
      state.approvals.push(structuredClone(record));
      return structuredClone(record);
    },
    async insertConfiguration(record) {
      state.events.push("configuration.insert");
      state.configuration = structuredClone(record);
      return structuredClone(record);
    },
  };
  const port: FoundationAccessPort = {
    async withClient(request, action) {
      state.events.push("client.enter");
      state.clientRequests.push(structuredClone(request));
      state.onClientEntry?.();
      if (!state.client)
        throw new FoundationError(
          "INVALID_CREDENTIAL",
          "Invalid foundation credential",
        );
      state.active = request;
      state.principal = "foundation-client:" + state.client.id;
      try {
        const value = await action(structuredClone(state.client), records);
        state.events.push("client.return");
        return value;
      } catch (error) {
        state.events.push("client.reject");
        throw error;
      }
    },
    async withOwner(request, action) {
      state.events.push("owner.enter");
      state.ownerRequests.push(structuredClone(request));
      state.onOwnerEntry?.();
      state.active = request;
      state.principal = request.principalId;
      try {
        const value = await action(records);
        state.events.push("owner.return");
        return value;
      } catch (error) {
        state.events.push("owner.reject");
        throw error;
      }
    },
    async issueClient(input) {
      state.events.push("client.issue");
      state.issuances.push(structuredClone(input));
      const prior = state.issued.get(
        input.identity.principalId + ":" + input.idempotencyKey,
      );
      if (prior) return { client: structuredClone(prior), created: false };
      state.issued.set(
        input.identity.principalId + ":" + input.idempotencyKey,
        structuredClone(input.client),
      );
      return {
        client:
          state.managementOutput?.(structuredClone(input.client)) ??
          structuredClone(input.client),
        created: true,
      };
    },
    async listClients(input, identity, environment, correlation) {
      state.events.push("client.list");
      state.managementIdentities.push(structuredClone(identity));
      assert.equal(environment, "test");
      assert.match(correlation, /^[a-f0-9-]{36}$/);
      return {
        items: [...state.issued.values()].map((client) =>
          structuredClone(client),
        ),
        nextCursor: clientId,
        asOf: input.asOf ?? now,
      };
    },
    async revokeClient(requestedId, identity, environment) {
      state.events.push("client.revoke");
      state.managementIdentities.push(structuredClone(identity));
      assert.equal(environment, "test");
      const current = [...state.issued.values()].find(
        (client) => client.id === requestedId,
      );
      if (!current)
        throw new FoundationError(
          "NOT_FOUND",
          "Foundation record is unavailable",
        );
      current.revokedAt ??= now;
      return structuredClone(current);
    },
  };
  const options = {
    environment: "test" as const,
    now: () => new Date(state.nowMilliseconds),
    createId: () => id(state.sequence++),
  };
  return {
    state,
    records,
    port,
    options,
    machine: createFoundationMachineService(port, options),
    owner: createFoundationOwnerService(port, owner, options),
  };
}

test("machine describes server authority separately from implemented operations", async () => {
  const f = fixture();
  const result = await f.machine.describe(token, projectId);
  assert.equal(result.actor.principalId, machinePrincipal);
  assert.equal(result.actor.clientId, clientId);
  assert.equal(result.actor.runId, null);
  assert.deepEqual(result.actor.resourceIds, []);
  assert.equal(result.actor.expiresAt, expiry);
  assert.equal(result.actor.environment, "test");
  assert.equal(result.actor.projectId, projectId);
  assert.deepEqual(result.actor.capabilities, f.state.client!.operations);
  assert.deepEqual(result.supportedOperations, [
    "foundation.read",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "configuration.record",
  ]);
  assert(
    !result.supportedOperations.includes(
      "evaluation.record" as "foundation.read",
    ),
  );
  assert.equal(
    f.state.clientRequests[0]!.tokenDigest,
    foundationTokenDigest(token),
  );
  assert(!JSON.stringify(f.state.clientRequests).includes(token));
  assert.deepEqual(f.state.events, ["client.enter", "client.return"]);
});

test("ck credentials and malformed keys never enter repository access", async () => {
  const f = fixture();
  await assert.rejects(
    () => f.machine.describe("ck_" + "A".repeat(43), projectId),
    code("INVALID_CREDENTIAL"),
  );
  assert.throws(() => f.machine.recordEvidence(token, evidenceInput, " key"));
  assert.throws(() => f.machine.recordEvidence(token, evidenceInput, "bad\n"));
  assert.deepEqual(f.state.events, []);
});

test("strict inputs reject missing scope and forged identity, verification, lifecycle and approvals", () => {
  const f = fixture();
  for (const extra of [
    { recordedBy: owner.principalId },
    { actor: { principalId: owner.principalId } },
    { runId: id(80) },
    { verification: "independently_verified" },
    { schemaVersion: 1 },
  ]) {
    assert.throws(() =>
      f.machine.recordEvidence(token, { ...evidenceInput, ...extra }, "key"),
    );
  }
  for (const extra of [
    { lifecycle: "accepted" },
    { approved: true },
    { recordedBy: owner.principalId },
  ])
    assert.throws(() =>
      f.machine.proposeMemory(token, { ...proposal, ...extra }, "key"),
    );
  assert.throws(() => f.machine.getMemory(token, { id: memoryId }));
  assert.throws(() =>
    f.machine.recordConfiguration(
      token,
      { ...configurationInput, contentDigest: "a".repeat(64) },
      "key",
    ),
  );
  assert.throws(() =>
    f.owner.reviewMemory(
      {
        projectId,
        memoryId,
        expectedVersion: 1,
        decision: "accepted",
        reason: "Reviewed",
        actor: owner,
      },
      "key",
    ),
  );
  assert.deepEqual(f.state.events, []);
});

for (const [name, change, expected] of [
  [
    "wrong project",
    (client: FoundationClient) => {
      client.projectId = otherProjectId;
    },
    "FORBIDDEN",
  ],
  [
    "wrong environment",
    (client: FoundationClient) => {
      client.environment = "production";
    },
    "FORBIDDEN",
  ],
  [
    "missing operation",
    (client: FoundationClient) => {
      client.operations = ["foundation.read"];
    },
    "FORBIDDEN",
  ],
  [
    "expired grant",
    (client: FoundationClient) => {
      client.expiresAt = now;
    },
    "EXPIRED",
  ],
  [
    "revoked grant",
    (client: FoundationClient) => {
      client.revokedAt = now;
    },
    "REVOKED",
  ],
] as const) {
  test(name + " denies before any record access", async () => {
    const f = fixture();
    change(f.state.client!);
    await assert.rejects(
      () => f.machine.recordEvidence(token, evidenceInput, "key"),
      code(expected),
    );
    assert.deepEqual(f.state.events, ["client.enter", "client.reject"]);
  });
}

test("unknown credentials have no record access", async () => {
  const f = fixture();
  f.state.client = null;
  await assert.rejects(
    () => f.machine.getEvidence(token, { projectId, id: evidenceId }),
    code("INVALID_CREDENTIAL"),
  );
  assert.deepEqual(f.state.events, ["client.enter"]);
});

test("grant is rechecked after the callback before transaction return", async () => {
  const f = fixture();
  f.state.onRead = () => {
    f.state.nowMilliseconds = Date.parse(expiry);
  };
  await assert.rejects(
    () => f.machine.getEvidence(token, { projectId, id: evidenceId }),
    code("EXPIRED"),
  );
  assert.equal(f.state.events.at(-1), "client.reject");
  assert(!f.state.events.includes("client.return"));
});

test("grant expiry is checked after repository entry acquires the lock", async () => {
  const f = fixture();
  f.state.onClientEntry = () => {
    f.state.nowMilliseconds = Date.parse(expiry);
  };
  await assert.rejects(
    () => f.machine.getEvidence(token, { projectId, id: evidenceId }),
    code("EXPIRED"),
  );
  assert(!f.state.events.includes("evidence.get"));
});

test("evidence has server provenance, exact request digest and immutable frozen input", async () => {
  const f = fixture();
  const result = await f.machine.recordEvidence(
    token,
    evidenceInput,
    "evidence-key",
  );
  assert.equal(result.record.recordedBy, machinePrincipal);
  assert.equal(result.record.ingestedAt, now);
  assert.equal(result.record.schemaVersion, 1);
  assert.equal(result.record.verification, "unverified");
  assert.equal(result.replayed, false);
  assert.equal(result.correlationId, f.state.clientRequests[0]!.correlationId);
  assert.deepEqual(f.state.evidenceReferences, [evidenceInput]);
  assert.equal(
    f.state.digests[0]!.digest,
    foundationDigest({
      operation: "evidence.record",
      projectId,
      environment: "test",
      input: foundationEvidenceInputSchema.parse(evidenceInput),
    }),
  );
  assert.deepEqual(f.state.events, [
    "client.enter",
    "idempotent",
    "evidence.reference",
    "evidence.insert",
    "client.return",
  ]);
  assert(Object.isFrozen(evidenceInput));
});

test("external and artifact evidence stays unverified without a fetch", async () => {
  for (const sourceKind of ["external", "artifact"] as const) {
    const f = fixture();
    const result = await f.machine.recordEvidence(
      token,
      Object.freeze({
        ...evidenceInput,
        sourceKind,
        sourceId: "source-owned-id",
        locator: "https://example.invalid/private",
      }),
      "key",
    );
    assert.equal(result.record.verification, "unverified");
    assert.equal(f.state.evidenceReferences[0]!.sourceKind, sourceKind);
    assert.equal(
      f.state.events.filter((event) => event === "evidence.insert").length,
      1,
    );
  }
});

test("idempotent replay keeps original record and correlation despite changed server time", async () => {
  const f = fixture();
  const first = await f.machine.recordEvidence(token, evidenceInput, "key");
  first.record.recordedBy = "caller-mutated-response";
  f.state.nowMilliseconds += 1000;
  const second = await f.machine.recordEvidence(token, evidenceInput, "key");
  assert.equal(second.replayed, true);
  assert.equal(second.record.recordedBy, machinePrincipal);
  assert.equal(second.record.ingestedAt, now);
  assert.equal(second.correlationId, first.correlationId);
  assert.equal(
    f.state.events.filter((event) => event === "evidence.insert").length,
    1,
  );
  await assert.rejects(
    () =>
      f.machine.recordEvidence(
        token,
        { ...evidenceInput, locator: "changed" },
        "key",
      ),
    code("IDEMPOTENCY_CONFLICT"),
  );
});

test("canonical reference rejection stops writes without exposing project identities", async () => {
  const f = fixture();
  f.state.referenceDenied = true;
  await assert.rejects(
    () => f.machine.recordEvidence(token, evidenceInput, "key"),
    code("INVALID_REFERENCE"),
  );
  await assert.rejects(
    () => f.machine.proposeMemory(token, proposal, "key"),
    code("INVALID_REFERENCE"),
  );
  await assert.rejects(
    () => f.machine.recordConfiguration(token, configurationInput, "key"),
    code("INVALID_REFERENCE"),
  );
  assert(!f.state.events.includes("evidence.insert"));
  assert(!f.state.events.includes("memory.save"));
  assert(!f.state.events.includes("configuration.insert"));
});

test("proposals bind canonical Knowledge evidence and all related references before mutation", async () => {
  const f = fixture();
  const input = Object.freeze({
    ...proposal,
    content: Object.freeze({
      ...content,
      relatedMemoryIds: Object.freeze([id(70)]),
      relationType: "supersedes",
    }),
  });
  const result = await f.machine.proposeMemory(token, input, "key");
  assert.equal(result.record.lifecycle, "proposed");
  assert.equal(result.record.verification, "unverified");
  assert.equal(result.record.version, 1);
  assert.equal(result.record.knowledgeItemId, knowledgeItemId);
  assert.equal(result.record.recordedBy, machinePrincipal);
  assert.equal(result.record.contentDigest, foundationDigest(input.content));
  assert.deepEqual(f.state.assertions, [
    { evidenceIds: [evidenceId], memoryIds: [id(70)], configurationIds: [] },
  ]);
  assert.deepEqual(f.state.anchors, [
    { knowledgeItemId, evidenceIds: [evidenceId] },
  ]);
  assert.equal(f.state.saves[0]![1], null);
  assert.deepEqual(f.state.saves[0]![2], proposal.alias);
  assert.deepEqual(f.state.saves[0]![3], f.state.anchor);
  assert.deepEqual(f.state.events.slice(1, 5), [
    "idempotent",
    "references",
    "anchor.resolve",
    "memory.save",
  ]);
  assert.equal(f.state.reviews.length, 0);
  assert.equal(f.state.approvals.length, 0);
  assert.equal(
    f.state.digests[0]!.digest,
    foundationDigest({
      operation: "memory.propose",
      projectId,
      environment: "test",
      input: foundationProposeMemorySchema.parse(input),
    }),
  );
});

test("unrelated or unlinked source anchors are rejected before memory save", async () => {
  for (const anchor of [
    { knowledgeItemId: id(60) },
    { evidenceId: id(61) },
    { knowledgeVersion: 0 },
  ]) {
    const f = fixture();
    Object.assign(f.state.anchor, anchor);
    await assert.rejects(
      () => f.machine.proposeMemory(token, proposal, "key"),
      code("INVALID_REFERENCE"),
    );
    assert.equal(f.state.saves.length, 0);
  }
});

test("revisions lock expected version, reset review/verification and replay before lookup", async () => {
  const f = fixture();
  f.state.memory = memory({
    lifecycle: "accepted",
    verification: "independently_verified",
  });
  const input = Object.freeze({
    projectId,
    memoryId,
    expectedVersion: 1,
    content,
  });
  const result = await f.machine.reviseMemory(token, input, "revision");
  assert.equal(result.record.id, memoryId);
  assert.equal(result.record.knowledgeItemId, knowledgeItemId);
  assert.equal(result.record.version, 2);
  assert.equal(result.record.lifecycle, "proposed");
  assert.equal(result.record.verification, "unverified");
  assert.equal(result.record.contentDigest, foundationDigest(content));
  assert.equal(f.state.saves[0]![1], 1);
  assert.equal(f.state.saves[0]![2], null);
  assert.equal(f.state.approvals.length, 0);
  assert.deepEqual(f.state.events.slice(1, 6), [
    "idempotent",
    "memory.lock",
    "references",
    "anchor.resolve",
    "memory.save",
  ]);
  f.state.memory = memory({ version: 90, lifecycle: "rejected" });
  const replay = await f.machine.reviseMemory(token, input, "revision");
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, result.record);
  assert.equal(
    f.state.events.filter((event) => event === "memory.lock").length,
    1,
  );
  await assert.rejects(
    () => f.machine.reviseMemory(token, input, "fresh-key"),
    code("VERSION_CONFLICT"),
  );
  assert.equal(f.state.saves.length, 1);
});

test("revision cannot bind a stale canonical source anchor", async () => {
  const f = fixture();
  f.state.anchor.freshness = "stale";
  await assert.rejects(
    () =>
      f.machine.reviseMemory(
        token,
        { projectId, memoryId, expectedVersion: 1, content },
        "key",
      ),
    code("INVALID_REFERENCE"),
  );
  assert.equal(f.state.saves.length, 0);
});

test("configuration digest hashes exact UTF-8 bytes and all parent references", async () => {
  const f = fixture();
  const result = await f.machine.recordConfiguration(
    token,
    configurationInput,
    "key",
  );
  assert.equal(result.record.content, configurationInput.content);
  assert.equal(
    result.record.contentDigest,
    createHash("sha256")
      .update(configurationInput.content, "utf8")
      .digest("hex"),
  );
  assert.notEqual(
    result.record.contentDigest,
    foundationDigest(configurationInput.content),
  );
  assert.equal(result.record.recordedBy, machinePrincipal);
  assert.deepEqual(f.state.assertions, [
    { evidenceIds: [], memoryIds: [], configurationIds: [parentId] },
  ]);
});

test("exact reads preserve historical anchor freshness and generic missing/scope errors", async () => {
  const f = fixture();
  f.state.anchor.freshness = "stale";
  f.state.memory!.lifecycle = "accepted";
  const result = await f.machine.getMemory(
    token,
    Object.freeze({ projectId, id: memoryId }),
  );
  assert.equal(result.memory.lifecycle, "accepted");
  assert.equal(result.anchor.freshness, "stale");
  assert(f.state.events.includes("memory.get"));
  assert(!f.state.events.includes("memory.lock"));
  assert.equal(
    (await f.machine.getEvidence(token, { projectId, id: evidenceId })).id,
    evidenceId,
  );
  assert.equal(
    (await f.machine.getConfiguration(token, { projectId, id: parentId })).id,
    parentId,
  );
  f.state.evidence = null;
  await assert.rejects(
    () => f.machine.getEvidence(token, { projectId, id: evidenceId }),
    code("NOT_FOUND"),
  );
  f.state.evidence = { ...evidence(), projectId: otherProjectId };
  await assert.rejects(
    () => f.machine.getEvidence(token, { projectId, id: evidenceId }),
    (error: unknown) =>
      code("NOT_FOUND")(error) &&
      !(error as Error).message.includes(otherProjectId),
  );
  f.state.memory = null;
  await assert.rejects(
    () => f.machine.getMemory(token, { projectId, id: memoryId }),
    code("NOT_FOUND"),
  );
  f.state.configuration = { ...configuration(), id: id(99) };
  await assert.rejects(
    () => f.machine.getConfiguration(token, { projectId, id: parentId }),
    code("NOT_FOUND"),
  );
});

test("malformed insert and stored replay outputs fail before transaction returns", async () => {
  const f = fixture();
  f.state.evidenceOutput = (record) => ({
    ...record,
    unexpectedSecret: "not-public",
  });
  await assert.rejects(() =>
    f.machine.recordEvidence(token, evidenceInput, "key"),
  );
  assert(!f.state.events.includes("client.return"));
  assert.equal(f.state.idempotency.size, 0);
  f.state.evidenceOutput = undefined;
  await f.machine.recordEvidence(token, evidenceInput, "key");
  const stored = [...f.state.idempotency.values()][0]!;
  (stored.value as { record: FoundationEvidence }).record.id = "invalid";
  f.state.events.length = 0;
  await assert.rejects(() =>
    f.machine.recordEvidence(token, evidenceInput, "key"),
  );
  assert(!f.state.events.includes("client.return"));
});

test("valid but changed adapter output is rejected inside transaction", async () => {
  const f = fixture();
  f.state.evidenceOutput = (record) => ({
    ...record,
    verification: "source_matched",
  });
  await assert.rejects(
    () => f.machine.recordEvidence(token, evidenceInput, "key"),
    code("INVALID_REFERENCE"),
  );
  assert(!f.state.events.includes("client.return"));
});

test("owner review and verification are independent version-guarded owner operations", async () => {
  const f = fixture();
  const reviewed = await f.owner.reviewMemory(
    Object.freeze({
      projectId,
      memoryId,
      expectedVersion: 1,
      decision: "accepted",
      reason: "Owner reviewed the assertion",
    }),
    "review",
  );
  assert.equal(reviewed.record.lifecycle, "accepted");
  assert.equal(reviewed.record.verification, "unverified");
  assert.equal(f.state.reviews[0]!.actor.principalId, owner.principalId);
  assert.equal(f.state.reviews[0]!.actor.clientId, null);
  assert.equal(f.state.reviews[0]!.actor.runId, null);
  assert.equal(f.state.reviews[0]!.actor.expiresAt, expiry);
  assert.equal(f.state.reviews[0]!.at, now);
  assert.equal(f.state.ownerRequests[0]!.principalId, owner.principalId);
  assert.equal(f.state.ownerRequests[0]!.expiresAt, expiry);
  const verified = await f.owner.verifyMemory(
    Object.freeze({
      projectId,
      memoryId,
      expectedVersion: 1,
      verification: "source_matched",
      evidenceIds: Object.freeze([evidenceId]),
      reason: "Matched original source only",
    }),
    "verify",
  );
  assert.equal(verified.record.lifecycle, "accepted");
  assert.equal(verified.record.verification, "source_matched");
  assert.deepEqual(f.state.assertions[0], {
    evidenceIds: [evidenceId],
    memoryIds: [],
    configurationIds: [],
  });
  const rejected = await f.owner.reviewMemory(
    {
      projectId,
      memoryId,
      expectedVersion: 1,
      decision: "rejected",
      reason: "No longer accepted",
    },
    "reject",
  );
  assert.equal(rejected.record.verification, "source_matched");
  assert.equal(f.state.reviews[1]!.input.decision, "rejected");
  assert.equal(f.state.approvals.length, 0);
  await assert.rejects(
    () =>
      f.owner.verifyMemory(
        {
          projectId,
          memoryId,
          expectedVersion: 2,
          verification: "independently_verified",
          evidenceIds: [evidenceId],
          reason: "Wrong version",
        },
        "wrong",
      ),
    code("VERSION_CONFLICT"),
  );
  assert.equal(f.state.verifications.length, 1);
  assert.equal("reviewMemory" in f.machine, false);
  assert.equal("approveInstruction" in f.machine, false);
});

function instructionFixture() {
  const f = fixture();
  const instructionContent = {
    ...f.state.memory!.content,
    category: "instruction" as const,
  };
  f.state.memory = memory({
    content: instructionContent,
    contentDigest: foundationDigest(instructionContent),
    lifecycle: "accepted",
  });
  const input = Object.freeze({
    projectId,
    memoryId,
    expectedVersion: 1,
    contentDigest: f.state.memory.contentDigest,
    disclosureProjectId: projectId,
    expiresAt: expiry,
  });
  return { ...f, input };
}

test("instruction approval is separate exact immutable owner-bound history", async () => {
  const f = instructionFixture();
  const before = structuredClone(f.state.memory);
  const result = await f.owner.approveInstruction(f.input, "approval");
  assert.equal(result.record.version, 1);
  assert.equal(result.record.memoryId, memoryId);
  assert.equal(result.record.contentDigest, f.input.contentDigest);
  assert.equal(result.record.projectId, projectId);
  assert.equal(result.record.disclosureProjectId, projectId);
  assert.equal(result.record.expiresAt, expiry);
  assert.equal(result.record.approvedBy, owner.principalId);
  assert.equal(result.record.approvedAt, now);
  assert.equal(result.record.revokedAt, null);
  assert.deepEqual(f.state.memory, before);
  assert.equal("approved" in f.state.memory!, false);
  assert.deepEqual(f.state.events.slice(1, -1), [
    "idempotent",
    "memory.lock",
    "contradictions",
    "anchor.get",
    "approval.insert",
  ]);
  const replay = await f.owner.approveInstruction(f.input, "approval");
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.record, result.record);
  assert.equal(f.state.approvals.length, 1);
});

for (const [name, change, expected] of [
  [
    "proposed",
    (f: ReturnType<typeof instructionFixture>) => {
      f.state.memory!.lifecycle = "proposed";
    },
    "FORBIDDEN",
  ],
  [
    "finding",
    (f: ReturnType<typeof instructionFixture>) => {
      f.state.memory = memory({ lifecycle: "accepted" });
    },
    "APPROVAL_REQUIRED",
  ],
  [
    "contradictory",
    (f: ReturnType<typeof instructionFixture>) => {
      f.state.contradictions = true;
    },
    "FORBIDDEN",
  ],
  [
    "stale",
    (f: ReturnType<typeof instructionFixture>) => {
      f.state.anchor.freshness = "stale";
    },
    "INVALID_REFERENCE",
  ],
  [
    "unknown freshness",
    (f: ReturnType<typeof instructionFixture>) => {
      f.state.anchor.freshness = "unknown";
    },
    "INVALID_REFERENCE",
  ],
  [
    "tampered content digest",
    (f: ReturnType<typeof instructionFixture>) => {
      f.state.memory!.contentDigest = "b".repeat(64);
    },
    "APPROVAL_REQUIRED",
  ],
] as const) {
  test(name + " instruction cannot be approved", async () => {
    const f = instructionFixture();
    change(f);
    await assert.rejects(
      () => f.owner.approveInstruction(f.input, "key"),
      code(expected),
    );
    assert.equal(f.state.approvals.length, 0);
    assert(!f.state.events.includes("owner.return"));
  });
}

for (const [name, input, expected] of [
  ["wrong version", { expectedVersion: 2 }, "VERSION_CONFLICT"],
  ["wrong digest", { contentDigest: "c".repeat(64) }, "APPROVAL_REQUIRED"],
  [
    "cross-project disclosure",
    { disclosureProjectId: otherProjectId },
    "APPROVAL_REQUIRED",
  ],
  ["expired", { expiresAt: now }, "APPROVAL_REQUIRED"],
] as const) {
  test(name + " approval input is denied", async () => {
    const f = instructionFixture();
    await assert.rejects(
      () => f.owner.approveInstruction({ ...f.input, ...input }, "key"),
      code(expected),
    );
    assert.equal(f.state.approvals.length, 0);
  });
}

test("revision never transfers instruction approval", async () => {
  const f = instructionFixture();
  const approval = await f.owner.approveInstruction(f.input, "approval");
  const revised = await f.machine.reviseMemory(
    token,
    {
      projectId,
      memoryId,
      expectedVersion: 1,
      content: f.state.memory!.content,
    },
    "revision",
  );
  assert.equal(revised.record.version, 2);
  assert.equal(revised.record.lifecycle, "proposed");
  assert.equal(f.state.approvals[0]!.version, 1);
  assert.equal(f.state.approvals.length, 1);
  assert.equal(approval.record.version, 1);
  await assert.rejects(
    () =>
      f.owner.approveInstruction({ ...f.input, expectedVersion: 2 }, "another"),
    code("FORBIDDEN"),
  );
});

test("expired, blank or invalid owner sessions deny all operations without repository access", async () => {
  for (const identity of [
    { ...owner, expiresAt: now },
    { ...owner, principalId: " " },
    { ...owner, expiresAt: "invalid" },
  ]) {
    const f = fixture();
    const service = createFoundationOwnerService(f.port, identity, f.options);
    await assert.rejects(
      () =>
        service.createClient(
          {
            name: "Machine",
            projectId,
            operations: ["foundation.read"],
            environment: "test",
            ttlSeconds: 60,
          },
          "key",
        ),
      code("FORBIDDEN"),
    );
    await assert.rejects(
      () => service.listClients({ projectId }),
      code("FORBIDDEN"),
    );
    await assert.rejects(
      () => service.revokeClient({ clientId }),
      code("FORBIDDEN"),
    );
    await assert.rejects(
      () =>
        service.reviewMemory(
          {
            projectId,
            memoryId,
            expectedVersion: 1,
            decision: "accepted",
            reason: "Owner review",
          },
          "key",
        ),
      code("FORBIDDEN"),
    );
    assert.deepEqual(f.state.events, []);
  }
});

test("owner session is rechecked after lock and before transaction return", async () => {
  const f = fixture();
  f.state.onOwnerEntry = () => {
    f.state.nowMilliseconds = Date.parse(expiry);
  };
  const input = {
    projectId,
    memoryId,
    expectedVersion: 1,
    decision: "accepted",
    reason: "Review",
  };
  await assert.rejects(
    () => f.owner.reviewMemory(input, "key"),
    code("FORBIDDEN"),
  );
  assert(!f.state.events.includes("memory.lock"));
  const g = fixture();
  g.state.onRead = () => {
    g.state.nowMilliseconds = Date.parse(expiry);
  };
  await assert.rejects(
    () => g.owner.reviewMemory(input, "key"),
    code("FORBIDDEN"),
  );
  assert(!g.state.events.includes("owner.return"));
});

const clientInput = Object.freeze({
  name: "  Machine  ",
  projectId,
  operations: Object.freeze(["foundation.read"]),
  environment: "test",
  ttlSeconds: 60,
});

test("owner issuance returns secret once and persists only its exact digest", async () => {
  const f = fixture();
  const issued = await f.owner.createClient(clientInput, "issue");
  assert.match(issued.token, /^af_[A-Za-z0-9_-]{43}$/);
  assert.equal(issued.client.name, "Machine");
  assert.equal(issued.client.createdBy, owner.principalId);
  assert.equal(issued.client.createdAt, now);
  assert.equal(issued.client.expiresAt, "2026-10-15T11:01:00.000Z");
  assert.equal(issued.client.revokedAt, null);
  assert.equal(
    f.state.issuances[0]!.tokenDigest,
    foundationTokenDigest(issued.token),
  );
  assert(!JSON.stringify(f.state.issuances).includes(issued.token));
  assert.deepEqual(f.state.issuances[0]!.identity, owner);
  assert.equal(
    f.state.issuances[0]!.requestDigest,
    foundationDigest({
      operation: "foundation.client.create",
      projectId,
      environment: "test",
      input: foundationCreateClientSchema.parse(clientInput),
    }),
  );
  await assert.rejects(
    () => f.owner.createClient(clientInput, "issue"),
    (error: unknown) =>
      code("IDEMPOTENCY_CONFLICT")(error) &&
      !(error as Error).message.includes(issued.token),
  );
  assert.equal(f.state.issued.size, 1);
  const another = await f.owner.createClient(clientInput, "new-key");
  assert.notEqual(another.client.id, issued.client.id);
  assert.notEqual(another.token, issued.token);
});

test("owner list continuation and repeated revoke return public metadata only", async () => {
  const f = fixture();
  const issued = await f.owner.createClient(clientInput, "key");
  const page = await f.owner.listClients(
    Object.freeze({ projectId, limit: 1, after: clientId, asOf: now }),
  );
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor, clientId);
  assert.equal(page.asOf, now);
  assert(!JSON.stringify(page).includes(issued.token));
  assert(!JSON.stringify(page).includes(foundationTokenDigest(issued.token)));
  const first = await f.owner.revokeClient(
    Object.freeze({ clientId: issued.client.id }),
  );
  f.state.nowMilliseconds += 1000;
  const second = await f.owner.revokeClient({ clientId: issued.client.id });
  assert.deepEqual(second, first);
  assert.equal(first.revokedAt, now);
  assert(
    f.state.managementIdentities.every(
      (identity) =>
        identity.expiresAt === expiry &&
        identity.principalId === owner.principalId,
    ),
  );
});

test("owner environment mismatch and forged issuance metadata never reach persistence", async () => {
  const f = fixture();
  await assert.rejects(
    () =>
      f.owner.createClient(
        { ...clientInput, environment: "production" },
        "key",
      ),
    code("FORBIDDEN"),
  );
  await assert.rejects(() =>
    f.owner.createClient({ ...clientInput, createdBy: "forged" }, "key"),
  );
  assert.deepEqual(f.state.events, []);
});

test("owner issuance requires exact returned metadata and prevalidates server IDs", async () => {
  const f = fixture();
  f.state.managementOutput = (client) => ({ ...client, name: "different" });
  await assert.rejects(
    () => f.owner.createClient(clientInput, "key"),
    code("INVALID_REFERENCE"),
  );
  const g = fixture();
  const bad = createFoundationOwnerService(g.port, owner, {
    ...g.options,
    createId: () => "invalid",
  });
  await assert.rejects(() => bad.createClient(clientInput, "key"));
  assert.deepEqual(g.state.events, []);
});

test("invalid owner record outputs fail inside the owner transaction callback", async () => {
  const f = fixture();
  f.records.reviewMemory = async () => ({
    ...memory(),
    lifecycle: "accepted",
    verification: "independently_verified",
  });
  await assert.rejects(
    () =>
      f.owner.reviewMemory(
        {
          projectId,
          memoryId,
          expectedVersion: 1,
          decision: "accepted",
          reason: "Review",
        },
        "key",
      ),
    code("INVALID_REFERENCE"),
  );
  assert(!f.state.events.includes("owner.return"));
});

async function rejectChangedReceipt<T extends object>(
  f: ReturnType<typeof fixture>,
  write: () => Promise<{ record: T }>,
  change: (record: T) => void,
) {
  await write();
  const cached = [...f.state.idempotency.values()].at(-1)!.value as {
    record: T;
  };
  change(cached.record);
  f.state.events.length = 0;
  await assert.rejects(write, code("INVALID_REFERENCE"));
  const subject = f.state.events[0] === "client.enter" ? "client" : "owner";
  assert.deepEqual(f.state.events, [
    subject + ".enter",
    "idempotent",
    subject + ".reject",
  ]);
}

for (const [name, change] of [
  [
    "locator",
    (record: FoundationEvidence) => {
      record.locator = "different-valid-locator";
    },
  ],
  [
    "verification",
    (record: FoundationEvidence) => {
      record.verification = "independently_verified";
    },
  ],
  [
    "source identity",
    (record: FoundationEvidence) => {
      record.sourceId = id(900);
    },
  ],
  [
    "principal",
    (record: FoundationEvidence) => {
      record.recordedBy = "foundation-client:" + id(901);
    },
  ],
] as const) {
  test(
    "cached evidence binds request " + name + " inside authorization",
    async () => {
      const f = fixture();
      await rejectChangedReceipt(
        f,
        () => f.machine.recordEvidence(token, evidenceInput, "key"),
        change,
      );
    },
  );
}

test("valid-shape cached configuration content and digest must match requested bytes", async () => {
  const f = fixture();
  await rejectChangedReceipt(
    f,
    () => f.machine.recordConfiguration(token, configurationInput, "key"),
    (record) => {
      record.content = "Different valid content";
      record.contentDigest = createHash("sha256")
        .update(record.content, "utf8")
        .digest("hex");
    },
  );
});

test("cached configuration binds parents, kind and principal", async () => {
  for (const change of [
    (record: FoundationConfiguration) => {
      record.parentIds = [id(903)];
    },
    (record: FoundationConfiguration) => {
      record.kind = "hook";
    },
    (record: FoundationConfiguration) => {
      record.recordedBy = "other-principal";
    },
  ]) {
    const f = fixture();
    await rejectChangedReceipt(
      f,
      () => f.machine.recordConfiguration(token, configurationInput, "key"),
      change,
    );
  }
});

test("cached proposals bind canonical Knowledge and full requested content", async () => {
  for (const change of [
    (record: FoundationMemory) => {
      record.knowledgeItemId = id(904);
    },
    (record: FoundationMemory) => {
      record.content.statement = "Different valid assertion";
      record.contentDigest = foundationDigest(record.content);
    },
    (record: FoundationMemory) => {
      record.version = 2;
    },
    (record: FoundationMemory) => {
      record.lifecycle = "accepted";
    },
    (record: FoundationMemory) => {
      record.verification = "source_matched";
    },
    (record: FoundationMemory) => {
      record.recordedBy = "other-principal";
    },
  ]) {
    const f = fixture();
    await rejectChangedReceipt(
      f,
      () => f.machine.proposeMemory(token, proposal, "key"),
      change,
    );
  }
});

test("cached revisions bind target, exact next version, content and machine attribution", async () => {
  for (const change of [
    (record: FoundationMemory) => {
      record.id = id(905);
    },
    (record: FoundationMemory) => {
      record.version = 3;
    },
    (record: FoundationMemory) => {
      record.content.statement = "Different valid revision";
      record.contentDigest = foundationDigest(record.content);
    },
    (record: FoundationMemory) => {
      record.lifecycle = "accepted";
    },
    (record: FoundationMemory) => {
      record.verification = "independently_verified";
    },
    (record: FoundationMemory) => {
      record.recordedBy = "other-principal";
    },
  ]) {
    const f = fixture();
    await rejectChangedReceipt(
      f,
      () =>
        f.machine.reviseMemory(
          token,
          { projectId, memoryId, expectedVersion: 1, content },
          "key",
        ),
      change,
    );
  }
});

test("cached reviews bind target/version/decision without reading current verification", async () => {
  for (const change of [
    (record: FoundationMemory) => {
      record.id = id(906);
    },
    (record: FoundationMemory) => {
      record.version = 2;
    },
    (record: FoundationMemory) => {
      record.lifecycle = "rejected";
    },
  ]) {
    const f = fixture();
    await rejectChangedReceipt(
      f,
      () =>
        f.owner.reviewMemory(
          {
            projectId,
            memoryId,
            expectedVersion: 1,
            decision: "accepted",
            reason: "Original review",
          },
          "key",
        ),
      change,
    );
  }
  const f = fixture();
  const input = Object.freeze({
    projectId,
    memoryId,
    expectedVersion: 1,
    decision: "accepted",
    reason: "Original review",
  });
  const first = await f.owner.reviewMemory(input, "key");
  f.state.memory!.verification = "independently_verified";
  f.state.memory!.lifecycle = "rejected";
  f.state.events.length = 0;
  const replay = await f.owner.reviewMemory(input, "key");
  assert.deepEqual(replay.record, first.record);
  assert.equal(replay.record.verification, "unverified");
  assert.equal(replay.record.lifecycle, "accepted");
  assert.deepEqual(f.state.events, [
    "owner.enter",
    "idempotent",
    "owner.return",
  ]);
});

test("cached verification binds target/version/result while preserving original lifecycle", async () => {
  for (const change of [
    (record: FoundationMemory) => {
      record.id = id(907);
    },
    (record: FoundationMemory) => {
      record.version = 2;
    },
    (record: FoundationMemory) => {
      record.verification = "independently_verified";
    },
  ]) {
    const f = fixture();
    await rejectChangedReceipt(
      f,
      () =>
        f.owner.verifyMemory(
          {
            projectId,
            memoryId,
            expectedVersion: 1,
            verification: "source_matched",
            evidenceIds: [evidenceId],
            reason: "Source match only",
          },
          "key",
        ),
      change,
    );
  }
  const f = fixture();
  const input = Object.freeze({
    projectId,
    memoryId,
    expectedVersion: 1,
    verification: "source_matched",
    evidenceIds: Object.freeze([evidenceId]),
    reason: "Source match only",
  });
  const first = await f.owner.verifyMemory(input, "key");
  f.state.memory!.lifecycle = "accepted";
  f.state.memory!.verification = "independently_verified";
  f.state.events.length = 0;
  const replay = await f.owner.verifyMemory(input, "key");
  assert.deepEqual(replay.record, first.record);
  assert.equal(replay.record.lifecycle, "proposed");
  assert.equal(replay.record.verification, "source_matched");
  assert.deepEqual(f.state.events, [
    "owner.enter",
    "idempotent",
    "owner.return",
  ]);
});

test("cached approvals bind target/version/digest/disclosure/expiry/owner", async () => {
  for (const change of [
    (record: FoundationInstructionApproval) => {
      record.memoryId = id(908);
    },
    (record: FoundationInstructionApproval) => {
      record.version = 2;
    },
    (record: FoundationInstructionApproval) => {
      record.contentDigest = "e".repeat(64);
    },
    (record: FoundationInstructionApproval) => {
      record.projectId = otherProjectId;
      record.disclosureProjectId = otherProjectId;
    },
    (record: FoundationInstructionApproval) => {
      record.expiresAt = "2026-10-15T12:30:00.000Z";
    },
    (record: FoundationInstructionApproval) => {
      record.approvedBy = "other-owner";
    },
  ]) {
    const f = instructionFixture();
    await f.owner.approveInstruction(f.input, "key");
    const cached = [...f.state.idempotency.values()].at(-1)!.value as {
      record: FoundationInstructionApproval;
    };
    change(cached.record);
    f.state.events.length = 0;
    await assert.rejects(
      () => f.owner.approveInstruction(f.input, "key"),
      code(
        cached.record.projectId === projectId
          ? "INVALID_REFERENCE"
          : "NOT_FOUND",
      ),
    );
    assert.deepEqual(f.state.events, [
      "owner.enter",
      "idempotent",
      "owner.reject",
    ]);
  }
});

test("operation output binding also rejects incorrect new idempotency results", async () => {
  const f = fixture();
  f.records.idempotent = async <T>() => ({
    value: {
      record: { ...evidence(), locator: "changed-valid-locator" },
      correlationId: id(999),
    } as T,
    replayed: false,
  });
  await assert.rejects(
    () => f.machine.recordEvidence(token, evidenceInput, "key"),
    code("INVALID_REFERENCE"),
  );
  assert(!f.state.events.includes("client.return"));
});

test("approval expiry crossed during asynchronous source eligibility denies before insertion", async () => {
  const f = instructionFixture();
  f.records.getMemoryAnchor = async () => {
    f.state.nowMilliseconds = Date.parse(now) + 2000;
    return structuredClone(f.state.anchor);
  };
  await assert.rejects(
    () =>
      f.owner.approveInstruction(
        { ...f.input, expiresAt: "2026-10-15T11:00:01.000Z" },
        "key",
      ),
    code("APPROVAL_REQUIRED"),
  );
  assert.equal(f.state.approvals.length, 0);
  assert.equal(f.state.idempotency.size, 0);
  assert(!f.state.events.includes("owner.return"));
});

test("new approval time is obtained after asynchronous eligibility checks", async () => {
  const f = instructionFixture();
  f.records.getMemoryAnchor = async () => {
    f.state.nowMilliseconds = Date.parse(now) + 500;
    return structuredClone(f.state.anchor);
  };
  const result = await f.owner.approveInstruction(
    { ...f.input, expiresAt: "2026-10-15T11:00:01.000Z" },
    "key",
  );
  assert.equal(result.record.approvedAt, "2026-10-15T11:00:00.500Z");
});

test("approval expiry crossed during insertion rejects inside transaction callback", async () => {
  const f = instructionFixture();
  const insert = f.records.insertInstructionApproval;
  f.records.insertInstructionApproval = async (record) => {
    const inserted = await insert(record);
    f.state.nowMilliseconds = Date.parse(now) + 2000;
    return inserted;
  };
  await assert.rejects(
    () =>
      f.owner.approveInstruction(
        { ...f.input, expiresAt: "2026-10-15T11:00:01.000Z" },
        "key",
      ),
    code("APPROVAL_REQUIRED"),
  );
  assert(f.state.events.includes("approval.insert"));
  assert.equal(f.state.idempotency.size, 0);
  assert(!f.state.events.includes("owner.return"));
  // The real adapter must roll back the insertion; this fake cannot prove it.
});

test("historical approval replay remains an original receipt after approval expiry", async () => {
  const f = instructionFixture();
  const input = Object.freeze({
    ...f.input,
    expiresAt: "2026-10-15T11:00:01.000Z",
  });
  const first = await f.owner.approveInstruction(input, "key");
  f.state.nowMilliseconds = Date.parse(now) + 2000;
  f.state.memory!.lifecycle = "rejected";
  f.state.anchor.freshness = "stale";
  f.state.events.length = 0;
  const replay = await f.owner.approveInstruction(input, "key");
  assert.equal(replay.replayed, true);
  assert.equal(replay.correlationId, first.correlationId);
  assert.deepEqual(replay.record, first.record);
  assert.deepEqual(f.state.events, [
    "owner.enter",
    "idempotent",
    "owner.return",
  ]);
});

test("new approval expiry crossed during idempotency receipt persistence denies callback return", async () => {
  const f = instructionFixture();
  const idempotent = f.records.idempotent;
  f.records.idempotent = async <T>(
    key: string,
    digest: string,
    perform: () => Promise<T>,
  ) => {
    const result = await idempotent(key, digest, perform);
    f.state.nowMilliseconds = Date.parse(now) + 2000;
    return result;
  };
  await assert.rejects(
    () =>
      f.owner.approveInstruction(
        { ...f.input, expiresAt: "2026-10-15T11:00:01.000Z" },
        "key",
      ),
    code("APPROVAL_REQUIRED"),
  );
  assert(f.state.events.includes("approval.insert"));
  assert(!f.state.events.includes("owner.return"));
  assert.equal(f.state.events.at(-1), "owner.reject");
  // The fake has persisted a receipt; the real transaction wrapper must roll
  // back both that receipt and the approval when the callback is rejected.
});

test("historical approval replay stays exempt when idempotency retrieval crosses expiry", async () => {
  const f = instructionFixture();
  const input = Object.freeze({
    ...f.input,
    expiresAt: "2026-10-15T11:00:01.000Z",
  });
  const first = await f.owner.approveInstruction(input, "key");
  const idempotent = f.records.idempotent;
  f.records.idempotent = async <T>(
    key: string,
    digest: string,
    perform: () => Promise<T>,
  ) => {
    const result = await idempotent(key, digest, perform);
    f.state.nowMilliseconds = Date.parse(now) + 2000;
    return result;
  };
  f.state.events.length = 0;
  const replay = await f.owner.approveInstruction(input, "key");
  assert.equal(replay.replayed, true);
  assert.equal(replay.correlationId, first.correlationId);
  assert.deepEqual(replay.record, first.record);
  assert.deepEqual(f.state.events, [
    "owner.enter",
    "idempotent",
    "owner.return",
  ]);
});

test("owner exact memory read returns canonical assertion and anchor without mutation or machine grants", async () => {
  const f = fixture();
  const result = await f.owner.getMemory({ projectId, id: memoryId });
  assert.deepEqual(result, { memory: f.state.memory, anchor: f.state.anchor });
  assert.equal(f.state.ownerRequests[0]!.operation, "memory.read");
  assert.equal(f.state.ownerRequests[0]!.targetId, memoryId);
  assert.equal(f.state.saves.length, 0);
  assert.equal(f.state.reviews.length, 0);
  assert.equal(f.state.approvals.length, 0);
  assert.equal(
    foundationCreateClientSchema.safeParse({
      name: "denied ownerread",
      projectId,
      environment: "test",
      operations: ["memory.read"],
      ttlSeconds: 60,
    }).success,
    false,
  );
});
test("owner memory read closes strict selectors and missing or foreign canonical records", async () => {
  const f = fixture();
  for (const raw of [
    { projectId, id: memoryId, actor: "user:forged" },
    { projectId, id: memoryId, environment: "test" },
    { projectId, id: "invalid" },
  ])
    await assert.rejects(f.owner.getMemory(raw));
  assert.equal(f.state.ownerRequests.length, 0);
  f.state.memory = null;
  await assert.rejects(
    f.owner.getMemory({ projectId, id: memoryId }),
    code("NOT_FOUND"),
  );
  f.state.memory = memory({ projectId: otherProjectId });
  await assert.rejects(
    f.owner.getMemory({ projectId, id: memoryId }),
    code("NOT_FOUND"),
  );
});
test("owner memory read rejects corrupt content and anchors as internal failures", async () => {
  const f = fixture();
  f.state.memory = memory({ contentDigest: "a".repeat(64) });
  await assert.rejects(
    f.owner.getMemory({ projectId, id: memoryId }),
    (e) =>
      e instanceof Error &&
      !(e instanceof FoundationError) &&
      e.message === "Foundation memory output unavailable",
  );
  const g = fixture();
  g.state.anchor = { ...g.state.anchor, knowledgeItemId: otherProjectId };
  await assert.rejects(
    g.owner.getMemory({ projectId, id: memoryId }),
    (e) => e instanceof Error && !(e instanceof FoundationError),
  );
});
test("owner memory read checks expiry before callback and after outer delivery", async () => {
  const f = fixture();
  f.state.onOwnerEntry = () => {
    f.state.nowMilliseconds = Date.parse(expiry);
  };
  await assert.rejects(
    f.owner.getMemory({ projectId, id: memoryId }),
    code("FORBIDDEN"),
  );
  const g = fixture();
  const withOwner = g.port.withOwner;
  g.port.withOwner = async (request, action) => {
    const result = await withOwner(request, action);
    g.state.nowMilliseconds = Date.parse(expiry);
    return result;
  };
  await assert.rejects(
    g.owner.getMemory({ projectId, id: memoryId }),
    code("FORBIDDEN"),
  );
});
test("owner memory read rejects callback omission, repetition and postcallback mutation", async () => {
  const f = fixture();
  f.port.withOwner = async () =>
    ({ memory: memory(), anchor: f.state.anchor }) as never;
  await assert.rejects(
    f.owner.getMemory({ projectId, id: memoryId }),
    (e) => e instanceof Error && !(e instanceof FoundationError),
  );
  const g = fixture();
  g.port.withOwner = async (_request, action) => {
    const first = await action(g.records);
    try {
      await action(g.records);
    } catch {}
    return first;
  };
  await assert.rejects(
    g.owner.getMemory({ projectId, id: memoryId }),
    (e) => e instanceof Error && !(e instanceof FoundationError),
  );
  const h = fixture();
  const withOwner = h.port.withOwner;
  h.port.withOwner = async (request, action) => {
    const value = await withOwner(request, action);
    (value as { memory: FoundationMemory }).memory.lifecycle = "accepted";
    return value;
  };
  await assert.rejects(
    h.owner.getMemory({ projectId, id: memoryId }),
    (e) => e instanceof Error && !(e instanceof FoundationError),
  );
});
