import assert from "node:assert/strict";
import { test } from "vitest";
import { captureSchema } from "./capture.js";
import {
  captureTriageDecisionSchema,
  captureTriageSuggestionSchema,
} from "./capture-triage.js";
import { foundationProjectWorkRecordSchema } from "./foundation-work.js";
import * as proposal from "./foundation-task-proposal.js";

const id = (number: number) =>
  "00000000-0000-4000-8000-" + number.toString(16).padStart(12, "0");
const projectId = id(10);
const proposalId = id(11);
const captureId = id(12);
const clientId = id(13);
const workId = id(14);
const correlationId = id(15);
const otherId = id(99);
const submittedAt = "2026-10-16T10:00:00.123456+02:00";
const reviewedAt = "2026-10-16T09:00:00.000001Z";
const sourceDigest = "a".repeat(64);
const proposalDigest = "b".repeat(64);
const principalId = "foundation-client:" + clientId;
const owner = "user:owner-1";
const exact = "\ufeff  exact \u00e9\u0301 \u2603 \ud83c\udf0c\r\n\t";
const input = () => ({
  projectId,
  originalContent: exact,
  proposedTitle: exact,
  proposedBody: "",
  rationale: exact,
});
const toolInput = () => ({
  originalContent: exact,
  proposedTitle: exact,
  proposedBody: "",
  rationale: exact,
});
const binding = () => ({
  schemaVersion: 1,
  proposalId,
  captureId,
  projectId,
  environment: "test",
  clientId,
  principalId,
  correlationId,
  submittedAt,
  sourceDigest,
  proposalVersion: 1,
  proposedTitle: exact,
  proposedBody: "",
  rationale: exact,
  runtime: null,
  model: null,
  runId: null,
});
const capture = () => ({
  id: captureId,
  inputType: "text",
  originalContent: exact,
  file: null,
  source: "foundation-client",
  author: principalId,
  state: "unfiled",
  projectId,
  filedRecord: null,
  createdAt: submittedAt,
  filedAt: null,
});
const suggestion = () => ({
  id: proposalId,
  captureId,
  kind: "task",
  proposedProjectId: projectId,
  title: exact,
  body: "",
  confidence: null,
  rationale: exact,
  ruleVersion: "agent-task-proposal/v1",
  sourceLabel: "Agent task proposal",
  createdAt: submittedAt,
  proposal: { binding: binding(), contentDigest: proposalDigest },
});
const submission = () => ({
  schemaVersion: 1,
  proposalId,
  captureId,
  projectId,
  environment: "test",
  clientId,
  principalId,
  proposalVersion: 1,
  proposalDigest,
  sourceDigest,
  submittedAt,
  correlationId,
  status: "pending",
  verification: "unverified",
});
const review = (decision = "approve") => ({
  projectId,
  proposalId,
  expectedVersion: 1,
  expectedProposalDigest: proposalDigest,
  expectedSourceDigest: sourceDigest,
  decision,
  ...(decision === "approve" ? { selectedTitle: exact, selectedBody: "" } : {}),
});
const decision = (approve = true) => ({
  id: id(20),
  captureId,
  suggestionId: proposalId,
  decision: approve ? "approve" : "reject",
  selectedProjectId: approve ? projectId : null,
  selectedKind: approve ? "task" : null,
  selectedTitle: approve ? exact : null,
  selectedBody: approve ? "" : null,
  filedRecordId: approve ? workId : null,
  actor: owner,
  createdAt: reviewedAt,
  provenance: {
    schemaVersion: 1,
    projectId,
    environment: "test",
    proposalVersion: 1,
    proposalDigest,
    sourceDigest,
    reviewedBy: owner,
    correlationId,
  },
});
const work = () => ({
  id: workId,
  projectId,
  sourceCaptureId: captureId,
  generatedFromWorkItemId: null,
  title: exact,
  description: "",
  workType: "task",
  assigneeKind: "unassigned",
  assigneeAgentId: null,
  assigneeLabel: null,
  status: "open",
  priority: null,
  dueOn: null,
  contextLink: null,
  createdAt: reviewedAt,
  updatedAt: reviewedAt,
});
const detail = () => ({
  capture: capture(),
  suggestion: suggestion(),
  decision: null,
});
const approvedDetail = () => ({
  capture: {
    ...capture(),
    state: "filed",
    filedRecord: { kind: "task", id: workId },
    filedAt: reviewedAt,
  },
  suggestion: suggestion(),
  decision: decision(),
});
const receipt = (approve = true) => ({
  schemaVersion: 1,
  proposalId,
  captureId,
  projectId,
  environment: "test",
  decision: decision(approve),
  work: approve ? work() : null,
});
type Parser = {
  safeParse(value: unknown): { success: boolean };
  parse(value: unknown): unknown;
};
const reject = (schema: Parser, value: unknown) =>
  assert.equal(schema.safeParse(value).success, false);
const families: readonly [Parser, () => object][] = [
  [proposal.foundationTaskProposalInputSchema, input],
  [proposal.foundationTaskProposalToolInputSchema, toolInput],
  [proposal.foundationTaskProposalBindingSchema, binding],
  [proposal.foundationTaskProposalCaptureSchema, capture],
  [proposal.foundationTaskProposalSuggestionSchema, suggestion],
  [proposal.foundationTaskProposalSubmissionSchema, submission],
  [proposal.foundationTaskProposalReviewInputSchema, review],
  [proposal.foundationTaskProposalDecisionSchema, decision],
  [proposal.foundationTaskProposalDetailSchema, detail],
  [proposal.foundationTaskProposalReviewReceiptSchema, receipt],
];

test("all proposal families are complete strict contracts without implicit defaults", () => {
  assert.equal(proposal.FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES, 524288);
  for (const [schema, make] of families) {
    const value = make();
    assert.deepEqual(schema.parse(value), value);
    for (const field of Object.keys(value)) {
      const candidate: Record<string, unknown> = { ...value };
      delete candidate[field];
      reject(schema, candidate);
    }
    for (const field of [
      "ownerApproved",
      "citations",
      "capabilities",
      "rawSource",
      "verified",
    ]) {
      reject(schema, { ...value, [field]: true });
    }
  }
});

test("submission input rejects caller provenance, authority, selection and filing claims", () => {
  for (const field of [
    "actor",
    "clientId",
    "principalId",
    "source",
    "environment",
    "kind",
    "model",
    "runtime",
    "runId",
    "confidence",
    "verification",
    "approval",
    "selectedTitle",
    "selectedBody",
    "sourceId",
    "evidenceIds",
    "citations",
    "assigneeAgentId",
    "filedRecordId",
  ]) {
    reject(proposal.foundationTaskProposalInputSchema, {
      ...input(),
      [field]: "injected",
    });
    reject(proposal.foundationTaskProposalToolInputSchema, {
      ...toolInput(),
      [field]: "injected",
    });
  }
  reject(proposal.foundationTaskProposalToolInputSchema, input());
  const parsed = proposal.foundationTaskProposalInputSchema.parse({
    ...input(),
    projectId: projectId.toUpperCase(),
  });
  assert.equal(parsed.projectId, projectId);
  assert.equal(parsed.originalContent, exact);
});

test("source text remains exact, including BOM, CRLF, combining marks and surrogate pairs", () => {
  for (const value of [
    exact,
    "\ufffd",
    "a\r\nb",
    "\ud83c\udf0c",
    "  spaced\t ",
  ]) {
    const candidate = {
      ...input(),
      originalContent: value,
      proposedTitle: value,
      proposedBody: value,
      rationale: value,
    };
    assert.deepEqual(
      proposal.foundationTaskProposalInputSchema.parse(candidate),
      candidate,
    );
    const persisted = {
      ...binding(),
      proposedTitle: value,
      proposedBody: value,
      rationale: value,
    };
    assert.deepEqual(
      proposal.foundationTaskProposalBindingSchema.parse(persisted),
      persisted,
    );
    assert.equal(
      proposal.foundationTaskProposalCaptureSchema.parse({
        ...capture(),
        originalContent: value,
      }).originalContent,
      value,
    );
  }
  for (const value of ["", " \t\r\n", "\ufeff"]) {
    for (const field of ["originalContent", "proposedTitle", "rationale"])
      reject(proposal.foundationTaskProposalInputSchema, {
        ...input(),
        [field]: value,
      });
    assert.equal(
      proposal.foundationTaskProposalInputSchema.parse({
        ...input(),
        proposedBody: value,
      }).proposedBody,
      value,
    );
  }
});

test("all new persisted text rejects NUL and malformed UTF16 without normalizing", () => {
  for (const invalid of [
    "a\0b",
    "\ud800",
    "\udfff",
    "\ud800x",
    "x\udfff",
    "\ud800\ud800",
    "\udfff\ud800",
  ]) {
    for (const field of [
      "originalContent",
      "proposedTitle",
      "proposedBody",
      "rationale",
    ])
      reject(proposal.foundationTaskProposalInputSchema, {
        ...input(),
        [field]: invalid,
      });
    for (const field of ["proposedTitle", "proposedBody", "rationale"])
      reject(proposal.foundationTaskProposalBindingSchema, {
        ...binding(),
        [field]: invalid,
      });
    reject(proposal.foundationTaskProposalCaptureSchema, {
      ...capture(),
      originalContent: invalid,
    });
    for (const field of ["selectedTitle", "selectedBody"]) {
      reject(proposal.foundationTaskProposalReviewInputSchema, {
        ...review(),
        [field]: invalid,
      });
      reject(proposal.foundationTaskProposalDecisionSchema, {
        ...decision(),
        [field]: invalid,
      });
    }
    reject(proposal.foundationTaskProposalDecisionSchema, {
      ...decision(),
      actor: "user:" + invalid,
      provenance: { ...decision().provenance, reviewedBy: "user:" + invalid },
    });
  }
});

test("all text bounds reject overflow rather than truncating", () => {
  for (const [field, maximum] of [
    ["originalContent", 20000],
    ["proposedTitle", 200],
    ["proposedBody", 20000],
    ["rationale", 4000],
  ] as const) {
    const value = "x".repeat(maximum);
    assert.equal(
      proposal.foundationTaskProposalInputSchema.parse({
        ...input(),
        [field]: value,
      })[field],
      value,
    );
    reject(proposal.foundationTaskProposalInputSchema, {
      ...input(),
      [field]: value + "x",
    });
  }
  for (const [field, maximum] of [
    ["selectedTitle", 200],
    ["selectedBody", 20000],
  ] as const) {
    const value = "x".repeat(maximum);
    assert.equal(
      proposal.foundationTaskProposalReviewInputSchema.parse({
        ...review(),
        [field]: value,
      }).decision,
      "approve",
    );
    reject(proposal.foundationTaskProposalDecisionSchema, {
      ...decision(),
      [field]: value + "x",
    });
  }
});

test("client principal binding is exact and machine/model provenance is never invented", () => {
  for (const principal of [
    "local-user",
    owner,
    "foundation-client:" + otherId,
    "foundation-client:" + clientId.toUpperCase(),
    principalId + "\n",
  ]) {
    reject(proposal.foundationTaskProposalBindingSchema, {
      ...binding(),
      principalId: principal,
    });
    reject(proposal.foundationTaskProposalSubmissionSchema, {
      ...submission(),
      principalId: principal,
    });
  }
  for (const field of ["runtime", "model", "runId"])
    reject(proposal.foundationTaskProposalBindingSchema, {
      ...binding(),
      [field]: "claimed",
    });
  reject(proposal.foundationTaskProposalBindingSchema, {
    ...binding(),
    clientId: otherId,
  });
  for (const field of ["schemaVersion", "proposalVersion"])
    reject(proposal.foundationTaskProposalBindingSchema, {
      ...binding(),
      [field]: 2,
    });
  for (const field of [
    "proposalId",
    "captureId",
    "projectId",
    "clientId",
    "correlationId",
  ])
    reject(proposal.foundationTaskProposalBindingSchema, {
      ...binding(),
      [field]: "invalid",
    });
});

test("digests require exactly 64 lowercase hex characters and timestamps remain exact", () => {
  for (const invalid of [
    "a".repeat(63),
    "a".repeat(65),
    "A".repeat(64),
    "g".repeat(64),
    sourceDigest + "\n",
  ]) {
    reject(proposal.foundationTaskProposalBindingSchema, {
      ...binding(),
      sourceDigest: invalid,
    });
    reject(proposal.foundationTaskProposalSuggestionSchema, {
      ...suggestion(),
      proposal: { binding: binding(), contentDigest: invalid },
    });
    for (const field of ["proposalDigest", "sourceDigest"])
      reject(proposal.foundationTaskProposalSubmissionSchema, {
        ...submission(),
        [field]: invalid,
      });
    for (const field of ["expectedProposalDigest", "expectedSourceDigest"])
      reject(proposal.foundationTaskProposalReviewInputSchema, {
        ...review(),
        [field]: invalid,
      });
  }
  assert.equal(
    proposal.foundationTaskProposalBindingSchema.parse(binding()).submittedAt,
    submittedAt,
  );
  for (const submittedAt of [
    "2026-02-30T10:00:00Z",
    "2026-10-16T10:00:00",
    "2026-10-16",
    "2026-10-16T10:00:00Z\n",
  ])
    reject(proposal.foundationTaskProposalBindingSchema, {
      ...binding(),
      submittedAt,
    });
  reject(proposal.foundationTaskProposalSubmissionSchema, {
    ...submission(),
    status: "approved",
  });
  reject(proposal.foundationTaskProposalSubmissionSchema, {
    ...submission(),
    verification: "verified",
  });
  reject(proposal.foundationTaskProposalSubmissionSchema, {
    ...submission(),
    originalContent: exact,
  });
});

test("canonical capture variant has closed task filing and no synthetic source claim", () => {
  for (const extra of [
    { inputType: "email" },
    { source: "manual-local" },
    { source: "automation-local-synthetic" },
    { author: "local-user" },
    { projectId: null },
    { file: {} },
    { filedAt: reviewedAt },
    { filedRecord: { kind: "task", id: workId } },
  ])
    reject(proposal.foundationTaskProposalCaptureSchema, {
      ...capture(),
      ...extra,
    });
  assert.deepEqual(
    proposal.foundationTaskProposalCaptureSchema.parse(
      approvedDetail().capture,
    ),
    approvedDetail().capture,
  );
  for (const extra of [
    { filedAt: null },
    { filedRecord: null },
    { filedRecord: { kind: "note", id: workId } },
    { filedRecord: { kind: "task", id: workId, source: "claimed" } },
  ])
    reject(proposal.foundationTaskProposalCaptureSchema, {
      ...approvedDetail().capture,
      ...extra,
    });
});

test("suggestion must match its entire immutable projection", () => {
  for (const extra of [
    { id: otherId },
    { captureId: otherId },
    { proposedProjectId: otherId },
    { title: "changed" },
    { body: "changed" },
    { rationale: "changed" },
    { createdAt: reviewedAt },
    { kind: "note" },
    { confidence: 100 },
    { ruleVersion: "capture-triage/v1" },
    { sourceLabel: "Local deterministic rule" },
    { proposal: { ...suggestion().proposal, verified: true } },
  ])
    reject(proposal.foundationTaskProposalSuggestionSchema, {
      ...suggestion(),
      ...extra,
    });
  reject(proposal.foundationTaskProposalSuggestionSchema, {
    ...suggestion(),
    proposal: {
      binding: { ...binding(), claimedAuthority: true },
      contentDigest: proposalDigest,
    },
  });
  for (const field of ["binding", "contentDigest"]) {
    const nested: Record<string, unknown> = { ...suggestion().proposal };
    delete nested[field];
    reject(proposal.foundationTaskProposalSuggestionSchema, {
      ...suggestion(),
      proposal: nested,
    });
  }
});

test("review inputs require exact approval selection and reject cannot select or file", () => {
  assert.deepEqual(
    proposal.foundationTaskProposalReviewInputSchema.parse(review("reject")),
    review("reject"),
  );
  for (const field of [
    "selectedTitle",
    "selectedBody",
    "selectedProjectId",
    "selectedKind",
    "filedRecordId",
    "actor",
    "environment",
    "ownerApproved",
    "citations",
    "instructionApprovalId",
  ])
    reject(proposal.foundationTaskProposalReviewInputSchema, {
      ...review("reject"),
      [field]: null,
    });
  for (const field of [
    "actor",
    "environment",
    "selectedProjectId",
    "kind",
    "workId",
    "citations",
  ])
    reject(proposal.foundationTaskProposalReviewInputSchema, {
      ...review(),
      [field]: "injected",
    });
  reject(proposal.foundationTaskProposalReviewInputSchema, {
    ...review(),
    selectedBody: null,
  });
  reject(proposal.foundationTaskProposalReviewInputSchema, {
    ...review(),
    expectedVersion: 2,
  });
});

test("owner decision provenance is human, complete, bound and strict", () => {
  for (const actor of [
    "local-user:unattributed",
    principalId,
    "",
    "user:",
    "user: \t",
    " user:owner",
    "user:" + "x".repeat(496),
  ])
    reject(proposal.foundationTaskProposalDecisionSchema, {
      ...decision(),
      actor,
      provenance: { ...decision().provenance, reviewedBy: actor },
    });
  const maximum = "user:" + "x".repeat(495);
  assert.equal(
    proposal.foundationTaskProposalDecisionSchema.parse({
      ...decision(),
      actor: maximum,
      provenance: { ...decision().provenance, reviewedBy: maximum },
    }).actor,
    maximum,
  );
  reject(proposal.foundationTaskProposalDecisionSchema, {
    ...decision(),
    provenance: { ...decision().provenance, reviewedBy: "user:another" },
  });
  for (const extra of [
    { selectedProjectId: otherId },
    { selectedKind: "note" },
    { selectedTitle: null },
    { selectedBody: null },
    { filedRecordId: null },
  ])
    reject(proposal.foundationTaskProposalDecisionSchema, {
      ...decision(),
      ...extra,
    });
  for (const field of [
    "selectedProjectId",
    "selectedKind",
    "selectedTitle",
    "selectedBody",
    "filedRecordId",
  ])
    reject(proposal.foundationTaskProposalDecisionSchema, {
      ...decision(false),
      [field]: decision()[field as keyof ReturnType<typeof decision>],
    });
  for (const field of Object.keys(decision().provenance)) {
    const provenance: Record<string, unknown> = { ...decision().provenance };
    delete provenance[field];
    reject(proposal.foundationTaskProposalDecisionSchema, {
      ...decision(),
      provenance,
    });
  }
  reject(proposal.foundationTaskProposalDecisionSchema, {
    ...decision(),
    provenance: { ...decision().provenance, verified: true },
  });
});

test("pending and rejected details retain actual originals without filing", () => {
  assert.equal(
    proposal.foundationTaskProposalDetailSchema.parse(detail()).capture
      .originalContent,
    exact,
  );
  const rejected = { ...detail(), decision: decision(false) };
  assert.deepEqual(
    proposal.foundationTaskProposalDetailSchema.parse(rejected),
    rejected,
  );
  for (const decisionValue of [null, decision(false)])
    reject(proposal.foundationTaskProposalDetailSchema, {
      ...approvedDetail(),
      decision: decisionValue,
    });
  reject(proposal.foundationTaskProposalDetailSchema, {
    ...detail(),
    decision: decision(),
  });
  // Shape validation cannot establish the independently computed source digest.
  assert.equal(
    proposal.foundationTaskProposalDetailSchema.parse({
      ...detail(),
      capture: { ...capture(), originalContent: "other exact original" },
    }).capture.originalContent,
    "other exact original",
  );
});

test("details bind capture provenance, decision version, project, environment and digests", () => {
  assert.deepEqual(
    proposal.foundationTaskProposalDetailSchema.parse(approvedDetail()),
    approvedDetail(),
  );
  for (const extra of [
    { id: otherId },
    { projectId: otherId },
    { author: "foundation-client:" + otherId },
    { createdAt: reviewedAt },
  ])
    reject(proposal.foundationTaskProposalDetailSchema, {
      ...detail(),
      capture: { ...capture(), ...extra },
    });
  for (const extra of [{ captureId: otherId }, { suggestionId: otherId }])
    reject(proposal.foundationTaskProposalDetailSchema, {
      ...approvedDetail(),
      decision: { ...decision(), ...extra },
    });
  for (const extra of [
    { projectId: otherId },
    { environment: "production" },
    { proposalVersion: 2 },
    { proposalDigest: "c".repeat(64) },
    { sourceDigest: "c".repeat(64) },
  ])
    reject(proposal.foundationTaskProposalDetailSchema, {
      ...approvedDetail(),
      decision: {
        ...decision(),
        provenance: { ...decision().provenance, ...extra },
      },
    });
  reject(proposal.foundationTaskProposalDetailSchema, {
    ...approvedDetail(),
    capture: {
      ...approvedDetail().capture,
      filedRecord: { kind: "task", id: otherId },
    },
  });
});

test("review receipts bind the exact initial canonical task snapshot", () => {
  assert.deepEqual(
    proposal.foundationTaskProposalReviewReceiptSchema.parse(receipt()),
    receipt(),
  );
  assert.deepEqual(
    proposal.foundationTaskProposalReviewReceiptSchema.parse(receipt(false)),
    receipt(false),
  );
  reject(proposal.foundationTaskProposalReviewReceiptSchema, {
    ...receipt(),
    work: null,
  });
  reject(proposal.foundationTaskProposalReviewReceiptSchema, {
    ...receipt(false),
    work: work(),
  });
  for (const extra of [
    { proposalId: otherId },
    { captureId: otherId },
    { projectId: otherId },
    { environment: "production" },
  ])
    reject(proposal.foundationTaskProposalReviewReceiptSchema, {
      ...receipt(),
      ...extra,
    });
  for (const extra of [
    { id: otherId },
    { sourceCaptureId: otherId },
    { projectId: otherId },
    { title: "changed" },
    { description: "changed" },
    { workType: "initiative" },
    { status: "done" },
    { assigneeKind: "agent" },
    { assigneeAgentId: otherId },
    { assigneeLabel: "agent" },
    { generatedFromWorkItemId: otherId },
    { priority: "normal" },
    { dueOn: "2026-10-16" },
    { contextLink: { id: otherId, projectId, createdAt: reviewedAt } },
    { runId: otherId },
  ])
    reject(proposal.foundationTaskProposalReviewReceiptSchema, {
      ...receipt(),
      work: { ...work(), ...extra },
    });
  const laterWork = {
    ...work(),
    status: "done",
    priority: "high",
    title: "Later valid edit",
  };
  assert.deepEqual(
    foundationProjectWorkRecordSchema.parse(laterWork),
    laterWork,
  );
  assert.deepEqual(
    proposal.foundationTaskProposalReviewReceiptSchema.parse(receipt()),
    receipt(),
  );
});

test("canonical manual and synthetic Capture and triage fixtures remain unchanged", () => {
  for (const [source, author] of [
    ["manual-local", "local-user"],
    ["automation-local-synthetic", "system:local-automation-worker"],
  ]) {
    const oldCapture = { ...capture(), source, author };
    assert.deepEqual(captureSchema.parse(oldCapture), oldCapture);
  }
  const oldSuggestion = {
    id: proposalId,
    captureId,
    kind: "note",
    proposedProjectId: null,
    title: "old",
    confidence: 80,
    rationale: "rule",
    ruleVersion: "capture-triage/v1",
    sourceLabel: "Local deterministic rule",
    createdAt: submittedAt,
  };
  assert.deepEqual(
    captureTriageSuggestionSchema.parse(oldSuggestion),
    oldSuggestion,
  );
  const oldDecision = {
    id: id(20),
    captureId,
    suggestionId: proposalId,
    decision: "reject",
    selectedProjectId: null,
    selectedKind: null,
    selectedTitle: null,
    selectedBody: null,
    filedRecordId: null,
    actor: "local-user:unattributed",
    createdAt: reviewedAt,
  };
  assert.deepEqual(captureTriageDecisionSchema.parse(oldDecision), oldDecision);
});
