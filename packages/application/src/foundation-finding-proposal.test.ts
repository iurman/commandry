import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  type FoundationClient,
  type FoundationEvidence,
  type FoundationFindingProposalDetail,
  type FoundationFindingProposalInput,
  type FoundationFindingProposalReviewInput,
  type FoundationFindingProposalReviewReceipt,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import {
  createFoundationFindingProposalService,
  type FoundationFindingProposalPort,
  type FoundationFindingProposalRecords,
} from "./foundation-finding-proposal";
import {
  type FoundationMachineRequest,
  type FoundationOwnerRequest,
} from "./agent-foundation";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const projectId = id(1);
const token = "af_" + "x".repeat(43);
const owner = {
  principalId: "user:reviewer",
  sessionId: "real-owner-session",
  expiresAt: "2027-01-01T00:00:00Z",
};
const at = "2026-10-16T10:00:00.000Z";
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const bytes = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const unsupported = async (): Promise<never> => {
  throw new Error("Outside the finding fake's supported operations");
};

type Envelope = { digest: string; value: unknown };
function fixture() {
  let sequence = 100;
  const state = {
    now: new Date(at),
    detail: null as FoundationFindingProposalDetail | null,
    source: new Map<string, string>(),
    evidence: new Map<string, FoundationEvidence>(),
    receipts: new Map<string, Envelope>(),
    client: {
      schemaVersion: 1,
      id: id(2),
      projectId,
      name: "Finding producer",
      operations: ["finding.propose", "finding.read"],
      environment: "test",
      createdAt: "2026-10-01T00:00:00Z",
      expiresAt: owner.expiresAt,
      revokedAt: null,
      createdBy: "user:issuer",
    } as FoundationClient,
    ownerRequests: [] as FoundationOwnerRequest[],
    machineRequests: [] as FoundationMachineRequest[],
  };
  const sourceKey = (value: {
    sourceKind: string;
    sourceId: string;
    sourceVersion: string | null;
  }) => [value.sourceKind, value.sourceId, value.sourceVersion].join(":");
  const evidence = (
    n: number,
    sourceKind: "capture" | "knowledge_revision",
    sourceVersion: string | null,
    text: string,
  ): FoundationEvidence => ({
    schemaVersion: 1,
    id: id(n),
    projectId,
    sourceKind,
    sourceId: id(n + 20),
    sourceVersion,
    contentDigest: bytes(text),
    locator: "canonical:" + id(n + 20),
    observedAt: null,
    availability: "available",
    ingestedAt: at,
    recordedBy: "user:source-owner",
    verification: "unverified",
  });
  for (const row of [
    evidence(3, "capture", null, "  original evidence\r\n"),
    evidence(4, "knowledge_revision", "2", "Historical revision two"),
  ]) {
    state.evidence.set(row.id, row);
    state.source.set(
      sourceKey(row),
      row.id === id(3) ? "  original evidence\r\n" : "Historical revision two",
    );
  }
  const value: FoundationFindingProposalInput = {
    projectId,
    originalContent: "  Finding e\u0301\r\n  Keep these bytes.\n",
    proposedTitle: "Possible observation",
    proposedBody: "This is an unverified finding.",
    rationale: "The cited source snapshots suggest this observation.",
    citations: [...state.evidence.values()].map((row) => ({
      evidenceId: row.id,
      sourceKind: row.sourceKind as "capture" | "knowledge_revision",
      sourceId: row.sourceId,
      sourceVersion: row.sourceVersion,
      contentDigest: row.contentDigest,
      selection: "whole_source",
    })),
  };
  const records = {
    async idempotent<T>(
      key: string,
      digest: string,
      perform: () => Promise<T>,
    ): Promise<{ value: T; replayed: boolean }> {
      const previous = state.receipts.get(key);
      if (previous) {
        if (previous.digest !== digest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        return { value: copy(previous.value) as T, replayed: true };
      }
      const result = await perform();
      state.receipts.set(key, { digest, value: copy(result) });
      return { value: copy(result), replayed: false };
    },
    validateEvidenceReference: vi.fn(
      async (
        reference: Parameters<
          FoundationFindingProposalRecords["validateEvidenceReference"]
        >[0],
      ) => {
        const text = state.source.get(sourceKey(reference));
        if (text === undefined || bytes(text) !== reference.contentDigest)
          throw new FoundationError("INVALID_REFERENCE");
      },
    ),
    assertReferences: vi.fn(
      async (
        references: Parameters<
          FoundationFindingProposalRecords["assertReferences"]
        >[0],
      ) => {
        for (const evidenceId of references.evidenceIds) {
          if (state.evidence.get(evidenceId)?.projectId !== projectId)
            throw new FoundationError("INVALID_REFERENCE");
        }
      },
    ),
    getEvidence: vi.fn(
      async (evidenceId: string): Promise<FoundationEvidence | null> =>
        copy(state.evidence.get(evidenceId) ?? null),
    ),
    getMemory: unsupported,
    getConfiguration: unsupported,
    resolveMemoryAnchor: unsupported,
    getMemoryAnchor: unsupported,
    hasUnresolvedContradictions: unsupported,
    insertEvidence: vi.fn(unsupported),
    saveMemory: unsupported,
    reviewMemory: unsupported,
    verifyMemory: unsupported,
    insertInstructionApproval: unsupported,
    insertConfiguration: unsupported,
    insertFindingProposal: vi.fn(
      async (detail: FoundationFindingProposalDetail) => {
        state.detail = copy(detail);
        return copy(detail);
      },
    ),
    getFindingProposal: vi.fn(
      async (
        _proposalId: string,
        _lock: boolean,
      ): Promise<FoundationFindingProposalDetail | null> => copy(state.detail),
    ),
    getFindingProposalByCapture: vi.fn(
      async (
        _captureId: string,
      ): Promise<FoundationFindingProposalDetail | null> => copy(state.detail),
    ),
    reviewFindingProposal: vi.fn(
      async ({
        decision,
        memoryId,
        anchorEvidenceId,
      }: Parameters<
        FoundationFindingProposalRecords["reviewFindingProposal"]
      >[0]): Promise<FoundationFindingProposalReviewReceipt> => {
        if (state.detail === null || state.detail.decision !== null)
          throw new FoundationError("VERSION_CONFLICT");
        state.detail.decision = copy(decision);
        if (decision.decision === "reject")
          return {
            schemaVersion: 1,
            proposalId: decision.suggestionId,
            captureId: decision.captureId,
            projectId,
            environment: "test",
            decision: copy(decision),
            knowledge: null,
            memory: null,
          };
        const filedRecordId = decision.filedRecordId!;
        const body = decision.selectedBody!;
        state.detail.capture.state = "filed";
        state.detail.capture.filedAt = decision.createdAt;
        state.detail.capture.filedRecord = { kind: "note", id: filedRecordId };
        const anchor: FoundationEvidence = {
          schemaVersion: 1,
          id: anchorEvidenceId,
          projectId,
          sourceKind: "knowledge_revision",
          sourceId: filedRecordId,
          sourceVersion: "1",
          contentDigest: bytes(body),
          locator: "canonical:" + filedRecordId,
          observedAt: null,
          availability: "available",
          ingestedAt: decision.createdAt,
          recordedBy: decision.actor,
          verification: "unverified",
        };
        state.evidence.set(anchorEvidenceId, anchor);
        state.source.set(sourceKey(anchor), body);
        const content = {
          statement: body,
          category: "finding" as const,
          evidenceIds: [
            anchorEvidenceId,
            ...state.detail.suggestion.proposal.binding.citations.map(
              (entry) => entry.evidenceId,
            ),
          ],
          relatedMemoryIds: [],
          relationType: null,
        };
        return {
          schemaVersion: 1,
          proposalId: decision.suggestionId,
          captureId: decision.captureId,
          projectId,
          environment: "test",
          decision: copy(decision),
          knowledge: {
            id: filedRecordId,
            projectId,
            sourceCaptureId: decision.captureId,
            kind: "note",
            title: decision.selectedTitle!,
            content: body,
            version: 1,
            createdAt: decision.createdAt,
            updatedAt: decision.createdAt,
          },
          memory: {
            schemaVersion: 1,
            id: memoryId,
            projectId,
            knowledgeItemId: filedRecordId,
            version: 1,
            contentDigest: foundationDigest(content),
            content,
            lifecycle: "proposed",
            verification: "unverified",
            recordedBy: decision.actor,
            recordedAt: decision.createdAt,
          },
        };
      },
    ),
  } satisfies FoundationFindingProposalRecords;
  const port: FoundationFindingProposalPort = {
    async withClient(request, action) {
      state.machineRequests.push(copy(request));
      if (request.tokenDigest !== foundationTokenDigest(token))
        throw new FoundationError("INVALID_CREDENTIAL");
      return action(state.client, records);
    },
    async withOwner(request, action) {
      state.ownerRequests.push(copy(request));
      if (
        request.sessionId !== owner.sessionId ||
        request.principalId !== owner.principalId
      )
        throw new FoundationError("FORBIDDEN");
      return action(records);
    },
  };
  const service = createFoundationFindingProposalService(port, {
    environment: "test",
    now: () => state.now,
    createId: () => id(sequence++),
  });
  const submit = () => service.submitFindingProposal(token, "submit-1", value);
  const reviewInput = (
    decision: "approve" | "reject" = "approve",
  ): FoundationFindingProposalReviewInput => {
    const binding = state.detail!.suggestion.proposal.binding;
    const base = {
      projectId,
      proposalId: binding.proposalId,
      expectedVersion: 1 as const,
      expectedProposalDigest: state.detail!.suggestion.proposal.contentDigest,
      expectedSourceDigest: binding.sourceDigest,
      expectedCitationsDigest: binding.citationsDigest,
      reason: "Owner reviewed exact original sources and selected these words.",
    };
    return decision === "approve"
      ? {
          ...base,
          decision,
          selectedTitle: "Owner selected title",
          selectedBody: "Owner selected finding\r\n",
        }
      : { ...base, decision };
  };
  return { state, records, port, service, value, submit, reviewInput };
}

describe("finding submission and historical snapshots", () => {
  it("preserves original UTF-8 source, actual producer and exact note suggestion", async () => {
    const f = fixture();
    const receipt = await f.submit();
    expect(receipt.replayed).toBe(false);
    expect(receipt.record).toMatchObject({
      status: "pending",
      verification: "unverified",
      clientId: id(2),
      principalId: "foundation-client:" + id(2),
      sourceDigest: bytes(f.value.originalContent),
    });
    const detail = await f.service.getFindingProposal(token, {
      projectId,
      id: receipt.record.proposalId,
    });
    expect(detail.capture.originalContent).toBe(f.value.originalContent);
    expect(detail.capture).toMatchObject({
      state: "unfiled",
      source: "foundation-client",
      author: receipt.record.principalId,
      file: null,
      filedRecord: null,
      filedAt: null,
    });
    expect(detail.suggestion).toMatchObject({
      kind: "note",
      confidence: null,
      ruleVersion: "agent-finding-proposal/v1",
      title: f.value.proposedTitle,
      body: f.value.proposedBody,
    });
    expect(detail.suggestion.proposal.binding).toMatchObject({
      runtime: null,
      model: null,
      runId: null,
    });
    expect(receipt.record.proposalDigest).toBe(
      foundationDigest(detail.suggestion.proposal.binding),
    );
    expect(receipt.record.citationsDigest).toBe(
      foundationDigest(f.value.citations),
    );
    expect(f.records.assertReferences).toHaveBeenCalledWith({
      evidenceIds: [id(3), id(4)],
      memoryIds: [],
      configurationIds: [],
    });
    expect(f.records.validateEvidenceReference).toHaveBeenCalledTimes(2);
    expect(f.records.insertEvidence).not.toHaveBeenCalled();
    expect(Object.isFrozen(receipt.record)).toBe(true);
    expect(Object.isFrozen(detail.suggestion.proposal.binding.citations)).toBe(
      true,
    );
    expect(f.state.machineRequests.map((request) => request.operation)).toEqual(
      ["finding.propose", "finding.read"],
    );
  });
  it("replays the original pending submission after owner review without current reads", async () => {
    const f = fixture();
    const first = await f.submit();
    await f.service.reviewFindingProposal(owner, "review-1", f.reviewInput());
    f.records.getEvidence.mockImplementation(unsupported);
    f.records.getFindingProposal.mockImplementation(unsupported);
    const getCalls = f.records.getEvidence.mock.calls.length;
    expect(await f.submit()).toEqual({ ...first, replayed: true });
    expect(f.records.getEvidence).toHaveBeenCalledTimes(getCalls);
    expect(f.records.insertFindingProposal).toHaveBeenCalledTimes(1);
  });
  it("reads historical citations without asserting current availability", async () => {
    const f = fixture();
    const receipt = await f.submit();
    f.state.evidence.clear();
    f.state.source.clear();
    f.records.getEvidence.mockClear();
    const result = await f.service.getFindingProposalOwner(owner, {
      projectId,
      id: receipt.record.proposalId,
    });
    expect(result.suggestion.proposal.binding.citations).toEqual(
      f.value.citations,
    );
    expect(f.records.getEvidence).not.toHaveBeenCalled();
    const byCapture = await f.service.getFindingProposalByCaptureOwner(owner, {
      projectId,
      captureId: receipt.record.captureId,
    });
    expect(byCapture).toEqual(result);
    expect(
      f.state.ownerRequests.every(
        (request) => request.sessionId === owner.sessionId,
      ),
    ).toBe(true);
  });
  it("conflicts on any changed parsed input using the same key", async () => {
    const f = fixture();
    await f.submit();
    await expect(
      f.service.submitFindingProposal(token, "submit-1", {
        ...f.value,
        rationale: "Changed rationale",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it.each(["source", "citations", "proposal"])(
    "rejects a corrupt %s digest on reads",
    async (kind) => {
      const f = fixture();
      const receipt = await f.submit();
      if (kind === "source")
        f.state.detail!.capture.originalContent += " changed";
      if (kind === "citations")
        f.state.detail!.suggestion.proposal.binding.citations.reverse();
      if (kind === "proposal")
        f.state.detail!.suggestion.proposal.contentDigest = "0".repeat(64);
      await expect(
        f.service.getFindingProposal(token, {
          projectId,
          id: receipt.record.proposalId,
        }),
      ).rejects.toThrow();
    },
  );
  it.each(["id", "capture", "project", "environment"])(
    "rejects a %s read mismatch",
    async (kind) => {
      const f = fixture();
      const receipt = await f.submit();
      if (kind === "environment") {
        const binding = f.state.detail!.suggestion.proposal.binding;
        binding.environment = "preview";
        f.state.detail!.suggestion.proposal.contentDigest =
          foundationDigest(binding);
      }
      const read =
        kind === "capture"
          ? f.service.getFindingProposalByCaptureOwner(owner, {
              projectId,
              captureId: id(900),
            })
          : f.service.getFindingProposalOwner(owner, {
              projectId: kind === "project" ? id(900) : projectId,
              id: kind === "id" ? id(900) : receipt.record.proposalId,
            });
      await expect(read).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );
});

describe("canonical citation authority", () => {
  it.each([
    "missing",
    "id",
    "project",
    "kind",
    "source",
    "version",
    "digest",
    "unavailable",
    "bytes",
    "locator",
  ])("rejects %s citation evidence before inserting", async (kind) => {
    const f = fixture();
    const row = f.state.evidence.get(id(4))!;
    if (kind === "missing") f.state.evidence.delete(row.id);
    if (kind === "id") row.id = id(900);
    if (kind === "project") row.projectId = id(900);
    if (kind === "kind") row.sourceKind = "external";
    if (kind === "source") row.sourceId = id(900);
    if (kind === "version") row.sourceVersion = "3";
    if (kind === "digest") row.contentDigest = "0".repeat(64);
    if (kind === "unavailable") row.availability = "unavailable";
    if (kind === "bytes")
      f.state.source.set(
        [row.sourceKind, row.sourceId, row.sourceVersion].join(":"),
        "Different canonical bytes",
      );
    if (kind === "locator")
      f.records.validateEvidenceReference.mockRejectedValue(
        new FoundationError("INVALID_REFERENCE"),
      );
    await expect(f.submit()).rejects.toThrow();
    expect(f.records.insertFindingProposal).not.toHaveBeenCalled();
  });
  it("uses a canonical historical revision even when a newer revision exists", async () => {
    const f = fixture();
    const row = f.state.evidence.get(id(4))!;
    f.state.source.set(
      [row.sourceKind, row.sourceId, "3"].join(":"),
      "New revision does not replace the bound second revision",
    );
    await expect(f.submit()).resolves.toMatchObject({
      record: { status: "pending" },
    });
  });
  it.each([
    "duplicate",
    "leading-zero-version",
    "capture-version",
    "partial",
    "external",
  ])("rejects %s citations", async (kind) => {
    const f = fixture();
    const raw = copy(f.value) as unknown as Record<string, unknown>;
    const citations = raw.citations as Array<Record<string, unknown>>;
    if (kind === "duplicate") citations.push(copy(citations[0]!));
    if (kind === "leading-zero-version") citations[1]!.sourceVersion = "02";
    if (kind === "capture-version") citations[0]!.sourceVersion = "1";
    if (kind === "partial") citations[0]!.selection = "range";
    if (kind === "external") citations[0]!.sourceKind = "external";
    await expect(
      f.service.submitFindingProposal(token, "key", raw),
    ).rejects.toThrow();
    expect(f.state.machineRequests).toHaveLength(0);
  });
});

describe("owner review is separate from assertion acceptance", () => {
  it("files exactly selected Knowledge and an unverified proposed finding with ordered evidence", async () => {
    const f = fixture();
    const submitted = await f.submit();
    const value = f.reviewInput();
    const result = await f.service.reviewFindingProposal(
      owner,
      "review-1",
      value,
    );
    expect(result.record.knowledge).toMatchObject({
      title: "Owner selected title",
      content: "Owner selected finding\r\n",
      version: 1,
      sourceCaptureId: submitted.record.captureId,
    });
    expect(result.record.memory).toMatchObject({
      lifecycle: "proposed",
      verification: "unverified",
      recordedBy: owner.principalId,
      content: {
        category: "finding",
        relatedMemoryIds: [],
        relationType: null,
      },
    });
    const call = f.records.reviewFindingProposal.mock.calls[0]![0];
    expect(result.record.memory!.id).toBe(call.memoryId);
    expect(result.record.memory!.content.evidenceIds).toEqual([
      call.anchorEvidenceId,
      id(3),
      id(4),
    ]);
    expect(result.record.memory!.contentDigest).toBe(
      foundationDigest(result.record.memory!.content),
    );
    expect(result.record.decision.actor).toBe(owner.principalId);
    expect(result.record.decision.provenance.correlationId).toBe(
      result.correlationId,
    );
    expect(f.state.detail!.capture.originalContent).toBe(
      f.value.originalContent,
    );
    expect(f.state.detail!.capture.author).toBe("foundation-client:" + id(2));
    expect(f.records.getFindingProposal).toHaveBeenCalledWith(
      submitted.record.proposalId,
      true,
    );
    const read = await f.service.getFindingProposalOwner(owner, {
      projectId,
      id: submitted.record.proposalId,
    });
    expect(read.capture.state).toBe("filed");
    expect(read.decision).toEqual(result.record.decision);
  });
  it("replays the immutable initial receipt after independent Knowledge and memory changes", async () => {
    const f = fixture();
    await f.submit();
    const value = f.reviewInput();
    const first = await f.service.reviewFindingProposal(
      owner,
      "review-1",
      value,
    );
    f.state.source.clear();
    f.state.evidence.clear();
    f.records.getEvidence.mockImplementation(unsupported);
    f.records.getFindingProposal.mockImplementation(unsupported);
    expect(
      await f.service.reviewFindingProposal(owner, "review-1", value),
    ).toEqual({ ...first, replayed: true });
    expect(f.records.reviewFindingProposal).toHaveBeenCalledTimes(1);
  });
  it("allows rejection after source loss without filing or reading evidence", async () => {
    const f = fixture();
    await f.submit();
    f.state.source.clear();
    f.state.evidence.clear();
    f.records.getEvidence.mockClear();
    const result = await f.service.reviewFindingProposal(
      owner,
      "review-1",
      f.reviewInput("reject"),
    );
    expect(result.record).toMatchObject({
      knowledge: null,
      memory: null,
      decision: {
        decision: "reject",
        selectedProjectId: null,
        selectedKind: null,
        selectedTitle: null,
        selectedBody: null,
        filedRecordId: null,
      },
    });
    expect(f.records.getEvidence).not.toHaveBeenCalled();
    expect(f.state.detail!.capture.state).toBe("unfiled");
  });
  it("requires available current canonical citation bytes for approval", async () => {
    const f = fixture();
    await f.submit();
    f.state.source.clear();
    await expect(
      f.service.reviewFindingProposal(owner, "review-1", f.reviewInput()),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(f.records.reviewFindingProposal).not.toHaveBeenCalled();
  });
  it.each([
    "expectedProposalDigest",
    "expectedSourceDigest",
    "expectedCitationsDigest",
  ])("rejects changed %s before terminal write", async (field) => {
    const f = fixture();
    await f.submit();
    await expect(
      f.service.reviewFindingProposal(owner, "review-1", {
        ...f.reviewInput(),
        [field]: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(f.records.reviewFindingProposal).not.toHaveBeenCalled();
  });
  it.each(["approve", "reject"] as const)(
    "prevents a new review key after terminal %s",
    async (decision) => {
      const f = fixture();
      await f.submit();
      const value = f.reviewInput(decision);
      await f.service.reviewFindingProposal(owner, "review-1", value);
      await expect(
        f.service.reviewFindingProposal(owner, "review-2", value),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect(f.records.reviewFindingProposal).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    "actor",
    "decision-id",
    "knowledge",
    "memory-id",
    "memory-digest",
    "evidence-order",
    "verification",
    "lifecycle",
    "creator",
    "time",
  ])("rejects substituted %s in a new review receipt", async (kind) => {
    const f = fixture();
    await f.submit();
    const original = f.records.reviewFindingProposal.getMockImplementation()!;
    f.records.reviewFindingProposal.mockImplementation(async (request) => {
      const result = await original(request);
      if (kind === "actor") {
        result.decision.actor = "user:someone-else";
        result.decision.provenance.reviewedBy = "user:someone-else";
      }
      if (kind === "decision-id") result.decision.id = id(900);
      if (kind === "knowledge")
        result.knowledge!.content = "Substituted content";
      if (kind === "memory-id") result.memory!.id = id(900);
      if (kind === "memory-digest")
        result.memory!.contentDigest = "0".repeat(64);
      if (kind === "evidence-order") {
        result.memory!.content.evidenceIds.reverse();
        result.memory!.contentDigest = foundationDigest(result.memory!.content);
      }
      if (kind === "verification")
        result.memory!.verification = "independently_verified";
      if (kind === "lifecycle") result.memory!.lifecycle = "accepted";
      if (kind === "creator") result.memory!.recordedBy = "user:someone-else";
      if (kind === "time") result.memory!.recordedAt = "2026-10-16T11:00:00Z";
      return result;
    });
    await expect(
      f.service.reviewFindingProposal(owner, "review-1", f.reviewInput()),
    ).rejects.toThrow();
  });
  it.each([
    "missing",
    "availability",
    "digest",
    "verification",
    "source",
    "creator",
    "time",
  ])("rejects a %s newly filed source anchor", async (kind) => {
    const f = fixture();
    await f.submit();
    const original = f.records.reviewFindingProposal.getMockImplementation()!;
    f.records.reviewFindingProposal.mockImplementation(async (request) => {
      const result = await original(request);
      const row = f.state.evidence.get(request.anchorEvidenceId)!;
      if (kind === "missing") f.state.evidence.delete(row.id);
      if (kind === "availability") row.availability = "unavailable";
      if (kind === "digest") row.contentDigest = "0".repeat(64);
      if (kind === "verification") row.verification = "source_matched";
      if (kind === "source") row.sourceVersion = "2";
      if (kind === "creator") row.recordedBy = "user:someone-else";
      if (kind === "time") row.ingestedAt = "2026-10-16T11:00:00Z";
      return result;
    });
    await expect(
      f.service.reviewFindingProposal(owner, "review-1", f.reviewInput()),
    ).rejects.toThrow();
  });
});

describe("authorization and post-await guards", () => {
  it.each(["capability", "environment", "project", "revoked", "expired"])(
    "denies %s machine grants",
    async (kind) => {
      const f = fixture();
      if (kind === "capability") f.state.client.operations = ["finding.read"];
      if (kind === "environment") f.state.client.environment = "preview";
      if (kind === "project") f.state.client.projectId = id(900);
      if (kind === "revoked") f.state.client.revokedAt = at;
      if (kind === "expired") f.state.now = new Date(owner.expiresAt);
      await expect(f.submit()).rejects.toThrow();
      expect(f.records.assertReferences).not.toHaveBeenCalled();
    },
  );
  it("rejects machine credentials that the actual adapter did not authenticate", async () => {
    const f = fixture();
    await expect(
      f.service.submitFindingProposal("af_" + "y".repeat(43), "key", f.value),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIAL" });
  });
  it("reauthorizes an exact historical key after expiry or revocation", async () => {
    const f = fixture();
    await f.submit();
    f.state.client.revokedAt = at;
    await expect(f.submit()).rejects.toMatchObject({ code: "REVOKED" });
    f.state.client.revokedAt = null;
    f.state.now = new Date(owner.expiresAt);
    await expect(f.submit()).rejects.toMatchObject({ code: "EXPIRED" });
  });
  it.each([
    "assertReferences",
    "getEvidence",
    "validateEvidenceReference",
  ] as const)("checks expiry after %s before an insert", async (method) => {
    const f = fixture();
    const original = f.records[method].getMockImplementation()!;
    if (method === "assertReferences")
      f.records.assertReferences.mockImplementation(async (value) => {
        await (original as typeof f.records.assertReferences)(value);
        f.state.now = new Date(owner.expiresAt);
      });
    if (method === "getEvidence")
      f.records.getEvidence.mockImplementation(async (value) => {
        const result = await (original as typeof f.records.getEvidence)(value);
        f.state.now = new Date(owner.expiresAt);
        return result;
      });
    if (method === "validateEvidenceReference")
      f.records.validateEvidenceReference.mockImplementation(async (value) => {
        await (original as typeof f.records.validateEvidenceReference)(value);
        f.state.now = new Date(owner.expiresAt);
      });
    await expect(f.submit()).rejects.toMatchObject({ code: "EXPIRED" });
    expect(f.records.insertFindingProposal).not.toHaveBeenCalled();
  });
  it("checks owner expiry after the locked read before reviewing", async () => {
    const f = fixture();
    await f.submit();
    const value = f.reviewInput();
    f.records.getFindingProposal.mockImplementation(async () => {
      f.state.now = new Date(owner.expiresAt);
      return copy(f.state.detail);
    });
    await expect(
      f.service.reviewFindingProposal(owner, "review-1", value),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.records.reviewFindingProposal).not.toHaveBeenCalled();
  });
  it("checks expiry after insert, idempotency and outer adapter completion", async () => {
    for (const stage of ["insert", "idempotency", "outer"]) {
      const f = fixture();
      if (stage === "insert")
        f.records.insertFindingProposal.mockImplementation(async (detail) => {
          f.state.now = new Date(owner.expiresAt);
          return detail;
        });
      if (stage === "idempotency") {
        const original = f.records.idempotent;
        f.records.idempotent = async (...args) => {
          const result = await original(...args);
          f.state.now = new Date(owner.expiresAt);
          return result;
        };
      }
      if (stage === "outer") {
        const original = f.port.withClient;
        f.port.withClient = async (...args) => {
          const result = await original(...args);
          f.state.now = new Date(owner.expiresAt);
          return result;
        };
      }
      await expect(f.submit()).rejects.toMatchObject({ code: "EXPIRED" });
    }
  });
  it.each(["principal", "session", "machine-principal", "expired"])(
    "preserves actual owner authentication for %s failures",
    async (kind) => {
      const f = fixture();
      const receipt = await f.submit();
      const identity = { ...owner };
      if (kind === "principal") identity.principalId = "user:forged";
      if (kind === "session") identity.sessionId = "forged-session";
      if (kind === "machine-principal")
        identity.principalId = "foundation-client:" + id(2);
      if (kind === "expired") identity.expiresAt = at;
      await expect(
        f.service.getFindingProposalOwner(identity, {
          projectId,
          id: receipt.record.proposalId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
});

describe("review and replay boundary completion", () => {
  it("withholds output when the actual adapter reports revocation after callback work", async () => {
    const f = fixture();
    const original = f.port.withClient;
    f.port.withClient = async (...args) => {
      await original(...args);
      throw new FoundationError("REVOKED");
    };
    await expect(f.submit()).rejects.toMatchObject({ code: "REVOKED" });
  });
  it.each(["review", "anchor", "validation"])(
    "checks owner expiry after %s awaited output",
    async (stage) => {
      const f = fixture();
      await f.submit();
      const value = f.reviewInput();
      if (stage === "review") {
        const original =
          f.records.reviewFindingProposal.getMockImplementation()!;
        f.records.reviewFindingProposal.mockImplementation(async (request) => {
          const result = await original(request);
          f.state.now = new Date(owner.expiresAt);
          return result;
        });
      }
      if (stage === "anchor") {
        const original = f.records.getEvidence.getMockImplementation()!;
        f.records.getEvidence.mockImplementation(async (evidenceId) => {
          const result = await original(evidenceId);
          if (evidenceId !== id(3) && evidenceId !== id(4))
            f.state.now = new Date(owner.expiresAt);
          return result;
        });
      }
      if (stage === "validation") {
        const original =
          f.records.validateEvidenceReference.getMockImplementation()!;
        f.records.validateEvidenceReference.mockImplementation(
          async (reference) => {
            await original(reference);
            if (
              reference.sourceId !== f.value.citations[0]!.sourceId &&
              reference.sourceId !== f.value.citations[1]!.sourceId
            )
              f.state.now = new Date(owner.expiresAt);
          },
        );
      }
      await expect(
        f.service.reviewFindingProposal(owner, "review-1", value),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );
  it("reauthorizes owner replay and denies a forged session without current reads", async () => {
    const f = fixture();
    await f.submit();
    const value = f.reviewInput("reject");
    await f.service.reviewFindingProposal(owner, "review-1", value);
    f.records.getFindingProposal.mockClear();
    await expect(
      f.service.reviewFindingProposal(
        { ...owner, sessionId: "forged" },
        "review-1",
        value,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    f.state.now = new Date(owner.expiresAt);
    await expect(
      f.service.reviewFindingProposal(owner, "review-1", value),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.records.getFindingProposal).not.toHaveBeenCalled();
  });
  it("rejects output getters, substituted proof and a noncanonical stored envelope", async () => {
    for (const kind of ["getter", "proof", "canonicalization"]) {
      const f = fixture();
      await f.submit();
      const stored = f.state.receipts.get("submit-1")!.value as {
        proof: { detail: FoundationFindingProposalDetail };
        correlationId: string;
      };
      const getter = vi.fn(() => true);
      if (kind === "getter") {
        f.records.idempotent = async () => {
          const result = { value: stored, replayed: true };
          Object.defineProperty(result, "replayed", {
            get: getter,
            enumerable: true,
          });
          return result as never;
        };
      }
      if (kind === "proof")
        stored.proof.detail.capture.originalContent += "substitution";
      if (kind === "canonicalization")
        stored.correlationId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
      await expect(f.submit()).rejects.toThrow();
      expect(getter).not.toHaveBeenCalled();
    }
  });
});

describe("strict bytes, safe descriptors and callback receipts", () => {
  it.each(["extra-authority", "nul", "surrogate", "encoded-byte-limit"])(
    "rejects %s input",
    async (kind) => {
      const f = fixture();
      const raw = copy(f.value) as unknown as Record<string, unknown>;
      if (kind === "extra-authority") raw.actor = owner;
      if (kind === "nul") raw.originalContent = "Invalid\u0000source";
      if (kind === "surrogate") raw.originalContent = "Invalid\ud800";
      if (kind === "encoded-byte-limit") raw.extra = "\u{1f4a1}".repeat(150000);
      await expect(
        f.service.submitFindingProposal(token, "key", raw),
      ).rejects.toThrow();
      expect(f.state.machineRequests).toHaveLength(0);
    },
  );
  it("never invokes untrusted input or output getters", async () => {
    const f = fixture();
    const getter = vi.fn(() => f.value.originalContent);
    const raw = { ...f.value };
    Object.defineProperty(raw, "originalContent", {
      get: getter,
      enumerable: true,
    });
    await expect(
      f.service.submitFindingProposal(token, "key", raw),
    ).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    f.records.insertFindingProposal.mockImplementation(async (detail) => {
      const result = copy(detail);
      Object.defineProperty(result.capture, "originalContent", {
        get: getter,
        enumerable: true,
      });
      return result;
    });
    await expect(f.submit()).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it("rejects canonicalized output and exact insertion substitution", async () => {
    for (const kind of ["unknown", "uuid-case", "source-substitution"]) {
      const f = fixture();
      f.records.insertFindingProposal.mockImplementation(async (detail) => {
        const result = copy(detail);
        if (kind === "unknown")
          Object.assign(result.capture, { hiddenAuthority: true });
        if (kind === "uuid-case") {
          result.capture.id =
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase();
          result.suggestion.captureId = result.capture.id;
          result.suggestion.proposal.binding.captureId = result.capture.id;
        }
        if (kind === "source-substitution") {
          result.capture.originalContent = "Other source";
          result.suggestion.proposal.binding.sourceDigest =
            bytes("Other source");
          result.suggestion.proposal.contentDigest = foundationDigest(
            result.suggestion.proposal.binding,
          );
        }
        return result;
      });
      await expect(f.submit()).rejects.toThrow();
    }
  });
  it.each([
    "principalId",
    "operation",
    "projectId",
    "environment",
    "requestDigest",
    "correlationId",
    "extra",
  ])("rejects stored envelope substitution in %s", async (field) => {
    const f = fixture();
    await f.submit();
    const stored = f.state.receipts.get("submit-1")!.value as Record<
      string,
      unknown
    >;
    stored[field] =
      field === "requestDigest"
        ? "0".repeat(64)
        : field === "correlationId" || field === "projectId"
          ? id(900)
          : "substituted";
    await expect(f.submit()).rejects.toThrow();
  });
  it("binds request digests to actual principal and operation", async () => {
    const f = fixture();
    await f.submit();
    f.state.client.id = id(900);
    await expect(f.submit()).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(
      f.service.reviewFindingProposal(
        owner,
        "submit-1",
        f.reviewInput("reject"),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it.each([
    "new-as-replay",
    "replay-as-new",
    "nonboolean",
    "extra",
    "substituted-output",
    "duplicate",
  ])("rejects %s idempotency callbacks", async (kind) => {
    const f = fixture();
    if (kind === "replay-as-new") await f.submit();
    const original = f.records.idempotent;
    f.records.idempotent = async (key, digest, perform) => {
      const result = await original(key, digest, perform);
      if (kind === "duplicate") {
        try {
          await perform();
        } catch {
          /* A broken adapter swallowing denial must still fail. */
        }
      }
      if (kind === "new-as-replay") return { ...result, replayed: true };
      if (kind === "replay-as-new") return { ...result, replayed: false };
      if (kind === "nonboolean")
        return { ...result, replayed: "false" as unknown as boolean };
      if (kind === "extra") return Object.assign(result, { extra: true });
      if (kind === "substituted-output")
        (result.value as Record<string, unknown>).correlationId = id(900);
      return result;
    };
    await expect(f.submit()).rejects.toThrow();
  });
  it("closes retained idempotency callbacks before any late side effect", async () => {
    const f = fixture();
    await f.submit();
    const original = f.records.idempotent;
    let late: (() => Promise<unknown>) | undefined;
    f.records.idempotent = async (key, digest, perform) => {
      late = perform;
      return original(key, digest, perform);
    };
    await f.submit();
    await expect(late!()).rejects.toThrow();
    expect(f.records.insertFindingProposal).toHaveBeenCalledTimes(1);
  });
  it.each(["substitution", "duplicate", "missing"])(
    "rejects %s outer access callbacks",
    async (kind) => {
      const f = fixture();
      const original = f.port.withClient;
      f.port.withClient = async (request, action) => {
        if (kind === "missing") return {} as never;
        const result = await original(request, action);
        if (kind === "duplicate") {
          try {
            await original(request, action);
          } catch {
            /* Track swallowed callback denial. */
          }
        }
        if (kind === "substitution")
          return { ...(result as object), extra: true } as typeof result;
        return result;
      };
      await expect(f.submit()).rejects.toThrow();
    },
  );
});
