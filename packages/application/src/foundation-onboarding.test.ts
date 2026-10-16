import { describe, expect, it } from "vitest";
import {
  foundationOnboardingMachineDetailSchema,
  type FoundationClient,
  type FoundationEvidence,
  type FoundationOnboardingDecision,
  type FoundationOnboardingOutcome,
  type FoundationOnboardingPreconditions,
  type FoundationOnboardingProposal,
  type FoundationOnboardingReviewInput,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import type {
  FoundationMachineRequest,
  FoundationOwnerRequest,
} from "./agent-foundation";
import {
  createFoundationOnboardingService,
  type FoundationOnboardingPort,
  type FoundationOnboardingRecords,
} from "./foundation-onboarding";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + n.toString().padStart(12, "0");
const PROJECT = id(1),
  HOST = id(2),
  CLIENT = id(3),
  EVIDENCE = id(4),
  LINK = id(5),
  FOREIGN = id(6);
const TOKEN = "af_" + "a".repeat(43);
const START = "2026-10-16T12:00:00.000Z";
const OWNER = {
  principalId: "user:owner",
  expiresAt: "2026-11-01T00:00:00Z",
  sessionId: "owner-session",
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sign = <T>(value: T) => ({
  ...value,
  contentDigest: foundationDigest(value),
});
const resign = <T extends { contentDigest: string }>(value: T): T => {
  const { contentDigest: _digest, ...rest } = value;
  return sign(rest) as T;
};
const host = {
  id: HOST,
  kind: "host",
  name: "Existing host",
  subtype: "vps",
  externalUrl: "https://host.example/",
  parentResourceId: id(9),
  state: "running",
  lastObservedAt: "2026-10-15T00:00:00Z",
};
const target = {
  mode: "create" as const,
  name: "New host",
  subtype: "vps",
  externalUrl: "https://new.example/",
  identity: {
    namespace: "provider" as const,
    authority: "account:owner",
    externalId: "CaseSensitive-Host",
    assurance: "owner_asserted" as const,
  },
};
const proposalInput = (create = false) => ({
  projectId: PROJECT,
  target: create ? copy(target) : { mode: "reuse" as const, resourceId: HOST },
  relationship: "supports" as const,
  rationale: "Owner should review the exact inventory identity",
  evidenceIds: [EVIDENCE],
});

function fixture() {
  let now = new Date(START),
    sequence = 1000;
  const proposals = new Map<string, FoundationOnboardingProposal>();
  const decisions = new Map<string, FoundationOnboardingDecision>();
  const outcomes = new Map<string, FoundationOnboardingOutcome>();
  const receipts = new Map<string, { digest: string; value: unknown }>();
  const state = {
    client: {
      schemaVersion: 1,
      id: CLIENT,
      projectId: PROJECT,
      name: "Scoped onboarding",
      operations: ["onboarding.propose", "onboarding.read"],
      environment: "local",
      createdAt: "2026-10-01T00:00:00Z",
      expiresAt: "2026-10-31T00:00:00Z",
      revokedAt: null,
      createdBy: OWNER.principalId,
    } as FoundationClient,
    inspection: {
      resource: copy(host),
      link: null,
      identityResourceId: null,
    } as FoundationOnboardingPreconditions,
    evidence: {
      schemaVersion: 1,
      id: EVIDENCE,
      projectId: PROJECT,
      sourceKind: "capture",
      sourceId: "capture-1",
      sourceVersion: null,
      contentDigest: "a".repeat(64),
      locator: "capture:canonical",
      observedAt: null,
      availability: "available",
      ingestedAt: START,
      recordedBy: "user:owner",
      verification: "unverified",
    } as FoundationEvidence | null,
    sourceError: null as Error | null,
    refsError: null as Error | null,
    afterIo: null as ((name: string) => void) | null,
    proposalTransform: null as
      | ((record: FoundationOnboardingProposal) => FoundationOnboardingProposal)
      | null,
    decisionTransform: null as
      | ((record: FoundationOnboardingDecision) => FoundationOnboardingDecision)
      | null,
    outcomeTransform: null as
      | ((record: FoundationOnboardingOutcome) => FoundationOnboardingOutcome)
      | null,
    pageTransform: null as
      | ((page: {
          items: FoundationOnboardingProposal[];
          nextAfterId: string | null;
        }) => unknown)
      | null,
    receiptTransform: null as
      ((value: { value: unknown; replayed: boolean }) => unknown) | null,
    ownerResultTransform: null as ((result: unknown) => unknown) | null,
    portMode: "normal" as "normal" | "twice" | "late",
    receiptMode: "normal" as "normal" | "twice" | "late",
    latePort: null as (() => Promise<unknown>) | null,
    lateReceipt: null as (() => Promise<unknown>) | null,
    sessionRevoked: false,
    requests: [] as (FoundationMachineRequest | FoundationOwnerRequest)[],
    effects: [] as string[],
    inspectCalls: [] as boolean[],
    applyInputs: [] as Parameters<
      FoundationOnboardingRecords["applyInventory"]
    >[0][],
  };
  let request: FoundationMachineRequest | FoundationOwnerRequest;
  async function step(name: string) {
    state.effects.push(name);
    await Promise.resolve();
    state.afterIo?.(name);
  }
  const unused = async (): Promise<never> => {
    throw new Error("Unexpected unrelated application operation");
  };
  const records: FoundationOnboardingRecords = {
    async idempotent<T>(
      key: string,
      digest: string,
      perform: () => Promise<T>,
    ): Promise<{ value: T; replayed: boolean }> {
      await step("receipt.enter");
      if (state.receiptMode === "late") {
        state.lateReceipt = perform;
        return { value: null as T, replayed: false };
      }
      const receiptKey =
        request.projectId +
        ":" +
        ("principalId" in request ? request.principalId : CLIENT) +
        ":" +
        key;
      const previous = receipts.get(receiptKey);
      let result: { value: unknown; replayed: boolean };
      if (previous) {
        if (previous.digest !== digest)
          throw new FoundationError("IDEMPOTENCY_CONFLICT");
        result = { value: copy(previous.value), replayed: true };
      } else {
        const value = await perform();
        if (state.receiptMode === "twice") await perform();
        receipts.set(receiptKey, { digest, value: copy(value) });
        result = { value: copy(value), replayed: false };
      }
      await step("receipt.exit");
      return (state.receiptTransform?.(result) ?? result) as {
        value: T;
        replayed: boolean;
      };
    },
    async assertReferences() {
      await step("references");
      if (state.refsError) throw state.refsError;
    },
    async getEvidence() {
      await step("evidence");
      return copy(state.evidence);
    },
    async validateEvidenceReference(reference) {
      expect(reference.sourceId).toBe("capture-1");
      expect(reference.projectId).toBe(PROJECT);
      await step("source");
      if (state.sourceError) throw state.sourceError;
    },
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
    async getProposal(proposalId) {
      await step("proposal.read");
      return copy(proposals.get(proposalId) ?? null);
    },
    async insertProposal(record) {
      await step("proposal.insert");
      const value = state.proposalTransform?.(copy(record)) ?? copy(record);
      proposals.set(value.id, value);
      return copy(value);
    },
    async listProposals(query) {
      await step("proposal.list");
      const eligible = [...proposals.values()]
        .filter(
          (entry) =>
            entry.projectId === request.projectId &&
            entry.environment === request.environment &&
            Date.parse(entry.recordedAt) <= Date.parse(query.asOf),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      if (
        query.afterId !== null &&
        !eligible.some((entry) => entry.id === query.afterId)
      )
        throw new FoundationError("INVALID_REFERENCE");
      const remaining = eligible.filter(
        (entry) => query.afterId === null || entry.id > query.afterId,
      );
      const items = remaining.slice(0, query.limit);
      const page = {
        items: copy(items),
        nextAfterId: remaining.length > items.length ? items.at(-1)!.id : null,
      };
      return (state.pageTransform?.(page) ?? page) as typeof page;
    },
    async getCurrentDecision(proposalId) {
      await step("decision.read");
      return copy(decisions.get(proposalId) ?? null);
    },
    async insertDecision(record, expectedVersion) {
      await step("decision.insert");
      if ((decisions.get(record.proposalId)?.version ?? 0) !== expectedVersion)
        throw new FoundationError("VERSION_CONFLICT");
      const value = state.decisionTransform?.(copy(record)) ?? copy(record);
      decisions.set(value.proposalId, value);
      return copy(value);
    },
    async getOutcome(proposalId) {
      await step("outcome.read");
      return copy(outcomes.get(proposalId) ?? null);
    },
    async inspectProposal(_proposal, lock) {
      state.inspectCalls.push(lock);
      await step("inventory.inspect");
      return copy(state.inspection);
    },
    async applyInventory(write) {
      state.applyInputs.push(copy(write));
      await step("inventory.apply");
      if (outcomes.has(write.proposal.id))
        throw new FoundationError("VERSION_CONFLICT");
      const p = write.proposal,
        d = write.decision;
      const resource =
        p.target.mode === "reuse"
          ? copy(state.inspection.resource!)
          : {
              id: write.resourceId,
              kind: "host",
              name: p.target.name,
              subtype: p.target.subtype,
              externalUrl: p.target.externalUrl,
              parentResourceId: null,
              state: null,
              lastObservedAt: null,
            };
      let value: FoundationOnboardingOutcome = sign({
        schemaVersion: 1 as const,
        id: write.outcomeId,
        projectId: p.projectId,
        proposalId: p.id,
        proposalVersion: 1 as const,
        proposalDigest: p.contentDigest,
        decisionId: d.id,
        decisionVersion: d.version,
        decisionDigest: d.contentDigest,
        resource,
        link: {
          id: write.linkId,
          projectId: p.projectId,
          resourceId: write.resourceId,
          type: p.relationship,
          lifecycle: "active" as const,
        },
        resourceCreated: p.target.mode === "create",
        linkCreated: state.inspection.link === null,
        identity: p.target.mode === "create" ? p.target.identity : null,
        recordedBy: write.recordedBy,
        recordedAt: write.recordedAt,
        correlationId: write.correlationId,
      });
      value = state.outcomeTransform?.(value) ?? value;
      outcomes.set(p.id, value);
      return copy(value);
    },
  };
  const port: FoundationOnboardingPort = {
    async withClient(req, action) {
      request = req;
      state.requests.push(req);
      expect(req.tokenDigest).toBe(foundationTokenDigest(TOKEN));
      return action(copy(state.client), records);
    },
    async withOwner(req, action) {
      request = req;
      state.requests.push(req);
      if (
        state.sessionRevoked ||
        req.sessionId !== OWNER.sessionId ||
        req.projectId !== PROJECT ||
        req.environment !== "local"
      )
        throw new FoundationError("FORBIDDEN");
      if (state.portMode === "late") {
        state.latePort = () => action(records);
        return null as never;
      }
      const result = await action(records);
      if (state.portMode === "twice") await action(records);
      await step("owner.exit");
      return (state.ownerResultTransform?.(result) ?? result) as typeof result;
    },
  };
  const service = createFoundationOnboardingService(port, {
    environment: "local",
    now: () => new Date(now),
    createId: () => id(sequence++),
  });
  const propose = async (create = false, key = "proposal") =>
    (await service.propose(TOKEN, key, proposalInput(create))).record;
  async function reviewInput(
    proposal: FoundationOnboardingProposal,
    decision: FoundationOnboardingReviewInput["decision"] = "approved",
  ) {
    const preview = await service.preview(OWNER, {
      projectId: PROJECT,
      id: proposal.id,
    });
    return {
      projectId: PROJECT,
      proposalId: proposal.id,
      expectedProposalDigest: proposal.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: decisions.get(proposal.id)?.version ?? 0,
      decision,
      reason: "Owner reviewed exact canonical identity and inventory",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      inventoryReviewed: decision === "approved",
    };
  }
  async function approve(
    proposal: FoundationOnboardingProposal,
    key = "review",
  ) {
    const raw = await reviewInput(proposal);
    return { raw, result: await service.review(OWNER, key, raw) };
  }
  const applyInput = (
    proposal: FoundationOnboardingProposal,
    decision: FoundationOnboardingDecision,
  ) => ({
    projectId: PROJECT,
    proposalId: proposal.id,
    expectedProposalDigest: proposal.contentDigest,
    decisionId: decision.id,
    expectedDecisionVersion: decision.version,
    expectedDecisionDigest: decision.contentDigest,
  });
  return {
    service,
    state,
    records,
    proposals,
    decisions,
    outcomes,
    receipts,
    propose,
    approve,
    reviewInput,
    applyInput,
    setNow: (value: string) => {
      now = new Date(value);
    },
  };
}

function populate(f: ReturnType<typeof fixture>, count: number) {
  for (let i = 0; i < count; i++) {
    const p = sign({
      ...proposalInput(),
      schemaVersion: 1 as const,
      id: id(200 + i),
      version: 1 as const,
      environment: "local" as const,
      recordedBy: "foundation-client:" + CLIENT,
      recordedAt: "2026-10-16T11:00:00Z",
    });
    f.proposals.set(p.id, p);
  }
}

describe("reviewed foundation inventory onboarding", () => {
  it.each(["receipt.exit", "owner.exit"])(
    "withholds a first review result expiring during %s",
    async (boundary) => {
      const f = fixture(),
        p = await f.propose(),
        raw = await f.reviewInput(p);
      f.state.effects = [];
      f.state.afterIo = (operation) => {
        if (operation === boundary) f.setNow(raw.expiresAt);
      };
      await expect(
        f.service.review(OWNER, "review-expiry-at-delivery", raw),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      expect(f.decisions.size).toBe(1);
      if (boundary === "receipt.exit")
        expect(f.state.effects).not.toContain("owner.exit");
    },
  );
  it("recovers the exact expired historical review after withholding first delivery", async () => {
    const f = fixture(),
      p = await f.propose(),
      raw = await f.reviewInput(p);
    f.state.afterIo = (operation) => {
      if (operation === "owner.exit") f.setNow(raw.expiresAt);
    };
    await expect(
      f.service.review(OWNER, "review-delivery-recovery", raw),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    f.state.afterIo = null;
    const historical = await f.service.review(
      OWNER,
      "review-delivery-recovery",
      raw,
    );
    expect(historical.replayed).toBe(true);
    expect(historical.record).toEqual(f.decisions.get(p.id));
    expect(historical.record.expiresAt).toBe(raw.expiresAt);
    const current = await f.service.getOwner(OWNER, {
      projectId: PROJECT,
      id: p.id,
    });
    expect(current.currentDecision).toEqual(historical.record);
  });
  it("stores exact nonsecret intent and machine paths never inspect inventory", async () => {
    const f = fixture();
    const raw = proposalInput();
    raw.target = { mode: "reuse", resourceId: FOREIGN };
    const saved = await f.service.propose(TOKEN, "intent", raw);
    expect(saved.record.target).toEqual(raw.target);
    expect(saved.record.recordedBy).toBe("foundation-client:" + CLIENT);
    expect(saved.record.rationale).toBe(raw.rationale);
    await f.service.get(TOKEN, { projectId: PROJECT, id: saved.record.id });
    await f.service.list(TOKEN, { projectId: PROJECT, limit: 25 });
    expect(f.state.inspectCalls).toEqual([]);
    expect(f.state.applyInputs).toEqual([]);
    expect(f.state.client.operations).not.toContain("resources.read");
  });
  it("previews reuse with a stable digest across clocks and preserves its full snapshot", async () => {
    const f = fixture(),
      p = await f.propose();
    const first = await f.service.preview(OWNER, {
      projectId: PROJECT,
      id: p.id,
    });
    f.setNow("2026-10-16T12:01:00Z");
    const second = await f.service.preview(OWNER, {
      projectId: PROJECT,
      id: p.id,
    });
    expect(first.canApply).toBe(true);
    expect(first.preconditions.resource).toEqual(host);
    expect(second.previewDigest).toBe(first.previewDigest);
    expect(second.evaluatedAt).not.toBe(first.evaluatedAt);
    expect(f.state.inspectCalls).toEqual([false, false]);
  });
  it.each([
    [
      "resource_unavailable",
      { resource: null, link: null, identityResourceId: null },
    ],
    [
      "resource_not_host",
      {
        resource: { ...host, kind: "service" },
        link: null,
        identityResourceId: null,
      },
    ],
    [
      "archived_connection",
      {
        resource: host,
        link: {
          id: LINK,
          projectId: PROJECT,
          resourceId: HOST,
          type: "supports",
          lifecycle: "archived",
        },
        identityResourceId: null,
      },
    ],
  ] as const)(
    "blocks %s without mutating inventory",
    async (blocker, inspection) => {
      const f = fixture(),
        p = await f.propose();
      f.state.inspection = copy(inspection);
      expect(
        (await f.service.preview(OWNER, { projectId: PROJECT, id: p.id }))
          .blockers,
      ).toContain(blocker);
      const raw = await f.reviewInput(p);
      await expect(
        f.service.review(OWNER, "approve", raw),
      ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
      expect(f.state.applyInputs).toHaveLength(0);
    },
  );
  it.each([true, false])(
    "blocks existing create identity with resource present=%s",
    async (present) => {
      const f = fixture(),
        p = await f.propose(true);
      f.state.inspection = {
        resource: present ? copy(host) : null,
        link: null,
        identityResourceId: HOST,
      };
      const preview = await f.service.preview(OWNER, {
        projectId: PROJECT,
        id: p.id,
      });
      expect(preview.blockers).toEqual([
        present ? "identity_conflict" : "identity_unresolved",
      ]);
    },
  );
  it.each([
    "foreign-link",
    "wrong-relationship",
    "wrong-resource",
    "unclaimed-create",
  ])("rejects malformed or contradictory inspection: %s", async (mode) => {
    const f = fixture(),
      p = await f.propose(mode === "unclaimed-create");
    if (mode === "foreign-link")
      f.state.inspection.link = {
        id: LINK,
        projectId: FOREIGN,
        resourceId: HOST,
        type: "supports",
        lifecycle: "active",
      };
    if (mode === "wrong-relationship")
      f.state.inspection.link = {
        id: LINK,
        projectId: PROJECT,
        resourceId: HOST,
        type: "relates_to",
        lifecycle: "active",
      };
    if (mode === "wrong-resource")
      f.state.inspection.resource = { ...host, id: FOREIGN };
    await expect(
      f.service.preview(OWNER, { projectId: PROJECT, id: p.id }),
    ).rejects.toMatchObject({ name: "FoundationWorkflowUnavailableError" });
  });
  it.each(["missing", "foreign", "unavailable", "invalid-source"])(
    "uses a safe source blocker for %s evidence",
    async (mode) => {
      const f = fixture(),
        p = await f.propose();
      if (mode === "missing") f.state.evidence = null;
      if (mode === "foreign") f.state.evidence!.projectId = FOREIGN;
      if (mode === "unavailable")
        f.state.evidence!.availability = "unavailable";
      if (mode === "invalid-source")
        f.state.sourceError = new FoundationError(
          "INVALID_REFERENCE",
          "private source detail",
        );
      const preview = await f.service.preview(OWNER, {
        projectId: PROJECT,
        id: p.id,
      });
      expect(preview.blockers).toEqual(["source_unavailable"]);
      expect(JSON.stringify(preview)).not.toContain("private source detail");
      const reject = await f.reviewInput(p, "rejected");
      expect(
        (await f.service.review(OWNER, "reject", reject)).record.decision,
      ).toBe("rejected");
    },
  );
  it("keeps authorization and expiry errors distinct from source unavailability", async () => {
    const f = fixture(),
      p = await f.propose();
    f.state.sourceError = new FoundationError("EXPIRED");
    await expect(
      f.service.preview(OWNER, { projectId: PROJECT, id: p.id }),
    ).rejects.toMatchObject({ code: "EXPIRED" });
  });
  it("checks scoped evidence on submission without looking up global inventory", async () => {
    const f = fixture();
    f.state.evidence!.projectId = FOREIGN;
    await expect(f.propose()).rejects.toMatchObject({
      code: "INVALID_REFERENCE",
    });
    expect(f.proposals.size).toBe(0);
    expect(f.state.inspectCalls).toEqual([]);
  });
  it("binds proposal and preview digests and current decision CAS", async () => {
    const f = fixture(),
      p = await f.propose(),
      raw = await f.reviewInput(p);
    await expect(
      f.service.review(OWNER, "wrong-proposal", {
        ...raw,
        expectedProposalDigest: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      f.service.review(OWNER, "wrong-preview", {
        ...raw,
        expectedPreviewDigest: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const decision = await f.service.review(OWNER, "approved", raw);
    expect(decision.record.version).toBe(1);
    await expect(f.service.review(OWNER, "stale", raw)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    await expect(
      f.service.review(OWNER, "overflow", {
        ...raw,
        expectedDecisionVersion: 2147483647,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });
  it.each([0, -1, 31 * 86400000])(
    "rejects new decision expiry offset %s",
    async (offset) => {
      const f = fixture(),
        p = await f.propose(),
        raw = await f.reviewInput(p);
      await expect(
        f.service.review(OWNER, "expiry", {
          ...raw,
          expiresAt: new Date(Date.parse(START) + offset).toISOString(),
        }),
      ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
      expect(f.decisions.size).toBe(0);
    },
  );
  it("does not authenticate an inventoryReviewed boolean as an owner session", async () => {
    const f = fixture(),
      p = await f.propose(),
      raw = await f.reviewInput(p);
    await expect(
      f.service.review(
        { ...OWNER, principalId: "foundation-client:" + CLIENT },
        "machine",
        raw,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.service.review(
        { ...OWNER, sessionId: "invented-session" },
        "session",
        raw,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      f.service.review(OWNER, "unreviewed", {
        ...raw,
        inventoryReviewed: false,
      }),
    ).rejects.toThrow();
    expect(f.decisions.size).toBe(0);
  });
  it("reuses the exact host and active connection without editing host fields", async () => {
    const f = fixture(),
      p = await f.propose();
    f.state.inspection.link = {
      id: LINK,
      projectId: PROJECT,
      resourceId: HOST,
      type: "supports",
      lifecycle: "active",
    };
    const { result } = await f.approve(p);
    const raw = f.applyInput(p, result.record);
    const applied = await f.service.apply(OWNER, "apply", raw);
    expect(applied.record.resource).toEqual(host);
    expect(applied.record.link.id).toBe(LINK);
    expect(applied.record.resourceCreated).toBe(false);
    expect(applied.record.linkCreated).toBe(false);
    expect(applied.record.identity).toBeNull();
    expect(f.state.inspection.resource).toEqual(host);
    expect(f.state.inspectCalls.at(-1)).toBe(true);
    expect(f.state.applyInputs[0]!.recordedBy).toBe(OWNER.principalId);
    const owner = await f.service.getOwner(OWNER, {
      projectId: PROJECT,
      id: p.id,
    });
    expect(owner.outcome).toEqual(applied.record);
    const machine = await f.service.get(TOKEN, {
      projectId: PROJECT,
      id: p.id,
    });
    expect(foundationOnboardingMachineDetailSchema.parse(machine)).toEqual(
      machine,
    );
    expect(Object.keys(machine.currentDecision!).sort()).toEqual([
      "decision",
      "expiresAt",
      "id",
      "version",
    ]);
    expect(Object.keys(machine.outcome!).sort()).toEqual([
      "id",
      "linkId",
      "recordedAt",
      "resourceId",
    ]);
    expect(JSON.stringify(machine)).not.toContain("Existing host");
  });
  it("creates a host with the exact owner claim and a new canonical link", async () => {
    const f = fixture();
    f.state.inspection = {
      resource: null,
      link: null,
      identityResourceId: null,
    };
    const p = await f.propose(true),
      { result } = await f.approve(p);
    const applied = await f.service.apply(
      OWNER,
      "create",
      f.applyInput(p, result.record),
    );
    expect(applied.record.resourceCreated).toBe(true);
    expect(applied.record.linkCreated).toBe(true);
    expect(applied.record.identity).toEqual(target.identity);
    expect(applied.record.resource).toMatchObject({
      kind: "host",
      name: target.name,
      subtype: target.subtype,
      externalUrl: target.externalUrl,
      parentResourceId: null,
      state: null,
      lastObservedAt: null,
    });
    expect(applied.record.resource.id).not.toBe(HOST);
  });
  it("requires a new owner review after changed resource preconditions", async () => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p);
    f.state.inspection.resource!.name = "Changed canonical host";
    await expect(
      f.service.apply(OWNER, "stale", f.applyInput(p, result.record)),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(f.state.applyInputs).toEqual([]);
    const renewed = await f.approve(p, "renewed");
    expect(
      (
        await f.service.apply(
          OWNER,
          "new",
          f.applyInput(p, renewed.result.record),
        )
      ).record.resource.name,
    ).toBe("Changed canonical host");
  });
  it("blocks a new identity claim introduced after create approval", async () => {
    const f = fixture();
    f.state.inspection = {
      resource: null,
      link: null,
      identityResourceId: null,
    };
    const p = await f.propose(true),
      { result } = await f.approve(p);
    f.state.inspection.identityResourceId = FOREIGN;
    await expect(
      f.service.apply(OWNER, "claim", f.applyInput(p, result.record)),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(f.state.applyInputs).toEqual([]);
  });
  it("requires the current approved unexpired decision and preserves expired reads", async () => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p),
      raw = f.applyInput(p, result.record);
    await expect(
      f.service.apply(OWNER, "wrong-id", { ...raw, decisionId: id(999) }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    f.setNow("2026-10-16T14:00:00Z");
    await expect(f.service.apply(OWNER, "expired", raw)).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
    expect(
      (await f.service.getOwner(OWNER, { projectId: PROJECT, id: p.id }))
        .currentDecision!.id,
    ).toBe(result.record.id);
    const revoke = await f.reviewInput(p, "revoked");
    const revoked = await f.service.review(OWNER, "revoke", revoke);
    await expect(
      f.service.apply(OWNER, "old-decision", raw),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      f.service.apply(OWNER, "revoked", f.applyInput(p, revoked.record)),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
  it("prevents applying the same proposal again under another key or later review", async () => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p);
    await f.service.apply(OWNER, "first", f.applyInput(p, result.record));
    await expect(
      f.service.apply(OWNER, "second", f.applyInput(p, result.record)),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const rereview = await f.approve(p, "rereview");
    await expect(
      f.service.apply(OWNER, "third", f.applyInput(p, rereview.result.record)),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(f.state.applyInputs).toHaveLength(1);
  });
  it("recovers immutable proposal, review and apply receipts without reloading changed current state", async () => {
    const f = fixture(),
      p = await f.propose(),
      { raw: review, result } = await f.approve(p),
      apply = f.applyInput(p, result.record);
    const first = await f.service.apply(OWNER, "apply", apply);
    const revoked = await f.reviewInput(p, "revoked");
    await f.service.review(OWNER, "revoke", revoked);
    f.proposals.clear();
    f.decisions.clear();
    f.outcomes.clear();
    f.state.evidence = null;
    f.state.inspection.resource!.name = "Edited";
    f.setNow("2026-10-17T12:00:00Z");
    f.state.effects = [];
    const replayed = await f.service.apply(OWNER, "apply", apply);
    const reviewed = await f.service.review(OWNER, "review", review);
    const proposed = await f.service.propose(
      TOKEN,
      "proposal",
      proposalInput(),
    );
    expect(replayed).toEqual({ ...first, replayed: true });
    expect(reviewed).toEqual({ ...result, replayed: true });
    expect(proposed.record).toEqual(p);
    expect(proposed.replayed).toBe(true);
    expect(
      f.state.effects.every((name) =>
        ["receipt.enter", "receipt.exit", "owner.exit"].includes(name),
      ),
    ).toBe(true);
    expect(f.state.applyInputs).toHaveLength(1);
  });
  it("rejects changed input on an exact receipt key and reauthorizes actual principals", async () => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p),
      raw = f.applyInput(p, result.record);
    await f.service.apply(OWNER, "apply", raw);
    await expect(
      f.service.apply(OWNER, "apply", {
        ...raw,
        expectedDecisionDigest: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    f.state.sessionRevoked = true;
    await expect(f.service.apply(OWNER, "apply", raw)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    f.state.client.revokedAt = START;
    await expect(
      f.service.propose(TOKEN, "proposal", proposalInput()),
    ).rejects.toMatchObject({ code: "REVOKED" });
  });
  it.each([
    "name",
    "parent",
    "link",
    "identity",
    "opaque-id",
    "timestamp",
    "correlation",
    "flags",
  ])("rejects substituted apply output: %s", async (field) => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p);
    f.state.outcomeTransform = (outcome) => {
      if (field === "name") outcome.resource.name = "Silently renamed";
      if (field === "parent") outcome.resource.parentResourceId = null;
      if (field === "link") outcome.link.id = FOREIGN;
      if (field === "identity") {
        outcome.resourceCreated = true;
        outcome.identity = target.identity;
      }
      if (field === "opaque-id") outcome.id = FOREIGN;
      if (field === "timestamp") outcome.recordedAt = "2026-10-16T12:00:01Z";
      if (field === "correlation") outcome.correlationId = FOREIGN;
      if (field === "flags") outcome.linkCreated = false;
      return resign(outcome);
    };
    await expect(
      f.service.apply(OWNER, "substitute", f.applyInput(p, result.record)),
    ).rejects.toMatchObject({ name: "FoundationWorkflowUnavailableError" });
  });
  it("rejects substituted proposal or decision opaque IDs despite recomputed digests", async () => {
    const f = fixture();
    f.state.proposalTransform = (value) => resign({ ...value, id: FOREIGN });
    await expect(f.propose()).rejects.toMatchObject({
      name: "FoundationWorkflowUnavailableError",
    });
    const g = fixture(),
      p = await g.propose(),
      raw = await g.reviewInput(p);
    g.state.decisionTransform = (value) => resign({ ...value, id: FOREIGN });
    await expect(
      g.service.review(OWNER, "substitute", raw),
    ).rejects.toMatchObject({ name: "FoundationWorkflowUnavailableError" });
  });
  it.each([
    "boolean",
    "correlation",
    "digest",
    "principal",
    "record",
    "hidden",
  ])("rejects malformed or substituted receipt %s", async (field) => {
    const f = fixture();
    f.state.receiptTransform = (result) => {
      const value = result.value as Record<string, unknown>;
      if (field === "boolean") return { ...result, replayed: "false" };
      if (field === "correlation") value.correlationId = FOREIGN;
      if (field === "digest") value.resultDigest = "b".repeat(64);
      if (field === "principal")
        value.principalId = "foundation-client:" + FOREIGN;
      if (field === "record") {
        (value.record as FoundationOnboardingProposal).id = FOREIGN;
      }
      if (field === "hidden")
        Object.defineProperty(value, "secret", {
          value: true,
          enumerable: false,
        });
      return result;
    };
    await expect(f.propose()).rejects.toMatchObject({
      name: "FoundationWorkflowUnavailableError",
    });
  });
  it("rejects input getters without calling them and rejects unsafe or normalized targets", async () => {
    const f = fixture();
    let called = 0;
    const raw = proposalInput();
    Object.defineProperty(raw, "rationale", {
      enumerable: true,
      get() {
        called++;
        return "secret";
      },
    });
    await expect(f.service.propose(TOKEN, "getter", raw)).rejects.toMatchObject(
      { code: "INVALID_REFERENCE" },
    );
    expect(called).toBe(0);
    await expect(
      f.service.propose(TOKEN, "userinfo", {
        ...proposalInput(true),
        target: {
          ...target,
          externalUrl: "https://secret:password@host.example",
        },
      }),
    ).rejects.toThrow();
    await expect(
      f.service.propose(TOKEN, "normalized", {
        ...proposalInput(),
        projectId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await expect(
      f.service.propose(TOKEN, "large", {
        ...proposalInput(),
        extra: "x".repeat(131073),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(f.state.effects).toEqual([]);
  });
  it("captures inputs before the first await", async () => {
    const f = fixture(),
      raw = proposalInput(),
      expected = copy(raw);
    f.state.afterIo = (name) => {
      if (name === "receipt.enter") {
        raw.rationale = "Mutated after admission";
        raw.evidenceIds.length = 0;
      }
    };
    const result = await f.service.propose(TOKEN, "captured", raw);
    expect(result.record.rationale).toBe(expected.rationale);
    expect(result.record.evidenceIds).toEqual(expected.evidenceIds);
  });
  it.each(["project", "environment", "capability"])(
    "rejects machine %s scope mismatch",
    async (field) => {
      const f = fixture();
      if (field === "project") f.state.client.projectId = FOREIGN;
      if (field === "environment") f.state.client.environment = "test";
      if (field === "capability")
        f.state.client.operations = ["onboarding.read"];
      await expect(f.propose()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(f.proposals.size).toBe(0);
    },
  );
  it.each([
    "references",
    "evidence",
    "source",
    "proposal.insert",
    "receipt.exit",
  ])("checks machine expiry after awaiting %s", async (name) => {
    const f = fixture();
    f.state.afterIo = (operation) => {
      if (operation === name) f.setNow("2026-10-31T00:00:00Z");
    };
    await expect(f.propose()).rejects.toMatchObject({ code: "EXPIRED" });
    if (["references", "evidence", "source"].includes(name))
      expect(f.proposals.size).toBe(0);
  });
  it.each([
    "proposal.read",
    "decision.read",
    "outcome.read",
    "inventory.inspect",
    "references",
    "evidence",
    "source",
    "inventory.apply",
    "receipt.exit",
    "owner.exit",
  ])("checks owner session after awaiting %s", async (name) => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p);
    f.state.afterIo = (operation) => {
      if (operation === name) f.setNow(OWNER.expiresAt);
    };
    await expect(
      f.service.apply(OWNER, "session-expiry", f.applyInput(p, result.record)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    if (!["inventory.apply", "receipt.exit", "owner.exit"].includes(name))
      expect(f.state.applyInputs).toEqual([]);
  });
  it.each([
    "outcome.read",
    "inventory.inspect",
    "source",
    "inventory.apply",
    "receipt.exit",
    "owner.exit",
  ])("checks decision expiry through apply delivery after %s", async (name) => {
    const f = fixture(),
      p = await f.propose(),
      { result } = await f.approve(p);
    f.state.afterIo = (operation) => {
      if (operation === name) f.setNow(result.record.expiresAt);
    };
    await expect(
      f.service.apply(OWNER, "decision-expiry", f.applyInput(p, result.record)),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    if (!["inventory.apply", "receipt.exit", "owner.exit"].includes(name))
      expect(f.state.applyInputs).toEqual([]);
  });
  it("stops a review after expiry during a wait before any decision write", async () => {
    const f = fixture(),
      p = await f.propose(),
      raw = await f.reviewInput(p);
    f.state.afterIo = (name) => {
      if (name === "inventory.inspect") f.setNow(raw.expiresAt);
    };
    await expect(
      f.service.review(OWNER, "review-expiry", raw),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(f.decisions.size).toBe(0);
  });
  it("rejects callback reuse and late callbacks after the outer boundary closes", async () => {
    const f = fixture(),
      p = await f.propose();
    f.state.portMode = "twice";
    await expect(
      f.service.preview(OWNER, { projectId: PROJECT, id: p.id }),
    ).rejects.toMatchObject({ name: "FoundationWorkflowUnavailableError" });
    const g = fixture(),
      q = await g.propose();
    g.state.portMode = "late";
    await expect(
      g.service.preview(OWNER, { projectId: PROJECT, id: q.id }),
    ).rejects.toMatchObject({ name: "FoundationWorkflowUnavailableError" });
    await expect(async () => g.state.latePort!()).rejects.toMatchObject({
      name: "FoundationWorkflowUnavailableError",
    });
    expect(g.state.inspectCalls).toEqual([]);
    const h = fixture();
    h.state.receiptMode = "twice";
    await expect(h.propose()).rejects.toMatchObject({
      name: "FoundationWorkflowUnavailableError",
    });
    expect(h.proposals.size).toBe(1);
    const j = fixture();
    j.state.receiptMode = "late";
    await expect(j.propose()).rejects.toMatchObject({
      name: "FoundationWorkflowUnavailableError",
    });
    await expect(j.state.lateReceipt!()).rejects.toMatchObject({
      name: "FoundationWorkflowUnavailableError",
    });
    expect(j.proposals.size).toBe(0);
  });
  it("rejects final owner output substitution", async () => {
    const f = fixture(),
      p = await f.propose();
    f.state.ownerResultTransform = (result) => ({
      ...(result as object),
      evaluatedAt: "2026-10-16T12:00:01Z",
    });
    await expect(
      f.service.preview(OWNER, { projectId: PROJECT, id: p.id }),
    ).rejects.toMatchObject({ name: "FoundationWorkflowUnavailableError" });
  });
  it("reaches more than 25 eligible proposals with principal-bound cutoff cursors", async () => {
    const f = fixture();
    populate(f, 63);
    const first = await f.service.list(TOKEN, {
      projectId: PROJECT,
      limit: 25,
    });
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).not.toBeNull();
    const second = await f.service.list(TOKEN, {
      projectId: PROJECT,
      limit: 25,
      cursor: first.nextCursor!,
    });
    const third = await f.service.list(TOKEN, {
      projectId: PROJECT,
      limit: 25,
      cursor: second.nextCursor!,
    });
    expect([...first.items, ...second.items, ...third.items]).toHaveLength(63);
    expect(third.nextCursor).toBeNull();
    await expect(
      f.service.listOwner(OWNER, {
        projectId: PROJECT,
        limit: 25,
        cursor: first.nextCursor!,
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(
      (await f.service.listOwner(OWNER, { projectId: PROJECT, limit: 25 }))
        .items,
    ).toHaveLength(25);
  });
  it("rejects invalid anchors and future cutoffs in otherwise canonical cursors", async () => {
    const f = fixture();
    populate(f, 30);
    const page = await f.service.list(TOKEN, { projectId: PROJECT, limit: 25 });
    const data = JSON.parse(
      Buffer.from(page.nextCursor!, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const encode = (value: unknown) => {
      const sorted = Object.fromEntries(
        Object.entries(value as object).sort(([a], [b]) => a.localeCompare(b)),
      );
      return Buffer.from(JSON.stringify(sorted)).toString("base64url");
    };
    await expect(
      f.service.list(TOKEN, {
        projectId: PROJECT,
        limit: 25,
        cursor: encode({ ...data, afterId: FOREIGN }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await expect(
      f.service.list(TOKEN, {
        projectId: PROJECT,
        limit: 25,
        cursor: encode({ ...data, asOf: "2026-10-17T00:00:00Z" }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    await expect(
      f.service.list(TOKEN, {
        projectId: PROJECT,
        limit: 25,
        cursor: page.nextCursor! + "=",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
  });
  it.each([
    "duplicate",
    "unsorted",
    "oversized",
    "next",
    "foreign",
    "environment",
    "cutoff",
    "fraction",
  ])("rejects inconsistent list output: %s", async (mode) => {
    const f = fixture();
    populate(f, 30);
    f.state.pageTransform = (page) => {
      if (mode === "duplicate") page.items[1] = copy(page.items[0]!);
      if (mode === "unsorted") page.items.reverse();
      if (mode === "oversized") page.items.push(copy(page.items[0]!));
      if (mode === "next") page.nextAfterId = FOREIGN;
      if (mode === "foreign")
        page.items[0] = resign({ ...page.items[0]!, projectId: FOREIGN });
      if (mode === "environment")
        page.items[0] = resign({ ...page.items[0]!, environment: "test" });
      if (mode === "cutoff")
        page.items[0] = resign({
          ...page.items[0]!,
          recordedAt: "2026-10-17T00:00:00Z",
        });
      if (mode === "fraction")
        page.items[0] = resign({
          ...page.items[0]!,
          recordedAt: "2026-10-16T12:00:00.000000001Z",
        });
      return page;
    };
    await expect(
      f.service.list(TOKEN, { projectId: PROJECT, limit: 25 }),
    ).rejects.toThrow();
  });
  it("enforces the exact 30-day ceiling without rounding fractional excess", async () => {
    const f = fixture(),
      p = await f.propose(),
      raw = await f.reviewInput(p);
    await expect(
      f.service.review(OWNER, "fractional-expiry", {
        ...raw,
        expiresAt: "2026-11-15T12:00:00.000000001Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    const accepted = await f.service.review(OWNER, "max-expiry", {
      ...raw,
      expiresAt: "2026-11-15T12:00:00.000Z",
    });
    expect(accepted.record.expiresAt).toBe("2026-11-15T12:00:00.000Z");
  });
  it("preserves the real owner session and server-derived operation context", async () => {
    const f = fixture(),
      p = await f.propose();
    await f.service.preview(OWNER, { projectId: PROJECT, id: p.id });
    const request = f.state.requests.at(-1) as FoundationOwnerRequest;
    expect(request.sessionId).toBe(OWNER.sessionId);
    expect(request.principalId).toBe(OWNER.principalId);
    expect(request.operation).toBe("onboarding.read");
    expect(request.environment).toBe("local");
    expect(request.targetId).toBe(p.id);
  });
});
