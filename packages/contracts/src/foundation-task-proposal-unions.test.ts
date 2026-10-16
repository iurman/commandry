import { expect, test } from "vitest";
import {
  captureSchema,
  captureTriageDecisionSchema,
  captureTriageSuggestionSchema,
  foundationTaskProposalDecisionSchema,
  foundationTaskProposalSuggestionSchema,
} from "./index";

const id = (n: number) =>
  "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
const at = "2026-10-16T10:00:00.000Z";
const digest = "a".repeat(64);
const binding = {
  schemaVersion: 1,
  proposalId: id(1),
  captureId: id(2),
  projectId: id(3),
  environment: "test",
  clientId: id(4),
  principalId: "foundation-client:" + id(4),
  correlationId: id(5),
  submittedAt: at,
  sourceDigest: digest,
  proposalVersion: 1,
  proposedTitle: "Exact task",
  proposedBody: "Exact body",
  rationale: "Exact rationale",
  runtime: null,
  model: null,
  runId: null,
};
const suggestion = {
  id: id(1),
  captureId: id(2),
  kind: "task",
  proposedProjectId: id(3),
  title: "Exact task",
  body: "Exact body",
  confidence: null,
  rationale: "Exact rationale",
  ruleVersion: "agent-task-proposal/v1",
  sourceLabel: "Agent task proposal",
  createdAt: at,
  proposal: { binding, contentDigest: digest },
};
const decision = {
  id: id(6),
  captureId: id(2),
  suggestionId: id(1),
  decision: "reject",
  selectedProjectId: null,
  selectedKind: null,
  selectedTitle: null,
  selectedBody: null,
  filedRecordId: null,
  actor: "user:owner",
  createdAt: at,
  provenance: {
    schemaVersion: 1,
    projectId: id(3),
    environment: "test",
    proposalVersion: 1,
    proposalDigest: digest,
    sourceDigest: digest,
    reviewedBy: "user:owner",
    correlationId: id(5),
  },
};

test("valid actual variants retain all proposal fields through the barrel", () => {
  expect(foundationTaskProposalSuggestionSchema.parse(suggestion)).toEqual(
    suggestion,
  );
  expect(captureTriageSuggestionSchema.parse(suggestion)).toEqual(suggestion);
  expect(foundationTaskProposalDecisionSchema.parse(decision)).toEqual(
    decision,
  );
  expect(captureTriageDecisionSchema.parse(decision)).toEqual(decision);
});

test("global decision rejects a proposal receipt relabeled as a local actor", () => {
  const hybrid = { ...decision, actor: "local-user:unattributed" };
  expect(foundationTaskProposalDecisionSchema.safeParse(hybrid).success).toBe(
    false,
  );
  const parsed = captureTriageDecisionSchema.safeParse(hybrid);
  if (parsed.success) {
    expect(parsed.data).not.toHaveProperty("provenance");
  }
  expect(parsed.success).toBe(false);
});

test("global suggestion rejects a proposal relabeled as a deterministic local rule", () => {
  const hybrid = {
    ...suggestion,
    confidence: 80,
    ruleVersion: "capture-triage/v1",
    sourceLabel: "Local deterministic rule",
  };
  expect(foundationTaskProposalSuggestionSchema.safeParse(hybrid).success).toBe(
    false,
  );
  const parsed = captureTriageSuggestionSchema.safeParse(hybrid);
  if (parsed.success) {
    expect(parsed.data).not.toHaveProperty("proposal");
    expect(parsed.data).not.toHaveProperty("body");
  }
  expect(parsed.success).toBe(false);
});

test("own undefined proposal markers cannot be stripped into local variants", () => {
  const { proposal: _proposal, body: _body, ...suggestionFields } = suggestion;
  const localSuggestion = {
    ...suggestionFields,
    confidence: 80,
    ruleVersion: "capture-triage/v1",
    sourceLabel: "Local deterministic rule",
  };
  for (const marker of ["proposal", "body"]) {
    expect(
      captureTriageSuggestionSchema.safeParse({
        ...localSuggestion,
        [marker]: undefined,
      }).success,
    ).toBe(false);
  }
  const { provenance: _provenance, ...decisionFields } = decision;
  expect(
    captureTriageDecisionSchema.safeParse({
      ...decisionFields,
      actor: "local-user:unattributed",
      provenance: undefined,
    }).success,
  ).toBe(false);
});

test("unmarked local variants preserve old additive-field stripping behavior", () => {
  const { proposal: _proposal, body: _body, ...suggestionFields } = suggestion;
  const localSuggestion = {
    ...suggestionFields,
    confidence: 80,
    ruleVersion: "capture-triage/v1",
    sourceLabel: "Local deterministic rule",
  };
  expect(
    captureTriageSuggestionSchema.parse({
      ...localSuggestion,
      legacyAdditionalField: "ignored",
    }),
  ).toEqual(localSuggestion);
  const { provenance: _provenance, ...decisionFields } = decision;
  const localDecision = { ...decisionFields, actor: "local-user:unattributed" };
  expect(
    captureTriageDecisionSchema.parse({
      ...localDecision,
      legacyAdditionalField: "ignored",
    }),
  ).toEqual(localDecision);
});

test("Capture actual source and author discriminators cannot fall through to local", () => {
  const capture = {
    id: id(2),
    inputType: "text",
    originalContent: "Exact original",
    file: null,
    source: "foundation-client",
    author: "foundation-client:" + id(4),
    state: "unfiled",
    projectId: id(3),
    filedRecord: null,
    createdAt: at,
    filedAt: null,
  };
  expect(captureSchema.parse(capture)).toEqual(capture);
  for (const change of [
    { author: "local-user" },
    { author: "system:local-automation-worker" },
    { source: "manual-local" },
    { source: "automation-local-synthetic" },
    { source: "foundation-client", additionalAuthority: true },
  ]) {
    expect(captureSchema.safeParse({ ...capture, ...change }).success).toBe(
      false,
    );
  }
});
