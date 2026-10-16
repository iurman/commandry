import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES,
  foundationClientSchema,
  type FoundationClient,
  type FoundationProjectWorkRecord,
  type FoundationTaskProposalDetail,
  type FoundationTaskProposalReviewReceipt,
} from "@commandry/contracts";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import type {
  FoundationIdentity,
  FoundationMachineRequest,
  FoundationOwnerRequest,
} from "./agent-foundation";
import {
  createFoundationTaskProposalService,
  FoundationTaskProposalUnavailableError,
  type FoundationTaskProposalPort,
  type FoundationTaskProposalRecords,
} from "./foundation-task-proposal";

// Synthetic scoped port only. No PostgreSQL locking, persistence, HTTP, runtime
// credential authentication or owner session authentication is proven here.
const id = (value: number) =>
  "00000000-0000-4000-8000-" + value.toString(16).padStart(12, "0");
const projectId = id(10);
const foreignProjectId = id(11);
const clientId = id(12);
const token = "af_" + "A".repeat(43);
const startedAt = "2026-10-16T10:00:00.000Z";
const expiresAt = "2026-10-17T00:00:00.000Z";
const owner = (): FoundationIdentity => ({
  principalId: "user:owner",
  expiresAt,
});
const original = "\ufeff  original \u00e9\u0301 \u2603 \ud83c\udf0c\r\n\t";
const input = () => ({
  projectId,
  originalContent: original,
  proposedTitle: "  proposed \u2603\r\n",
  proposedBody: "\r\n  proposed body \t",
  rationale: " exact rationale \r\n",
});
const textDigest = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
type Hook = (phase: string, value: unknown) => unknown;
type Request = FoundationMachineRequest | FoundationOwnerRequest;

function fixture() {
  const client = foundationClientSchema.parse({
    schemaVersion: 1,
    id: clientId,
    projectId,
    name: "Synthetic proposer",
    operations: ["work.propose"],
    environment: "test",
    createdAt: "2026-10-01T00:00:00.000Z",
    expiresAt,
    revokedAt: null,
    createdBy: "user:owner",
  });
  const details = new Map<string, FoundationTaskProposalDetail>();
  const works = new Map<string, FoundationProjectWorkRecord>();
  const receipts = new Map<string, { digest: string; value: unknown }>();
  const requests: Request[] = [];
  const events: string[] = [];
  const state: {
    client: FoundationClient;
    time: string;
    hook: Hook;
    mode: "single" | "none" | "repeat" | "swallowed-repeat";
    clock: (() => Date) | undefined;
    uuid: (() => string) | undefined;
  } = {
    client,
    time: startedAt,
    hook: (_phase, value) => value,
    mode: "single",
    clock: undefined,
    uuid: undefined,
  };
  let sequence = 100;
  let active: Request | undefined;
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected unrelated record operation");
  };
  const records: FoundationTaskProposalRecords = {
    async idempotent<T>(
      key: string,
      digest: string,
      perform: () => Promise<T>,
    ) {
      events.push("idempotent");
      const principal =
        active && "tokenDigest" in active
          ? "foundation-client:" + state.client.id
          : (active as FoundationOwnerRequest).principalId;
      const isolatedKey = principal + ":" + active!.operation + ":" + key;
      const prior = receipts.get(isolatedKey);
      if (prior) {
        if (prior.digest !== digest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        return state.hook("idempotent", {
          value: structuredClone(prior.value),
          replayed: true,
        }) as { value: T; replayed: boolean };
      }
      const value = await perform();
      receipts.set(isolatedKey, { digest, value: structuredClone(value) });
      return state.hook("idempotent", { value, replayed: false }) as {
        value: T;
        replayed: boolean;
      };
    },
    async insertTaskProposal(detail) {
      events.push("insert");
      details.set(detail.suggestion.id, structuredClone(detail));
      return state.hook(
        "insert",
        structuredClone(detail),
      ) as FoundationTaskProposalDetail;
    },
    async getTaskProposal(proposalId, lock) {
      events.push("load:" + String(lock));
      return state.hook(
        "load",
        structuredClone(details.get(proposalId) ?? null),
      ) as FoundationTaskProposalDetail | null;
    },
    async getTaskProposalByCapture(captureId) {
      events.push("read");
      return state.hook(
        "read",
        structuredClone(
          [...details.values()].find(
            (value) => value.capture.id === captureId,
          ) ?? null,
        ),
      ) as FoundationTaskProposalDetail | null;
    },
    async reviewTaskProposal({ decision }) {
      events.push("review");
      const current = details.get(decision.suggestionId)!;
      if (current.decision !== null)
        throw new FoundationError("VERSION_CONFLICT");
      const work: FoundationProjectWorkRecord | null =
        decision.decision === "reject"
          ? null
          : {
              id: decision.filedRecordId!,
              projectId: decision.selectedProjectId!,
              sourceCaptureId: decision.captureId,
              generatedFromWorkItemId: null,
              title: decision.selectedTitle!,
              description: decision.selectedBody!,
              workType: "task",
              status: "open",
              assigneeKind: "unassigned",
              assigneeAgentId: null,
              assigneeLabel: null,
              priority: null,
              dueOn: null,
              contextLink: null,
              createdAt: decision.createdAt,
              updatedAt: decision.createdAt,
            };
      if (work) works.set(work.id, structuredClone(work));
      details.set(current.suggestion.id, {
        ...current,
        decision: structuredClone(decision),
        capture: {
          ...current.capture,
          state: work ? "filed" : "unfiled",
          filedRecord: work ? { kind: "task", id: work.id } : null,
          filedAt: work ? decision.createdAt : null,
        },
      });
      const receipt: FoundationTaskProposalReviewReceipt = {
        schemaVersion: 1,
        proposalId: decision.suggestionId,
        captureId: decision.captureId,
        projectId: decision.provenance.projectId,
        environment: decision.provenance.environment,
        decision,
        work,
      };
      return state.hook(
        "review",
        receipt,
      ) as FoundationTaskProposalReviewReceipt;
    },
    validateEvidenceReference: unused,
    assertReferences: unused,
    getEvidence: unused,
    getMemory: unused,
    getConfiguration: unused,
    resolveMemoryAnchor: unused,
    getMemoryAnchor: unused,
    hasUnresolvedContradictions: unused,
    insertEvidence: unused,
    saveMemory: unused,
    reviewMemory: unused,
    verifyMemory: unused,
    insertInstructionApproval: unused,
    insertConfiguration: unused,
  };
  async function wrap<T>(
    request: Request,
    callback: () => Promise<T>,
  ): Promise<T> {
    requests.push(structuredClone(request));
    active = request;
    const backup = {
      details: structuredClone(details),
      works: structuredClone(works),
      receipts: structuredClone(receipts),
    };
    try {
      state.hook("entry", null);
      if (state.mode === "none") return {} as T;
      const value = await callback();
      if (state.mode === "repeat") await callback();
      if (state.mode === "swallowed-repeat") {
        try {
          await callback();
        } catch {
          /* Corrupt adapter attempts to hide a callback failure. */
        }
      }
      return state.hook("delivery", value) as T;
    } catch (error) {
      details.clear();
      works.clear();
      receipts.clear();
      for (const [key, value] of backup.details) details.set(key, value);
      for (const [key, value] of backup.works) works.set(key, value);
      for (const [key, value] of backup.receipts) receipts.set(key, value);
      throw error;
    }
  }
  const port: FoundationTaskProposalPort = {
    withClient<T>(
      request: FoundationMachineRequest,
      callback: (
        client: FoundationClient,
        records: FoundationTaskProposalRecords,
      ) => Promise<T>,
    ) {
      expect(request.tokenDigest).toBe(foundationTokenDigest(token));
      return wrap(request, () => callback(state.client, records));
    },
    withOwner<T>(
      request: FoundationOwnerRequest,
      callback: (records: FoundationTaskProposalRecords) => Promise<T>,
    ) {
      return wrap(request, () => callback(records));
    },
  };
  const service = createFoundationTaskProposalService(port, {
    environment: "test",
    now: () => (state.clock ? state.clock() : new Date(state.time)),
    createId: () => (state.uuid ? state.uuid() : id(sequence++).toUpperCase()),
  });
  return {
    service,
    state,
    details,
    works,
    receipts,
    requests,
    events,
    records,
  };
}
type Fixture = ReturnType<typeof fixture>;
async function submit(f: Fixture, key = "submit-1", value = input()) {
  return f.service.submitTaskProposal(token, key, value);
}
function reviewInput(f: Fixture, decision: "approve" | "reject" = "approve") {
  const detail = [...f.details.values()][0]!;
  return {
    projectId,
    proposalId: detail.suggestion.id,
    expectedVersion: 1,
    expectedProposalDigest: detail.suggestion.proposal.contentDigest,
    expectedSourceDigest: detail.suggestion.proposal.binding.sourceDigest,
    decision,
    ...(decision === "approve"
      ? {
          selectedTitle: "  corrected title \u2603\r\n",
          selectedBody: "\ufeff corrected body \r\n\t",
        }
      : {}),
  };
}
const failure = async (promise: Promise<unknown>, code?: string) => {
  const error: unknown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (code !== undefined) {
    expect(error).toBeInstanceOf(FoundationError);
    expect(error).toMatchObject({ code });
  } else {
    expect(error).toBeInstanceOf(FoundationTaskProposalUnavailableError);
    expect(error).not.toBeInstanceOf(FoundationError);
    expect(error).toMatchObject({
      name: "FoundationTaskProposalUnavailableError",
      message: "Task proposal output unavailable",
    });
    expect(error).not.toHaveProperty("code");
    expect(error).not.toHaveProperty("cause");
  }
};

describe("canonical task proposal application", () => {
  it("classifies null insert output as unavailable while absent real lookups remain NOT_FOUND", async () => {
    const insert = fixture();
    insert.state.hook = (phase, value) => (phase === "insert" ? null : value);
    await failure(submit(insert));
    expect(insert.details.size).toBe(0);
    const read = fixture();
    await failure(
      read.service.getTaskProposal(owner(), { projectId, captureId: id(999) }),
      "NOT_FOUND",
    );
    await submit(read);
    await failure(
      read.service.reviewTaskProposal(owner(), "missing", {
        ...reviewInput(read),
        proposalId: id(999),
      }),
      "NOT_FOUND",
    );
  });

  it("preserves caller DTO, key and selector validation categories", async () => {
    const f = fixture();
    for (const promise of [
      f.service.submitTaskProposal(token, "valid", {
        ...input(),
        actor: "caller",
      }),
      f.service.submitTaskProposal(token, " bad-key", input()),
      f.service.getTaskProposal(owner(), { projectId, captureId: "invalid" }),
    ])
      await expect(promise).rejects.toMatchObject({ name: "ZodError" });
    await failure(
      f.service.getTaskProposal(owner(), {
        projectId,
        captureId: id(999),
        actor: "caller",
      }),
      "INVALID_REFERENCE",
    );
    expect(f.requests).toEqual([]);
  });

  it("preserves legitimate port errors and unknown failures without blanket conversion", async () => {
    for (const error of [
      new Error("synthetic unavailable dependency"),
      new FoundationError(
        "INVALID_REFERENCE",
        "legitimate port reference denial",
      ),
      new FoundationError("IDEMPOTENCY_CONFLICT"),
      new FoundationError("FORBIDDEN"),
    ]) {
      for (const phase of ["entry", "insert", "idempotent", "delivery"]) {
        const f = fixture();
        f.state.hook = (at, value) => {
          if (at === phase) throw error;
          return value;
        };
        await expect(submit(f)).rejects.toBe(error);
      }
    }
    const clock = fixture();
    const clockFailure = new Error("synthetic clock failure");
    clock.state.clock = () => {
      throw clockFailure;
    };
    await expect(submit(clock)).rejects.toBe(clockFailure);
    const uuid = fixture();
    const uuidFailure = new Error("synthetic UUID failure");
    uuid.state.uuid = () => {
      throw uuidFailure;
    };
    await expect(submit(uuid)).rejects.toBe(uuidFailure);
  });

  it("classifies skipped and swallowed repeated receipt performs as unavailable", async () => {
    const skipped = fixture();
    skipped.records.idempotent = async <T>() => ({
      value: {} as T,
      replayed: false,
    });
    await failure(submit(skipped));
    const repeated = fixture();
    repeated.records.idempotent = async <T>(
      _key: string,
      _digest: string,
      perform: () => Promise<T>,
    ) => {
      const value = await perform();
      try {
        await perform();
      } catch {
        /* A corrupt adapter hides its repeated perform. */
      }
      return { value, replayed: false };
    };
    await failure(submit(repeated));
    expect(repeated.details.size).toBe(0);
  });

  it("classifies corrupted historical review correlations as unavailable", async () => {
    const f = fixture();
    await submit(f);
    const value = reviewInput(f);
    await f.service.reviewTaskProposal(owner(), "review", value);
    const receipt = [...f.receipts.values()].at(-1)!.value as {
      correlationId: string;
    };
    receipt.correlationId = id(999);
    await failure(f.service.reviewTaskProposal(owner(), "review", value));
  });

  it("rejects hostile live grants and trusted owner accessors without invoking them", async () => {
    const f = fixture();
    let grantReads = 0;
    Object.defineProperty(f.state.client, "operations", {
      enumerable: true,
      get() {
        grantReads++;
        return ["work.propose"];
      },
    });
    await failure(submit(f));
    expect(grantReads).toBe(0);
    expect(f.events).toEqual([]);
    const read = fixture();
    let identityReads = 0;
    const trusted = owner();
    Object.defineProperty(trusted, "principalId", {
      enumerable: true,
      get() {
        identityReads++;
        return "user:owner";
      },
    });
    await failure(
      read.service.getTaskProposal(trusted, { projectId, captureId: id(999) }),
    );
    expect(identityReads).toBe(0);
    expect(read.requests).toEqual([]);
  });

  it("rejects changed adapter decisions and a different owner cannot replay a review", async () => {
    for (const field of ["id", "actor"]) {
      const f = fixture();
      await submit(f);
      f.state.hook = (phase, value) => {
        if (phase === "review") {
          const receipt = value as FoundationTaskProposalReviewReceipt;
          if (field === "id") receipt.decision.id = id(999);
          else {
            receipt.decision.actor = "user:other";
            receipt.decision.provenance.reviewedBy = "user:other";
          }
        }
        return value;
      };
      await failure(
        f.service.reviewTaskProposal(owner(), "review", reviewInput(f)),
      );
      expect(f.works.size).toBe(0);
    }
    const f = fixture();
    await submit(f);
    const value = reviewInput(f);
    await f.service.reviewTaskProposal(owner(), "review", value);
    await failure(
      f.service.reviewTaskProposal(
        { ...owner(), principalId: "user:other" },
        "review",
        value,
      ),
      "VERSION_CONFLICT",
    );
    expect(f.works.size).toBe(1);
  });

  it("preserves actual source UTF8 and proposes pending task-only content without Work", async () => {
    const f = fixture();
    const result = await submit(f);
    const saved = [...f.details.values()][0]!;
    expect(saved.capture.originalContent).toBe(original);
    expect(saved.capture).toMatchObject({
      source: "foundation-client",
      author: "foundation-client:" + clientId,
      state: "unfiled",
      file: null,
      filedAt: null,
      filedRecord: null,
    });
    expect(saved.suggestion).toMatchObject({
      title: input().proposedTitle,
      body: input().proposedBody,
      confidence: null,
      kind: "task",
    });
    expect(saved.suggestion.proposal.binding).toMatchObject({
      principalId: "foundation-client:" + clientId,
      clientId,
      runtime: null,
      model: null,
      runId: null,
    });
    expect(result.record.sourceDigest).toBe(textDigest(original));
    expect(result.record.sourceDigest).not.toBe(foundationDigest(original));
    expect(result.record.proposalDigest).toBe(
      foundationDigest(saved.suggestion.proposal.binding),
    );
    expect(result.record).toMatchObject({
      status: "pending",
      verification: "unverified",
      submittedAt: startedAt,
    });
    expect(result.correlationId).toBe(result.record.correlationId);
    expect(result.record).not.toHaveProperty("originalContent");
    expect(result.record).not.toHaveProperty("proposedBody");
    expect(f.works.size).toBe(0);
    expect(f.events).toEqual(["idempotent", "insert"]);
    expect(f.requests[0]).toMatchObject({
      operation: "work.propose",
      projectId,
      environment: "test",
      targetId: null,
    });
    expect(JSON.stringify(f.requests)).not.toContain(token);
  });

  it("rejects unknown claims, malformed text and bad keys before opening a port", async () => {
    for (const extra of [
      { actor: "user:owner" },
      { kind: "instruction" },
      { runtime: "codex" },
      { model: "model" },
      { runId: id(40) },
      { confidence: 99 },
      { citations: [] },
      { originalContent: "\0" },
      { proposedBody: "\ud800" },
      { proposedTitle: " " },
      { originalContent: "x".repeat(20001) },
    ]) {
      const f = fixture();
      await expect(
        submit(f, "submit", { ...input(), ...extra }),
      ).rejects.toThrow();
      expect(f.requests).toEqual([]);
    }
    const f = fixture();
    await expect(
      f.service.submitTaskProposal(token, " bad-key", input()),
    ).rejects.toThrow();
    expect(f.requests).toEqual([]);
    let calls = 0;
    const value = { ...input() };
    Object.defineProperty(value, "originalContent", {
      enumerable: true,
      get() {
        calls++;
        return original;
      },
    });
    await failure(
      f.service.submitTaskProposal(token, "getter", value),
      "INVALID_REFERENCE",
    );
    expect(calls).toBe(0);
    expect(f.requests).toEqual([]);
  });

  it("requires a live exact proposer grant without inherited read authority", async () => {
    for (const [change, code] of [
      [{ operations: ["foundation.read"] }, "FORBIDDEN"],
      [{ operations: ["work.read"] }, "FORBIDDEN"],
      [{ projectId: foreignProjectId }, "FORBIDDEN"],
      [{ environment: "production" }, "FORBIDDEN"],
      [{ revokedAt: startedAt }, "REVOKED"],
      [{ expiresAt: startedAt }, "EXPIRED"],
    ] as const) {
      const f = fixture();
      Object.assign(f.state.client, change);
      await failure(submit(f), code);
      expect(f.events).toEqual([]);
    }
    const f = fixture();
    await failure(
      f.service.submitTaskProposal("invalid", "key", input()),
      "INVALID_CREDENTIAL",
    );
    expect(f.requests).toEqual([]);
  });

  it("checks mutable grant and clock at every submission wait and delivery", async () => {
    for (const phase of ["entry", "insert", "idempotent", "delivery"]) {
      for (const kind of [
        "expiry",
        "revoke",
        "identity",
        "operations",
        "mutation",
      ]) {
        const f = fixture();
        f.state.hook = (at, value) => {
          if (at === phase) {
            if (kind === "expiry") f.state.time = expiresAt;
            if (kind === "revoke") f.state.client.revokedAt = startedAt;
            if (kind === "identity") f.state.client.id = id(99);
            if (kind === "operations")
              f.state.client.operations = ["foundation.read"];
            if (kind === "mutation") f.state.client.name += " changed";
          }
          return value;
        };
        if (phase === "entry" && ["identity", "mutation"].includes(kind))
          continue;
        await failure(
          submit(f),
          kind === "expiry"
            ? "EXPIRED"
            : kind === "revoke"
              ? "REVOKED"
              : kind === "operations"
                ? "FORBIDDEN"
                : undefined,
        );
      }
    }
  });

  it("approves exact corrected selection while preserving original and proposed text", async () => {
    const f = fixture();
    const submitted = await submit(f);
    const selection = reviewInput(f);
    const result = await f.service.reviewTaskProposal(
      owner(),
      "review",
      selection,
    );
    expect(result.record.work).toMatchObject({
      title: selection.selectedTitle,
      description: selection.selectedBody,
      sourceCaptureId: submitted.record.captureId,
      projectId,
      status: "open",
      workType: "task",
      assigneeKind: "unassigned",
      assigneeAgentId: null,
      assigneeLabel: null,
      priority: null,
      dueOn: null,
      contextLink: null,
      generatedFromWorkItemId: null,
    });
    expect(result.record.decision.actor).toBe("user:owner");
    const saved = [...f.details.values()][0]!;
    expect(saved.capture.originalContent).toBe(original);
    expect(saved.suggestion.title).toBe(input().proposedTitle);
    expect(saved.capture.filedRecord?.id).toBe(result.record.work?.id);
    expect(f.events).toContain("load:true");
    expect(f.requests.at(-1)).toMatchObject({
      operation: "work.proposal.review",
      targetId: submitted.record.proposalId,
      principalId: "user:owner",
    });
    const read = await f.service.getTaskProposal(owner(), {
      projectId,
      captureId: submitted.record.captureId,
    });
    expect(read).toEqual(saved);
    expect(f.requests.at(-1)).toMatchObject({
      operation: "work.proposal.read",
      targetId: submitted.record.captureId,
    });
  });

  it("rejects without Work and keeps the exact original available to its owner", async () => {
    const f = fixture();
    const submitted = await submit(f);
    const result = await f.service.reviewTaskProposal(
      owner(),
      "reject",
      reviewInput(f, "reject"),
    );
    expect(result.record.work).toBeNull();
    expect(f.works.size).toBe(0);
    expect(result.record.decision).toMatchObject({
      decision: "reject",
      selectedProjectId: null,
      selectedKind: null,
      selectedTitle: null,
      selectedBody: null,
      filedRecordId: null,
    });
    const read = await f.service.getTaskProposal(owner(), {
      projectId,
      captureId: submitted.record.captureId,
    });
    expect(read.capture.originalContent).toBe(original);
    expect(read.capture.state).toBe("unfiled");
  });

  it("rejects stale expected bindings, missing proposals and second-key terminal decisions", async () => {
    for (const field of ["expectedSourceDigest", "expectedProposalDigest"]) {
      const f = fixture();
      await submit(f);
      await failure(
        f.service.reviewTaskProposal(owner(), "review", {
          ...reviewInput(f),
          [field]: "0".repeat(64),
        }),
        "VERSION_CONFLICT",
      );
      expect(f.works.size).toBe(0);
    }
    const f = fixture();
    await submit(f);
    await failure(
      f.service.reviewTaskProposal(owner(), "missing", {
        ...reviewInput(f),
        proposalId: id(999),
      }),
      "NOT_FOUND",
    );
    const value = reviewInput(f);
    await f.service.reviewTaskProposal(owner(), "first-review", value);
    await failure(
      f.service.reviewTaskProposal(owner(), "second-review", value),
      "VERSION_CONFLICT",
    );
    expect(f.works.size).toBe(1);
  });

  it("replays immutable submit and review receipts after decision and normal Work edits", async () => {
    const f = fixture();
    const first = await submit(f);
    const selection = reviewInput(f);
    const approved = await f.service.reviewTaskProposal(
      owner(),
      "review",
      selection,
    );
    f.works.get(approved.record.work!.id)!.title = "Normal later Work edit";
    f.works.get(approved.record.work!.id)!.status = "done";
    f.state.time = "2026-10-16T11:00:00.000Z";
    const beforeReads = f.events.filter((value) =>
      value.startsWith("load"),
    ).length;
    expect(await submit(f)).toEqual({ ...first, replayed: true });
    expect(
      await f.service.reviewTaskProposal(owner(), "review", selection),
    ).toEqual({ ...approved, replayed: true });
    expect(f.events.filter((value) => value.startsWith("load")).length).toBe(
      beforeReads,
    );
    expect(approved.record.work!.title).toBe(selection.selectedTitle);
    expect(f.works.size).toBe(1);
    await failure(
      submit(f, "submit-1", {
        ...input(),
        proposedBody: input().proposedBody + " ",
      }),
      "IDEMPOTENCY_CONFLICT",
    );
    await failure(
      f.service.reviewTaskProposal(owner(), "review", {
        ...selection,
        selectedTitle: "changed",
      }),
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("validates independent trusted human identity and strict owner input before access", async () => {
    for (const principalId of [
      "",
      "user:",
      "local-user:unattributed",
      "foundation-client:" + clientId,
      "user:bad\0",
    ]) {
      const f = fixture();
      await failure(
        f.service.getTaskProposal(
          { ...owner(), principalId },
          { projectId, captureId: id(99) },
        ),
        "FORBIDDEN",
      );
      expect(f.requests).toEqual([]);
    }
    for (const expiresAt of [
      "2026-02-30T00:00:00Z",
      "2026-10-16",
      "2026-10-16T10:00:00",
    ]) {
      const f = fixture();
      await failure(
        f.service.getTaskProposal(
          { ...owner(), expiresAt },
          { projectId, captureId: id(99) },
        ),
        "FORBIDDEN",
      );
      expect(f.requests).toEqual([]);
    }
    const f = fixture();
    await submit(f);
    const before = f.requests.length;
    await expect(
      f.service.reviewTaskProposal(owner(), "bad", {
        ...reviewInput(f),
        actor: "user:other",
      }),
    ).rejects.toThrow();
    await expect(
      f.service.reviewTaskProposal(owner(), "bad", {
        ...reviewInput(f),
        expectedVersion: 2,
      }),
    ).rejects.toThrow();
    await expect(
      f.service.reviewTaskProposal(owner(), "bad", {
        ...reviewInput(f, "reject"),
        selectedBody: "forbidden",
      }),
    ).rejects.toThrow();
    await expect(
      f.service.getTaskProposal(owner(), {
        projectId,
        captureId: id(99),
        environment: "test",
      }),
    ).rejects.toThrow();
    expect(f.requests.length).toBe(before);
  });

  it("rechecks owner expiry through reads, review, receipts and delivery", async () => {
    for (const phase of ["entry", "load", "review", "idempotent", "delivery"]) {
      const f = fixture();
      await submit(f);
      f.state.hook = (at, value) => {
        if (at === phase) f.state.time = expiresAt;
        return value;
      };
      await failure(
        f.service.reviewTaskProposal(owner(), "review", reviewInput(f)),
        "EXPIRED",
      );
    }
    for (const phase of ["entry", "read", "delivery"]) {
      const f = fixture();
      const submitted = await submit(f);
      f.state.hook = (at, value) => {
        if (at === phase) f.state.time = expiresAt;
        return value;
      };
      await failure(
        f.service.getTaskProposal(owner(), {
          projectId,
          captureId: submitted.record.captureId,
        }),
        "EXPIRED",
      );
    }
    const f = fixture();
    await submit(f);
    const trusted = owner();
    f.state.hook = (at, value) => {
      if (at === "load") trusted.principalId = "user:other";
      return value;
    };
    await failure(
      f.service.reviewTaskProposal(trusted, "review", reviewInput(f)),
    );
  });

  it("checks every clock and UUID factory result", async () => {
    for (const clockOutput of [
      "2026-10-16" as unknown as Date,
      new Date("+010000-01-01T00:00:00.000Z"),
    ]) {
      const f = fixture();
      f.state.clock = () => clockOutput;
      await failure(submit(f));
      expect(f.requests).toEqual([]);
    }
    for (const failAt of [0, 1, 2, 3, 4, 5]) {
      const f = fixture();
      let calls = 0;
      f.state.clock = () =>
        calls++ === failAt ? new Date(NaN) : new Date(startedAt);
      await failure(submit(f));
    }
    for (const failAt of [0, 1, 2]) {
      const f = fixture();
      let calls = 0;
      f.state.uuid = () =>
        calls++ === failAt ? "invalid-uuid" : id(100 + calls);
      await failure(submit(f));
      expect(f.details.size).toBe(0);
    }
  });

  it("rejects malicious adapter shapes, source hashes and projection digests", async () => {
    for (const corrupt of [
      (detail: FoundationTaskProposalDetail) => ({ ...detail, actor: "owner" }),
      (detail: FoundationTaskProposalDetail) => ({
        ...detail,
        capture: { ...detail.capture, originalContent: original + "changed" },
      }),
      (detail: FoundationTaskProposalDetail) => ({
        ...detail,
        suggestion: {
          ...detail.suggestion,
          proposal: {
            ...detail.suggestion.proposal,
            contentDigest: "0".repeat(64),
          },
        },
      }),
      (detail: FoundationTaskProposalDetail) => ({
        ...detail,
        suggestion: { ...detail.suggestion, title: "changed" },
      }),
    ]) {
      const f = fixture();
      f.state.hook = (phase, value) =>
        phase === "insert"
          ? corrupt(value as FoundationTaskProposalDetail)
          : value;
      await failure(submit(f));
      expect(f.details.size).toBe(0);
    }
  });

  it("rejects getters, symbols and prototype-bearing adapter output without invoking getters", async () => {
    for (const phase of ["insert", "idempotent", "delivery"]) {
      const f = fixture();
      let calls = 0;
      f.state.hook = (at, value) => {
        if (at === phase)
          Object.defineProperty(value, "malicious", {
            enumerable: true,
            get() {
              calls++;
              return "private";
            },
          });
        return value;
      };
      await failure(submit(f));
      expect(calls).toBe(0);
    }
    for (const corrupt of [
      (value: unknown) => Object.assign(Object.create({ secret: true }), value),
      (value: unknown) => ({ ...(value as object), [Symbol("secret")]: true }),
    ]) {
      const f = fixture();
      f.state.hook = (at, value) => (at === "insert" ? corrupt(value) : value);
      await failure(submit(f));
    }
  });

  it("rejects malformed receipt envelopes and changed historical provenance", async () => {
    for (const mutate of [
      (value: Record<string, unknown>) => ({ ...value, replayed: "false" }),
      (value: Record<string, unknown>) => ({ ...value, replayed: true }),
      (value: Record<string, unknown>) => ({ ...value, extra: true }),
      (value: Record<string, unknown>) => ({
        ...value,
        value: { ...(value.value as object), correlationId: id(999) },
      }),
    ]) {
      const f = fixture();
      f.state.hook = (phase, value) =>
        phase === "idempotent"
          ? mutate(value as Record<string, unknown>)
          : value;
      await failure(submit(f));
    }
    const f = fixture();
    await submit(f);
    const prior = [...f.receipts.values()][0]!.value as {
      record: { proposalDigest: string };
    };
    prior.record.proposalDigest = "0".repeat(64);
    await failure(submit(f));
  });

  it("rejects missing, repeated and swallowed repeated outer callbacks", async () => {
    for (const mode of ["none", "repeat", "swallowed-repeat"] as const) {
      const f = fixture();
      f.state.mode = mode;
      await failure(submit(f));
      const read = fixture();
      const submitted = await submit(read);
      read.state.mode = mode;
      await failure(
        read.service.getTaskProposal(owner(), {
          projectId,
          captureId: submitted.record.captureId,
        }),
      );
    }
  });

  it("rejects output substitution or mutation after the port callback", async () => {
    for (const mutate of [
      (value: unknown) => ({ ...(value as object), replayed: true }),
      (value: unknown) => {
        (value as { record: { status: string } }).record.status = "approved";
        return value;
      },
    ]) {
      const f = fixture();
      f.state.hook = (phase, value) =>
        phase === "delivery" ? mutate(value) : value;
      await failure(submit(f));
    }
    const f = fixture();
    await submit(f);
    f.state.hook = (phase, value) => {
      if (phase === "review")
        (value as FoundationTaskProposalReviewReceipt).work!.assigneeKind =
          "agent";
      return value;
    };
    await failure(
      f.service.reviewTaskProposal(owner(), "review", reviewInput(f)),
    );
  });

  it("rejects corrupt owner reads and never exposes originals to a machine read method", async () => {
    const f = fixture();
    const submitted = await submit(f);
    expect(f.service).not.toHaveProperty("getTaskProposalForClient");
    await failure(
      f.service.getTaskProposal(owner(), { projectId, captureId: id(999) }),
      "NOT_FOUND",
    );
    f.state.hook = (phase, value) =>
      phase === "read"
        ? {
            ...(value as object),
            capture: {
              ...(value as FoundationTaskProposalDetail).capture,
              originalContent: "corrupt",
            },
          }
        : value;
    await failure(
      f.service.getTaskProposal(owner(), {
        projectId,
        captureId: submitted.record.captureId,
      }),
    );
    f.state.hook = (_phase, value) => value;
    await failure(
      f.service.getTaskProposal(owner(), {
        projectId: foreignProjectId,
        captureId: submitted.record.captureId,
      }),
    );
  });

  it("applies the input byte budget only to input and allows larger truthful detail output", async () => {
    const f = fixture();
    const value = {
      ...input(),
      originalContent: "\u0001".repeat(20000),
      proposedTitle: "\u0001".repeat(200),
      proposedBody: "\u0001".repeat(20000),
      rationale: "\u0001".repeat(4000),
    };
    expect(Buffer.byteLength(canonicalFoundationJson(value))).toBeLessThan(
      FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES,
    );
    const submitted = await submit(f, "large", value);
    await f.service.reviewTaskProposal(owner(), "review-large", {
      ...reviewInput(f),
      selectedTitle: "\u0001".repeat(200),
      selectedBody: "\u0001".repeat(20000),
    });
    const detail = await f.service.getTaskProposal(owner(), {
      projectId,
      captureId: submitted.record.captureId,
    });
    expect(Buffer.byteLength(canonicalFoundationJson(detail))).toBeGreaterThan(
      FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES,
    );
    expect(detail.capture.originalContent).toBe(value.originalContent);
    expect(detail.decision?.selectedBody).toBe("\u0001".repeat(20000));
  });
});
