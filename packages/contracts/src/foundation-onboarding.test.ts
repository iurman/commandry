import assert from "node:assert/strict";
import { test } from "vitest";
import {
  FOUNDATION_ONBOARDING_MAX_INPUT_BYTES,
  foundationHostIdentitySchema,
  foundationOnboardingApplyInputSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingDetailSchema,
  foundationOnboardingInputSchema,
  foundationOnboardingLinkSnapshotSchema,
  foundationOnboardingMachineDetailSchema,
  foundationOnboardingOutcomeSchema,
  foundationOnboardingPageSchema,
  foundationOnboardingPreconditionsSchema,
  foundationOnboardingPreviewSchema,
  foundationOnboardingProposalSchema,
  foundationOnboardingReviewInputSchema,
  foundationOnboardingTargetSchema,
  foundationOnboardingToolInputSchema,
} from "./foundation-onboarding.js";

const projectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const resourceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const proposalId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const decisionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const linkId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const otherId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const recordedAt = "2026-10-16T10:00:00Z";
const expiresAt = "2026-10-17T10:00:00Z";
const digest = "a".repeat(64);
const otherDigest = "b".repeat(64);
const hostIdentity = () => ({
  namespace: "provider" as const,
  authority: "Acme:Account-A/Region-A",
  externalId: "Host-ABC",
  assurance: "owner_asserted" as const,
});
const createTarget = () => ({
  mode: "create" as const,
  name: "  Compute Host 🚀  ",
  subtype: "virtual_machine",
  externalUrl: "https://example.test/host?id=Host-ABC",
  identity: hostIdentity(),
});
const input = () => ({
  projectId,
  target: { mode: "reuse" as const, resourceId },
  relationship: "supports" as const,
  rationale: "Owner proposed this host for the project.",
  evidenceIds: [otherId],
});
const proposal = () => ({
  ...input(),
  schemaVersion: 1 as const,
  id: proposalId,
  version: 1 as const,
  environment: "test" as const,
  recordedBy: "client:agent-one",
  recordedAt,
  contentDigest: digest,
});
const resource = () => ({
  id: resourceId,
  kind: "host",
  name: "Compute Host",
  subtype: "virtual_machine",
  parentResourceId: null,
  state: "online",
  externalUrl: "https://example.test/host",
  lastObservedAt: recordedAt,
});
const link = () => ({
  id: linkId,
  projectId,
  resourceId,
  type: "supports" as const,
  lifecycle: "active" as const,
});
const preconditions = () => ({
  resource: resource(),
  link: link(),
  identityResourceId: resourceId,
});
const preview = () => ({
  schemaVersion: 1,
  projectId,
  proposalId,
  proposalDigest: digest,
  evaluatedAt: recordedAt,
  preconditions: preconditions(),
  preconditionsDigest: digest,
  previewDigest: digest,
  blockers: [],
  canApply: true,
});
const review = () => ({
  projectId,
  proposalId,
  expectedProposalDigest: digest,
  expectedPreviewDigest: digest,
  expectedDecisionVersion: 0,
  decision: "approved" as const,
  reason: "Reviewed the selected authority and old unbound inventory.",
  expiresAt,
  inventoryReviewed: true,
});
const decision = () => ({
  ...review(),
  schemaVersion: 1,
  id: decisionId,
  version: 1,
  recordedBy: "user:owner-one",
  recordedAt,
  contentDigest: digest,
  preconditions: preconditions(),
});
const apply = () => ({
  projectId,
  proposalId,
  expectedProposalDigest: digest,
  decisionId,
  expectedDecisionVersion: 1,
  expectedDecisionDigest: digest,
});
const outcome = () => ({
  schemaVersion: 1,
  id: otherId,
  projectId,
  proposalId,
  proposalVersion: 1,
  proposalDigest: digest,
  decisionId,
  decisionVersion: 1,
  decisionDigest: digest,
  resource: resource(),
  link: link(),
  resourceCreated: false,
  linkCreated: false,
  identity: null,
  recordedBy: "user:owner-one",
  recordedAt,
  correlationId: otherId,
  contentDigest: digest,
});
const detail = () => ({
  schemaVersion: 1,
  proposal: proposal(),
  currentDecision: decision(),
  outcome: outcome(),
});
const machineDetail = () => ({
  schemaVersion: 1,
  proposal: proposal(),
  currentDecision: {
    id: decisionId,
    version: 1,
    decision: "approved",
    expiresAt,
  },
  outcome: { id: otherId, resourceId, linkId, recordedAt },
});

test("accepts reuse and create intents without claiming external verification", () => {
  assert.equal(FOUNDATION_ONBOARDING_MAX_INPUT_BYTES, 131072);
  assert.equal(
    foundationOnboardingInputSchema.parse(input()).target.mode,
    "reuse",
  );
  const parsed = foundationOnboardingInputSchema.parse({
    ...input(),
    target: createTarget(),
  });
  assert.deepEqual(parsed.target, createTarget());
  assert.deepEqual(
    foundationHostIdentitySchema.parse(hostIdentity()),
    hostIdentity(),
  );
  assert.equal(
    foundationOnboardingToolInputSchema.safeParse(input()).success,
    false,
  );
  const { projectId: _projectId, ...toolInput } = input();
  assert.equal(
    foundationOnboardingToolInputSchema.safeParse(toolInput).success,
    true,
  );
  assert.equal(
    foundationOnboardingProposalSchema.safeParse(proposal()).success,
    true,
  );
});

test("normalizes UUIDs and rejects duplicates after normalization", () => {
  const parsed = foundationOnboardingInputSchema.parse({
    ...input(),
    projectId: projectId.toUpperCase(),
    target: { mode: "reuse", resourceId: resourceId.toUpperCase() },
    evidenceIds: [otherId.toUpperCase()],
  });
  assert.equal(parsed.projectId, projectId);
  assert.deepEqual(parsed.target, input().target);
  assert.deepEqual(parsed.evidenceIds, [otherId]);
  assert.equal(
    foundationOnboardingInputSchema.safeParse({
      ...input(),
      evidenceIds: [otherId, otherId.toUpperCase()],
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingInputSchema.safeParse({
      ...input(),
      evidenceIds: Array.from({ length: 101 }, () => otherId),
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingInputSchema.safeParse({
      ...input(),
      evidenceIds: [],
    }).success,
    true,
  );
});

test("preserves case-sensitive owner claims and exact text", () => {
  const target = createTarget();
  assert.deepEqual(foundationOnboardingTargetSchema.parse(target), target);
  const lower = { ...hostIdentity(), externalId: "host-abc" };
  assert.notDeepEqual(
    foundationHostIdentitySchema.parse(lower),
    hostIdentity(),
  );
  for (const patch of [
    { namespace: "hostname" },
    { assurance: "independently_verified" },
    { authority: " " },
    { authority: "x".repeat(201) },
    { externalId: "x".repeat(501) },
  ]) {
    assert.equal(
      foundationHostIdentitySchema.safeParse({ ...hostIdentity(), ...patch })
        .success,
      false,
    );
  }
});

test("rejects NUL, malformed Unicode and blank required text", () => {
  for (const bad of ["", " \n\t", "a\0b", "bad\ud800", "bad\udfff"]) {
    assert.equal(
      foundationOnboardingInputSchema.safeParse({ ...input(), rationale: bad })
        .success,
      false,
    );
    assert.equal(
      foundationHostIdentitySchema.safeParse({
        ...hostIdentity(),
        authority: bad,
      }).success,
      false,
    );
    assert.equal(
      foundationOnboardingTargetSchema.safeParse({
        ...createTarget(),
        name: bad,
      }).success,
      false,
    );
    assert.equal(
      foundationOnboardingProposalSchema.safeParse({
        ...proposal(),
        recordedBy: bad,
      }).success,
      false,
    );
  }
  assert.equal(
    foundationOnboardingInputSchema.parse({ ...input(), rationale: "é 🚀" })
      .rationale,
    "é 🚀",
  );
  assert.equal(
    foundationOnboardingInputSchema.safeParse({
      ...input(),
      rationale: "x".repeat(4001),
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingTargetSchema.safeParse({
      ...createTarget(),
      name: "x".repeat(201),
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingTargetSchema.safeParse({
      ...createTarget(),
      subtype: "x".repeat(101),
    }).success,
    false,
  );
});

test("accepts only HTTP(S) external URLs without userinfo", () => {
  for (const externalUrl of [
    null,
    "http://example.test/host",
    "https://example.test/",
  ]) {
    assert.equal(
      foundationOnboardingTargetSchema.safeParse({
        ...createTarget(),
        externalUrl,
      }).success,
      true,
    );
  }
  for (const externalUrl of [
    "ssh://example.test",
    "file:///tmp/host",
    "javascript:alert(1)",
    "https://user:pass@example.test/",
    "https://user@example.test/",
    "not a URL",
  ]) {
    assert.equal(
      foundationOnboardingTargetSchema.safeParse({
        ...createTarget(),
        externalUrl,
      }).success,
      false,
    );
    assert.equal(
      foundationOnboardingPreconditionsSchema.safeParse({
        ...preconditions(),
        resource: { ...resource(), externalUrl },
      }).success,
      false,
    );
  }
});

test("rejects caller authority, secret and side-effect fields at every boundary", () => {
  const schemasAndValues = [
    [foundationHostIdentitySchema, hostIdentity()],
    [foundationOnboardingTargetSchema, createTarget()],
    [foundationOnboardingInputSchema, input()],
    [foundationOnboardingProposalSchema, proposal()],
    [foundationOnboardingLinkSnapshotSchema, link()],
    [foundationOnboardingPreconditionsSchema, preconditions()],
    [foundationOnboardingPreviewSchema, preview()],
    [foundationOnboardingReviewInputSchema, review()],
    [foundationOnboardingDecisionSchema, decision()],
    [foundationOnboardingApplyInputSchema, apply()],
    [foundationOnboardingOutcomeSchema, outcome()],
    [foundationOnboardingDetailSchema, detail()],
    [foundationOnboardingMachineDetailSchema, machineDetail()],
    [
      foundationOnboardingPageSchema,
      { schemaVersion: 1, projectId, items: [proposal()], nextCursor: null },
    ],
  ] as const;
  for (const [schema, value] of schemasAndValues) {
    for (const field of [
      "credentials",
      "metadata",
      "principalId",
      "verified",
      "ownerApproved",
      "shell",
      "sourceId",
      "dependencies",
      "parentResourceId",
    ]) {
      assert.equal(
        schema.safeParse({ ...value, [field]: "injected" }).success,
        false,
        field,
      );
    }
  }
  assert.equal(
    foundationOnboardingTargetSchema.safeParse({
      mode: "reuse",
      resourceId,
      name: "Rename",
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingPreconditionsSchema.safeParse({
      ...preconditions(),
      resource: { ...resource(), credentials: "secret" },
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingTargetSchema.safeParse({
      ...createTarget(),
      identity: { ...hostIdentity(), verified: true },
    }).success,
    false,
  );
});

test("validates digests and fixed proposal/schema versions", () => {
  for (const contentDigest of [
    "A".repeat(64),
    "a".repeat(63),
    "g".repeat(64),
  ]) {
    assert.equal(
      foundationOnboardingProposalSchema.safeParse({
        ...proposal(),
        contentDigest,
      }).success,
      false,
    );
  }
  for (const patch of [
    { version: 2 },
    { schemaVersion: 2 },
    { environment: "staging" },
    { recordedAt: "2026-02-30T10:00:00Z" },
  ]) {
    assert.equal(
      foundationOnboardingProposalSchema.safeParse({ ...proposal(), ...patch })
        .success,
      false,
    );
  }
});

test("binds owner snapshots to every available resource identity", () => {
  assert.equal(
    foundationOnboardingPreconditionsSchema.safeParse(preconditions()).success,
    true,
  );
  assert.equal(
    foundationOnboardingPreconditionsSchema.safeParse({
      resource: null,
      link: null,
      identityResourceId: null,
    }).success,
    true,
  );
  for (const patch of [
    { resource: { ...resource(), id: otherId } },
    { link: { ...link(), resourceId: otherId } },
    { identityResourceId: otherId },
    { resource: null, identityResourceId: otherId },
  ]) {
    assert.equal(
      foundationOnboardingPreconditionsSchema.safeParse({
        ...preconditions(),
        ...patch,
      }).success,
      false,
    );
  }
  assert.equal(
    foundationOnboardingPreviewSchema.safeParse({
      ...preview(),
      preconditions: {
        ...preconditions(),
        link: { ...link(), projectId: otherId },
      },
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingDecisionSchema.safeParse({
      ...decision(),
      preconditions: {
        ...preconditions(),
        link: { ...link(), projectId: otherId },
      },
    }).success,
    false,
  );
});

test("requires exact agreement between blockers and advisory eligibility", () => {
  assert.equal(
    foundationOnboardingPreviewSchema.safeParse(preview()).success,
    true,
  );
  assert.equal(
    foundationOnboardingPreviewSchema.safeParse({
      ...preview(),
      canApply: false,
    }).success,
    false,
  );
  for (const blocker of [
    "resource_unavailable",
    "resource_not_host",
    "archived_connection",
    "identity_conflict",
    "identity_unresolved",
    "source_unavailable",
  ]) {
    assert.equal(
      foundationOnboardingPreviewSchema.safeParse({
        ...preview(),
        blockers: [blocker],
        canApply: false,
      }).success,
      true,
    );
    assert.equal(
      foundationOnboardingPreviewSchema.safeParse({
        ...preview(),
        blockers: [blocker],
      }).success,
      false,
    );
    assert.equal(
      foundationOnboardingPreviewSchema.safeParse({
        ...preview(),
        blockers: [blocker, blocker],
        canApply: false,
      }).success,
      false,
    );
  }
  assert.equal(
    foundationOnboardingPreviewSchema.safeParse({
      ...preview(),
      blockers: ["unknown"],
      canApply: false,
    }).success,
    false,
  );
});

test("review acknowledgement does not supply authentication or apply authority", () => {
  assert.equal(
    foundationOnboardingReviewInputSchema.safeParse(review()).success,
    true,
  );
  assert.equal(
    foundationOnboardingReviewInputSchema.safeParse({
      ...review(),
      inventoryReviewed: false,
    }).success,
    false,
  );
  for (const value of ["rejected", "revoked"]) {
    assert.equal(
      foundationOnboardingReviewInputSchema.safeParse({
        ...review(),
        decision: value,
        inventoryReviewed: false,
      }).success,
      true,
    );
    assert.equal(
      foundationOnboardingDecisionSchema.safeParse({
        ...decision(),
        decision: value,
        inventoryReviewed: false,
      }).success,
      true,
    );
  }
  assert.equal(
    foundationOnboardingDecisionSchema.safeParse({
      ...decision(),
      inventoryReviewed: false,
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingReviewInputSchema.safeParse({
      ...review(),
      authenticated: true,
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingApplyInputSchema.safeParse(apply()).success,
    true,
  );
  assert.equal(
    foundationOnboardingApplyInputSchema.safeParse({
      ...apply(),
      inventoryReviewed: true,
    }).success,
    false,
  );
});

test("requires safe decision versions and exact version advancement", () => {
  for (const expectedDecisionVersion of [
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN,
  ]) {
    assert.equal(
      foundationOnboardingReviewInputSchema.safeParse({
        ...review(),
        expectedDecisionVersion,
      }).success,
      false,
    );
  }
  assert.equal(
    foundationOnboardingReviewInputSchema.safeParse({
      ...review(),
      expectedDecisionVersion: Number.MAX_SAFE_INTEGER,
    }).success,
    true,
  );
  assert.equal(
    foundationOnboardingDecisionSchema.safeParse({
      ...decision(),
      expectedDecisionVersion: Number.MAX_SAFE_INTEGER - 1,
      version: Number.MAX_SAFE_INTEGER,
    }).success,
    true,
  );
  for (const version of [0, 2, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      foundationOnboardingDecisionSchema.safeParse({ ...decision(), version })
        .success,
      false,
    );
  }
  for (const expectedDecisionVersion of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(
      foundationOnboardingApplyInputSchema.safeParse({
        ...apply(),
        expectedDecisionVersion,
      }).success,
      false,
    );
  }
});

test("compares expiry by valid UTC instants and requires user principals", () => {
  assert.equal(
    foundationOnboardingDecisionSchema.safeParse({
      ...decision(),
      recordedAt: "2026-10-16T10:00:00+02:00",
      expiresAt: "2026-10-16T08:00:01Z",
    }).success,
    true,
  );
  for (const expiresAt of [
    "2026-10-16T08:00:00Z",
    "2026-10-16T09:00:00+02:00",
    "2026-02-30T10:00:00Z",
    "2026-10-16",
  ]) {
    assert.equal(
      foundationOnboardingDecisionSchema.safeParse({
        ...decision(),
        recordedAt: "2026-10-16T10:00:00+02:00",
        expiresAt,
      }).success,
      false,
    );
  }
  for (const recordedBy of [
    "client:owner",
    "user:",
    "user:   ",
    " user:owner",
    "user:bad\0",
    "user:bad\ud800",
    "user:" + "x".repeat(496),
  ]) {
    assert.equal(
      foundationOnboardingDecisionSchema.safeParse({
        ...decision(),
        recordedBy,
      }).success,
      false,
    );
    assert.equal(
      foundationOnboardingOutcomeSchema.safeParse({ ...outcome(), recordedBy })
        .success,
      false,
    );
  }
});

test("outcomes bind host kind, active canonical link and create-only identity", () => {
  assert.equal(
    foundationOnboardingOutcomeSchema.safeParse(outcome()).success,
    true,
  );
  assert.equal(
    foundationOnboardingOutcomeSchema.safeParse({
      ...outcome(),
      resourceCreated: true,
      linkCreated: true,
      identity: hostIdentity(),
    }).success,
    true,
  );
  for (const patch of [
    { resource: { ...resource(), kind: "service" } },
    { link: { ...link(), lifecycle: "archived" } },
    { link: { ...link(), resourceId: otherId } },
    { link: { ...link(), projectId: otherId } },
    { identity: hostIdentity() },
    { resourceCreated: true },
    { proposalVersion: 2 },
    { decisionVersion: 0 },
    { decisionVersion: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.equal(
      foundationOnboardingOutcomeSchema.safeParse({ ...outcome(), ...patch })
        .success,
      false,
    );
  }
});

test("owner detail binds proposal references and preserves a historical outcome after revocation", () => {
  assert.equal(
    foundationOnboardingDetailSchema.safeParse(detail()).success,
    true,
  );
  const revoked = {
    ...decision(),
    id: otherId,
    expectedDecisionVersion: 1,
    version: 2,
    decision: "revoked",
    inventoryReviewed: false,
    contentDigest: otherDigest,
  };
  assert.equal(
    foundationOnboardingDetailSchema.safeParse({
      ...detail(),
      currentDecision: revoked,
    }).success,
    true,
  );
  for (const patch of [
    { projectId: otherId },
    { proposalId: otherId },
    { expectedProposalDigest: otherDigest },
  ]) {
    assert.equal(
      foundationOnboardingDetailSchema.safeParse({
        ...detail(),
        currentDecision: { ...decision(), ...patch },
      }).success,
      false,
    );
  }
  for (const patch of [
    { projectId: otherId, link: { ...link(), projectId: otherId } },
    { proposalId: otherId },
    { proposalDigest: otherDigest },
    { decisionDigest: otherDigest },
    { decisionVersion: 2 },
    { link: { ...link(), type: "relates_to" } },
  ]) {
    assert.equal(
      foundationOnboardingDetailSchema.safeParse({
        ...detail(),
        outcome: { ...outcome(), ...patch },
      }).success,
      false,
    );
  }
  assert.equal(
    foundationOnboardingDetailSchema.safeParse({
      ...detail(),
      proposal: { ...proposal(), target: createTarget() },
      outcome: {
        ...outcome(),
        resourceCreated: true,
        identity: hostIdentity(),
      },
    }).success,
    true,
  );
  assert.equal(
    foundationOnboardingDetailSchema.safeParse({
      ...detail(),
      proposal: { ...proposal(), target: createTarget() },
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingDetailSchema.safeParse({
      ...detail(),
      proposal: { ...proposal(), target: createTarget() },
      outcome: {
        ...outcome(),
        resourceCreated: true,
        identity: { ...hostIdentity(), externalId: "different" },
      },
    }).success,
    false,
  );
});

test("machine detail cannot disclose owner snapshots, reason, or caller proof", () => {
  assert.equal(
    foundationOnboardingMachineDetailSchema.safeParse(machineDetail()).success,
    true,
  );
  for (const patch of [
    { reason: "Owner-only rationale" },
    { preconditions: preconditions() },
    { inventoryReviewed: true },
    { principalId: "user:owner" },
  ]) {
    assert.equal(
      foundationOnboardingMachineDetailSchema.safeParse({
        ...machineDetail(),
        currentDecision: { ...machineDetail().currentDecision, ...patch },
      }).success,
      false,
    );
  }
  assert.equal(
    foundationOnboardingMachineDetailSchema.safeParse({
      ...machineDetail(),
      outcome: { ...machineDetail().outcome, resource: resource() },
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingMachineDetailSchema.safeParse({
      ...machineDetail(),
      currentDecision: null,
      outcome: null,
    }).success,
    true,
  );
});

test("pages preserve continuation and reject duplicate or cross-project proposals", () => {
  const page = {
    schemaVersion: 1,
    projectId,
    items: [proposal()],
    nextCursor: "opaque:Case-Sensitive+Cursor",
  };
  assert.equal(
    foundationOnboardingPageSchema.parse(page).nextCursor,
    page.nextCursor,
  );
  assert.equal(
    foundationOnboardingPageSchema.safeParse({
      ...page,
      items: [],
      nextCursor: null,
    }).success,
    true,
  );
  assert.equal(
    foundationOnboardingPageSchema.safeParse({
      ...page,
      items: [proposal(), { ...proposal(), id: proposalId.toUpperCase() }],
    }).success,
    false,
  );
  assert.equal(
    foundationOnboardingPageSchema.safeParse({
      ...page,
      items: [{ ...proposal(), projectId: otherId }],
    }).success,
    false,
  );
  for (const nextCursor of [" ", "bad\0", "x".repeat(8193)]) {
    assert.equal(
      foundationOnboardingPageSchema.safeParse({ ...page, nextCursor }).success,
      false,
    );
  }
});

test("compares sub-millisecond expiry fractions exactly across UTC offsets", () => {
  const cases = [
    ["2026-10-16T10:00:00.0001Z", "2026-10-16T10:00:00.0002Z", true],
    ["2026-10-16T10:00:00.0002Z", "2026-10-16T10:00:00.0001Z", false],
    ["2026-10-16T10:00:00.0001Z", "2026-10-16T10:00:00.0001000Z", false],
    ["2026-10-16T10:00:00.0001+02:00", "2026-10-16T08:00:00.0002Z", true],
    ["2026-10-16T10:00:00.0001+02:00", "2026-10-16T08:00:00.0001Z", false],
    ["2026-10-16T10:00:00.0001+02:00", "2026-10-16T08:00:00.00009Z", false],
    ["2026-10-16T00:30:00.0001+01:00", "2026-10-15T23:30:00.0002Z", true],
    ["2026-10-16T00:30:00.0001+01:00", "2026-10-15T23:30:00.000100Z", false],
    [
      "2026-10-16T10:00:00.123456789012345678901Z",
      "2026-10-16T10:00:00.123456789012345678902Z",
      true,
    ],
    [
      "2026-10-16T10:00:00.123456789012345678902Z",
      "2026-10-16T10:00:00.123456789012345678901Z",
      false,
    ],
    [
      "2026-10-16T10:00:00.123456789012345678901Z",
      "2026-10-16T10:00:00.1234567890123456789010Z",
      false,
    ],
    ["2026-10-16T10:00:00Z", "2026-10-16T10:00:00.0000Z", false],
    ["2026-10-16T10:00:00Z", "2026-10-16T10:00:00.0001Z", true],
    ["2026-10-16T10:00:00.9999Z", "2026-10-16T10:00:01Z", true],
    ["2026-10-16T10:00:01Z", "2026-10-16T10:00:00.9999Z", false],
    ["1969-12-31T23:59:59.0001Z", "1969-12-31T23:59:59.0002Z", true],
  ] as const;
  for (const [recordedAt, expiresAt, expected] of cases) {
    assert.equal(
      foundationOnboardingDecisionSchema.safeParse({
        ...decision(),
        recordedAt,
        expiresAt,
      }).success,
      expected,
      recordedAt + " -> " + expiresAt,
    );
  }
});

test("onboarding URL authority grammar matches durable SQL intake", () => {
  const valid = [
    "https://example.test",
    "https://example.test/a\u2028b\u2029c",
    "HTTP://LOCALHOST:0/a",
    "https://host.example:65535/路径?q=é#part",
    "http://192.168.0.1:8080/",
    "https://[::1]:443/",
    "http://[2001:db8:0:0:0:0:0:1]/",
    "http://[::ffff:192.168.0.1]/",
    "https://host.example./",
  ];
  const invalid = [
    "https://example.test:99999",
    "https://[bad",
    "http://[::ffff:192.168.01.1]/",
    "https://example.test:",
    "https://@example.test",
    "https://user:secret@example.test",
    "https://127.1",
    "http://0x7f000001",
    "http://a.123",
    "https://xn--broken-",
    "https://例子.test/",
    "https://host..test",
    "https://host.test/a\nb",
    "https://host.test/a b",
    "https://host.test/a\\b",
  ];
  for (const externalUrl of valid)
    assert.equal(
      foundationOnboardingTargetSchema.safeParse({
        ...createTarget(),
        externalUrl,
      }).success,
      true,
      externalUrl,
    );
  for (const externalUrl of invalid)
    assert.equal(
      foundationOnboardingTargetSchema.safeParse({
        ...createTarget(),
        externalUrl,
      }).success,
      false,
      externalUrl,
    );
});
