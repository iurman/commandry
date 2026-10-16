import assert from "node:assert/strict";
import { test } from "vitest";
import {
  FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES,
  foundationFindingCitationSchema,
  foundationFindingKnowledgeSnapshotSchema,
  foundationFindingProposalBindingSchema,
  foundationFindingProposalCaptureSchema,
  foundationFindingProposalDecisionSchema,
  foundationFindingProposalDetailSchema,
  foundationFindingProposalInputSchema,
  foundationFindingProposalReviewInputSchema,
  foundationFindingProposalReviewReceiptSchema,
  foundationFindingProposalSubmissionSchema,
  foundationFindingProposalSuggestionSchema,
  foundationFindingProposalToolInputSchema,
  type FoundationFindingCitation,
  type FoundationFindingKnowledgeSnapshot,
  type FoundationFindingProposalBinding,
  type FoundationFindingProposalCapture,
  type FoundationFindingProposalDecision,
  type FoundationFindingProposalDetail,
  type FoundationFindingProposalReviewReceipt,
  type FoundationFindingProposalSubmission,
  type FoundationFindingProposalSuggestion,
  type FoundationFindingProposalToolInput,
} from "./foundation-finding-proposal";

const id = (value: number) =>
  `abcdefab-cdef-4abc-8def-${value.toString(16).padStart(12, "0")}`;
const projectId = id(1);
const proposalId = id(2);
const captureId = id(3);
const clientId = id(4);
const knowledgeId = id(5);
const evidenceId = id(6);
const submittedAt = "2026-10-16T12:00:00Z";
const reviewedAt = "2026-10-16T12:01:00Z";
const sourceDigest = "a".repeat(64);
const proposalDigest = "b".repeat(64);
const citationsDigest = "c".repeat(64);
const principalId = "foundation-client:" + clientId;
const reviewer = "user:owner";
const originalContent = "  Caf\u00e9 \u03bb \ud83d\udd0e\nsource bytes\r\n";

const citation = (): FoundationFindingCitation => ({
  evidenceId,
  sourceKind: "capture",
  sourceId: id(7),
  sourceVersion: null,
  contentDigest: "d".repeat(64),
  selection: "whole_source",
});
const input = (): FoundationFindingProposalToolInput => ({
  originalContent,
  proposedTitle: "Observed retry behavior",
  proposedBody: "Retries preserve the original request identifier.",
  rationale: "The source shows two requests with one identifier.",
  citations: [citation()],
});
const binding = (): FoundationFindingProposalBinding => ({
  schemaVersion: 1,
  proposalId,
  captureId,
  projectId,
  environment: "test",
  clientId,
  principalId,
  correlationId: id(8),
  submittedAt,
  sourceDigest,
  proposalVersion: 1,
  proposedTitle: input().proposedTitle,
  proposedBody: input().proposedBody,
  rationale: input().rationale,
  citations: [citation()],
  citationsDigest,
  runtime: null,
  model: null,
  runId: null,
});
const capture = (): FoundationFindingProposalCapture => ({
  id: captureId,
  inputType: "text",
  originalContent,
  file: null,
  source: "foundation-client",
  author: principalId,
  state: "unfiled",
  projectId,
  filedRecord: null,
  createdAt: submittedAt,
  filedAt: null,
});
const suggestion = (): FoundationFindingProposalSuggestion => ({
  id: proposalId,
  captureId,
  kind: "note",
  proposedProjectId: projectId,
  title: input().proposedTitle,
  body: input().proposedBody,
  confidence: null,
  rationale: input().rationale,
  ruleVersion: "agent-finding-proposal/v1",
  sourceLabel: "Agent finding proposal",
  createdAt: submittedAt,
  proposal: { binding: binding(), contentDigest: proposalDigest },
});
const decision = (approve = true): FoundationFindingProposalDecision => ({
  id: id(9),
  captureId,
  suggestionId: proposalId,
  decision: approve ? "approve" : "reject",
  selectedProjectId: approve ? projectId : null,
  selectedKind: approve ? "note" : null,
  selectedTitle: approve ? "Reviewed retry behavior" : null,
  selectedBody: approve ? "Reviewed finding, still unverified." : null,
  filedRecordId: approve ? knowledgeId : null,
  actor: reviewer,
  createdAt: reviewedAt,
  provenance: {
    schemaVersion: 1,
    projectId,
    environment: "test",
    proposalVersion: 1,
    proposalDigest,
    sourceDigest,
    citationsDigest,
    reviewedBy: reviewer,
    correlationId: id(10),
    reason: "File the finding for separate assertion review.",
  },
});
const submission = (): FoundationFindingProposalSubmission => ({
  schemaVersion: 1,
  proposalId,
  captureId,
  projectId,
  environment: "test",
  clientId,
  principalId,
  correlationId: id(8),
  submittedAt,
  sourceDigest,
  proposalVersion: 1,
  proposalDigest,
  citationsDigest,
  status: "pending",
  verification: "unverified",
});
const knowledge = (): FoundationFindingKnowledgeSnapshot => ({
  id: knowledgeId,
  projectId,
  sourceCaptureId: captureId,
  kind: "note",
  title: decision().selectedTitle!,
  content: decision().selectedBody!,
  version: 1,
  createdAt: reviewedAt,
  updatedAt: reviewedAt,
});
const receipt = (approve = true): FoundationFindingProposalReviewReceipt => ({
  schemaVersion: 1,
  proposalId,
  captureId,
  projectId,
  environment: "test",
  decision: decision(approve),
  knowledge: approve ? knowledge() : null,
  memory: approve
    ? {
        schemaVersion: 1,
        id: id(11),
        projectId,
        knowledgeItemId: knowledgeId,
        version: 1,
        contentDigest: "e".repeat(64),
        content: {
          statement: knowledge().content,
          category: "finding",
          evidenceIds: [id(12), evidenceId],
          relatedMemoryIds: [],
          relationType: null,
        },
        lifecycle: "proposed",
        verification: "unverified",
        recordedBy: reviewer,
        recordedAt: reviewedAt,
      }
    : null,
});
const detail = (review: "pending" | "approve" | "reject") => {
  const value: FoundationFindingProposalDetail = {
    capture: capture(),
    suggestion: suggestion(),
    decision: review === "pending" ? null : decision(review === "approve"),
  };
  if (review === "approve") {
    value.capture.state = "filed";
    value.capture.filedRecord = { kind: "note", id: knowledgeId };
    value.capture.filedAt = reviewedAt;
  }
  return value;
};
type Schema = { safeParse(value: unknown): { success: boolean } };
const reject = (schema: Schema, value: unknown, label?: string) =>
  assert.equal(schema.safeParse(value).success, false, label);

test("valid finding flow preserves source text and separates filing from truth", () => {
  assert.equal(FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES, 524288);
  assert.equal(
    foundationFindingProposalToolInputSchema.parse(input()).originalContent,
    originalContent,
  );
  foundationFindingProposalInputSchema.parse({ ...input(), projectId });
  for (const review of ["pending", "approve", "reject"] as const)
    foundationFindingProposalDetailSchema.parse(detail(review));
  const accepted =
    foundationFindingProposalReviewReceiptSchema.parse(receipt());
  assert.equal(accepted.memory?.lifecycle, "proposed");
  assert.equal(accepted.memory?.verification, "unverified");
  assert.equal(accepted.knowledge?.content, decision().selectedBody);
  foundationFindingProposalReviewReceiptSchema.parse(receipt(false));
  foundationFindingProposalSubmissionSchema.parse(submission());
});

test("all UUID identities normalize and citation duplicates reject after normalization", () => {
  const value = binding();
  value.projectId = value.projectId.toUpperCase();
  value.proposalId = value.proposalId.toUpperCase();
  value.clientId = value.clientId.toUpperCase();
  value.citations[0]!.evidenceId = evidenceId.toUpperCase();
  value.citations[0]!.sourceId = citation().sourceId.toUpperCase();
  const parsed = foundationFindingProposalBindingSchema.parse(value);
  assert.equal(parsed.projectId, projectId);
  assert.equal(parsed.proposalId, proposalId);
  assert.equal(parsed.clientId, clientId);
  assert.equal(parsed.citations[0]?.evidenceId, evidenceId);
  const upper = detail("approve");
  upper.capture.id = captureId.toUpperCase();
  upper.capture.filedRecord!.id = knowledgeId.toUpperCase();
  upper.suggestion.id = proposalId.toUpperCase();
  upper.decision!.suggestionId = proposalId.toUpperCase();
  foundationFindingProposalDetailSchema.parse(upper);
  const duplicate = {
    ...input(),
    citations: [
      citation(),
      { ...citation(), evidenceId: evidenceId.toUpperCase() },
    ],
  };
  reject(foundationFindingProposalToolInputSchema, duplicate);
  reject(foundationFindingProposalInputSchema, { ...duplicate, projectId });
  reject(foundationFindingProposalBindingSchema, {
    ...binding(),
    citations: duplicate.citations,
  });
});

test("all public objects reject unknown authority and provenance fields", () => {
  const cases: [Schema, object][] = [
    [foundationFindingCitationSchema, citation()],
    [foundationFindingProposalToolInputSchema, input()],
    [foundationFindingProposalInputSchema, { ...input(), projectId }],
    [foundationFindingProposalBindingSchema, binding()],
    [foundationFindingProposalCaptureSchema, capture()],
    [foundationFindingProposalSuggestionSchema, suggestion()],
    [foundationFindingProposalSubmissionSchema, submission()],
    [foundationFindingProposalDecisionSchema, decision()],
    [foundationFindingProposalDetailSchema, detail("pending")],
    [foundationFindingKnowledgeSnapshotSchema, knowledge()],
    [foundationFindingProposalReviewReceiptSchema, receipt()],
  ];
  for (const [schema, value] of cases)
    reject(schema, { ...value, authority: "owner" });
  for (const field of ["actor", "verification", "status", "model", "runtime"])
    reject(foundationFindingProposalToolInputSchema, {
      ...input(),
      [field]: "trusted",
    });
  const nested = suggestion();
  reject(foundationFindingProposalSuggestionSchema, {
    ...nested,
    proposal: { ...nested.proposal, verified: true },
  });
  reject(foundationFindingProposalDecisionSchema, {
    ...decision(),
    provenance: { ...decision().provenance, approvedInstruction: true },
  });
  reject(foundationFindingProposalCaptureSchema, {
    ...detail("approve").capture,
    filedRecord: { kind: "note", id: knowledgeId, verified: true },
  });
  const withMemory = receipt();
  reject(foundationFindingProposalReviewReceiptSchema, {
    ...withMemory,
    memory: {
      ...withMemory.memory,
      content: { ...withMemory.memory!.content, approval: "owner" },
    },
  });
});

test("required text rejects blank, NUL, lone surrogates and excessive lengths", () => {
  const limits = {
    originalContent: 20000,
    proposedTitle: 200,
    proposedBody: 20000,
    rationale: 4000,
  };
  for (const [field, limit] of Object.entries(limits)) {
    for (const invalid of [
      "",
      " \n\t",
      "a\0b",
      "a\ud800",
      "\udc00b",
      "x".repeat(limit + 1),
    ])
      reject(
        foundationFindingProposalToolInputSchema,
        {
          ...input(),
          [field]: invalid,
        },
        field,
      );
    foundationFindingProposalToolInputSchema.parse({
      ...input(),
      [field]: "x".repeat(limit),
    });
  }
  reject(foundationFindingKnowledgeSnapshotSchema, {
    ...knowledge(),
    content: " ",
  });
  reject(foundationFindingProposalDecisionSchema, {
    ...decision(),
    provenance: { ...decision().provenance, reason: "\ud800" },
  });
});

test("citations require exact whole-source capture or positive bounded revision references", () => {
  for (const version of ["1", "2147483647"])
    foundationFindingCitationSchema.parse({
      ...citation(),
      sourceKind: "knowledge_revision",
      sourceVersion: version,
    });
  for (const version of [
    null,
    "",
    "0",
    "01",
    "+1",
    "-1",
    "1.0",
    "1e2",
    " 1",
    "2147483648",
    "9007199254740992",
    "9".repeat(400),
  ])
    reject(foundationFindingCitationSchema, {
      ...citation(),
      sourceKind: "knowledge_revision",
      sourceVersion: version,
    });
  reject(foundationFindingCitationSchema, {
    ...citation(),
    sourceVersion: "1",
  });
  reject(foundationFindingCitationSchema, { ...citation(), sourceVersion: 1 });
  for (const replacement of [
    { sourceKind: "external" },
    { sourceId: "https://example.test/source" },
    { selection: "quote" },
    { range: { start: 0, end: 5 } },
    { contentDigest: "D".repeat(64) },
    { contentDigest: "a".repeat(63) },
    { contentDigest: "g".repeat(64) },
  ])
    reject(foundationFindingCitationSchema, { ...citation(), ...replacement });
  reject(foundationFindingProposalToolInputSchema, {
    ...input(),
    citations: [],
  });
  const hundred = Array.from({ length: 100 }, (_, index) => ({
    ...citation(),
    evidenceId: id(100 + index),
  }));
  foundationFindingProposalToolInputSchema.parse({
    ...input(),
    citations: hundred,
  });
  reject(foundationFindingProposalToolInputSchema, {
    ...input(),
    citations: [...hundred, { ...citation(), evidenceId: id(200) }],
  });
});

test("client provenance must be canonical and match the bound client", () => {
  for (const principal of [
    "user:owner",
    "foundation-client:" + id(99),
    "foundation-client:" + clientId.toUpperCase(),
    "foundation-client: ",
    "foundation-client:" + clientId + "\0",
  ])
    for (const [schema, value] of [
      [foundationFindingProposalBindingSchema, binding()],
      [foundationFindingProposalSubmissionSchema, submission()],
    ] as const)
      reject(schema, { ...value, principalId: principal });
  for (const replacement of [
    { runtime: "agent" },
    { model: "model" },
    { runId: id(99) },
    { proposalVersion: 2 },
    { schemaVersion: 2 },
    { environment: "other" },
    { submittedAt: "yesterday" },
    { sourceDigest: "A".repeat(64) },
    { citationsDigest: "c".repeat(63) },
  ])
    reject(foundationFindingProposalBindingSchema, {
      ...binding(),
      ...replacement,
    });
});

test("suggestions bind note identity, content, time and project to the proposal", () => {
  for (const replacement of [
    { id: id(90) },
    { captureId: id(90) },
    { proposedProjectId: id(90) },
    { proposedProjectId: null },
    { kind: "task" },
    { confidence: 100 },
    { title: "Different" },
    { body: "Different" },
    { rationale: "Different" },
    { createdAt: reviewedAt },
    { ruleVersion: "capture-triage/v1" },
    { sourceLabel: "Local deterministic rule" },
  ])
    reject(foundationFindingProposalSuggestionSchema, {
      ...suggestion(),
      ...replacement,
    });
});

test("capture filing states require a note record and filing timestamp together", () => {
  for (const replacement of [
    { inputType: "file" },
    { file: {} },
    { projectId: null },
    { source: "manual-local" },
    { author: "user:owner" },
    { state: "filed" },
    { filedAt: reviewedAt },
    { filedRecord: { kind: "note", id: knowledgeId } },
  ])
    reject(foundationFindingProposalCaptureSchema, {
      ...capture(),
      ...replacement,
    });
  reject(foundationFindingProposalCaptureSchema, {
    ...detail("approve").capture,
    filedRecord: { kind: "task", id: knowledgeId },
  });
  reject(foundationFindingProposalCaptureSchema, {
    ...detail("approve").capture,
    filedAt: null,
  });
});

const reviewInput = () => ({
  projectId,
  proposalId,
  expectedVersion: 1,
  expectedProposalDigest: proposalDigest,
  expectedSourceDigest: sourceDigest,
  expectedCitationsDigest: citationsDigest,
  reason: "Human filing review",
});

test("review inputs require optimistic digests and a reason with immutable citations", () => {
  const approve = {
    ...reviewInput(),
    decision: "approve",
    selectedTitle: "Reviewed title",
    selectedBody: "Reviewed body",
  };
  const rejected = { ...reviewInput(), decision: "reject" };
  foundationFindingProposalReviewInputSchema.parse(approve);
  foundationFindingProposalReviewInputSchema.parse(rejected);
  for (const replacement of [
    { expectedVersion: 2 },
    { expectedCitationsDigest: undefined },
    { expectedProposalDigest: "B".repeat(64) },
    { expectedSourceDigest: "x" },
    { selectedTitle: " " },
    { selectedBody: "" },
    { reason: " " },
    { reason: "x".repeat(4001) },
    { citations: [citation()] },
    { actor: reviewer },
    { verified: true },
  ])
    reject(foundationFindingProposalReviewInputSchema, {
      ...approve,
      ...replacement,
    });
  reject(foundationFindingProposalReviewInputSchema, {
    ...rejected,
    selectedBody: "Body",
  });
  reject(foundationFindingProposalReviewInputSchema, {
    ...rejected,
    selectedTitle: "Title",
  });
  reject(foundationFindingProposalReviewInputSchema, {
    ...approve,
    selectedBody: undefined,
  });
});

test("decisions require a human actor and bound approval or rejection fields", () => {
  for (const actor of [
    principalId,
    "local-user:unattributed",
    "user:",
    "user: ",
    "user:" + "x".repeat(496),
  ])
    reject(foundationFindingProposalDecisionSchema, {
      ...decision(),
      actor,
      provenance: { ...decision().provenance, reviewedBy: actor },
    });
  reject(foundationFindingProposalDecisionSchema, {
    ...decision(),
    actor: "user:other",
  });
  reject(foundationFindingProposalDecisionSchema, {
    ...decision(),
    selectedProjectId: id(99),
  });
  reject(foundationFindingProposalDecisionSchema, {
    ...decision(),
    selectedKind: "task",
  });
  for (const field of [
    "selectedProjectId",
    "selectedKind",
    "selectedTitle",
    "selectedBody",
    "filedRecordId",
  ])
    reject(foundationFindingProposalDecisionSchema, {
      ...decision(),
      [field]: null,
    });
  const approved = decision();
  for (const field of [
    "selectedProjectId",
    "selectedKind",
    "selectedTitle",
    "selectedBody",
    "filedRecordId",
  ] as const)
    reject(foundationFindingProposalDecisionSchema, {
      ...decision(false),
      [field]: approved[field],
    });
});

test("detail rejects source, actor, project, digest and filing mismatches", () => {
  const pending = detail("pending");
  for (const replacement of [
    { id: id(99) },
    { projectId: id(99) },
    { author: "foundation-client:" + id(99) },
    { createdAt: reviewedAt },
  ])
    reject(foundationFindingProposalDetailSchema, {
      ...pending,
      capture: { ...pending.capture, ...replacement },
    });
  for (const replacement of [
    { projectId: id(99) },
    { environment: "preview" },
    { proposalVersion: 2 },
    { proposalDigest: "f".repeat(64) },
    { sourceDigest: "f".repeat(64) },
    { citationsDigest: "f".repeat(64) },
  ]) {
    const rejected = detail("reject");
    reject(foundationFindingProposalDetailSchema, {
      ...rejected,
      decision: {
        ...rejected.decision,
        provenance: { ...rejected.decision!.provenance, ...replacement },
      },
    });
  }
  for (const replacement of [{ captureId: id(99) }, { suggestionId: id(99) }]) {
    const rejected = detail("reject");
    reject(foundationFindingProposalDetailSchema, {
      ...rejected,
      decision: { ...rejected.decision, ...replacement },
    });
  }
  const approved = detail("approve");
  reject(foundationFindingProposalDetailSchema, {
    ...approved,
    capture: capture(),
  });
  reject(foundationFindingProposalDetailSchema, {
    ...approved,
    capture: { ...approved.capture, filedAt: submittedAt },
  });
  reject(foundationFindingProposalDetailSchema, {
    ...approved,
    capture: { ...approved.capture, filedRecord: { kind: "note", id: id(99) } },
  });
  reject(foundationFindingProposalDetailSchema, {
    ...approved,
    decision: null,
  });
  reject(foundationFindingProposalDetailSchema, {
    ...approved,
    decision: decision(false),
  });
});

test("historical submission never gains a review status or verification claim", () => {
  foundationFindingProposalReviewReceiptSchema.parse(receipt());
  assert.equal(
    foundationFindingProposalSubmissionSchema.parse(submission()).status,
    "pending",
  );
  for (const replacement of [
    { status: "approved" },
    { verification: "source_matched" },
    { decision: decision() },
    { citationsDigest: undefined },
    { proposalDigest: "B".repeat(64) },
  ])
    reject(foundationFindingProposalSubmissionSchema, {
      ...submission(),
      ...replacement,
    });
});

test("review receipts bind Knowledge identity, content, initial version and timestamps", () => {
  const approved = receipt();
  for (const replacement of [
    { proposalId: id(99) },
    { captureId: id(99) },
    { projectId: id(99) },
    { environment: "production" },
    { knowledge: null },
    { memory: null },
  ])
    reject(foundationFindingProposalReviewReceiptSchema, {
      ...approved,
      ...replacement,
    });
  for (const replacement of [
    { id: id(99) },
    { projectId: id(99) },
    { sourceCaptureId: id(99) },
    { kind: "task" },
    { title: "Different" },
    { content: "Different" },
    { version: 2 },
    { createdAt: submittedAt },
    { updatedAt: submittedAt },
  ])
    reject(foundationFindingProposalReviewReceiptSchema, {
      ...approved,
      knowledge: { ...knowledge(), ...replacement },
    });
});

test("filing receipts forbid assertion approval, instruction installation and verification", () => {
  const approved = receipt();
  for (const replacement of [
    { projectId: id(99) },
    { knowledgeItemId: id(99) },
    { version: 2 },
    { lifecycle: "accepted" },
    { lifecycle: "rejected" },
    { lifecycle: "superseded" },
    { verification: "source_matched" },
    { verification: "independently_verified" },
    { instructionApproval: id(99) },
  ])
    reject(foundationFindingProposalReviewReceiptSchema, {
      ...approved,
      memory: { ...approved.memory, ...replacement },
    });
  for (const replacement of [
    { statement: "Different assertion" },
    { category: "instruction" },
    { category: "decision" },
    { evidenceIds: [] },
    { evidenceIds: [evidenceId, evidenceId.toUpperCase()] },
    { relatedMemoryIds: [id(99)], relationType: "supersedes" },
  ])
    reject(foundationFindingProposalReviewReceiptSchema, {
      ...approved,
      memory: {
        ...approved.memory,
        content: { ...approved.memory!.content, ...replacement },
      },
    });
});

test("rejection receipts contain neither Knowledge nor memory", () => {
  const rejected = receipt(false);
  reject(foundationFindingProposalReviewReceiptSchema, {
    ...rejected,
    knowledge: knowledge(),
  });
  reject(foundationFindingProposalReviewReceiptSchema, {
    ...rejected,
    memory: receipt().memory,
  });
});
