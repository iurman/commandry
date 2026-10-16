import { z } from "zod";
import {
  foundationActorSchema,
  foundationMemorySchema,
} from "./agent-foundation";
import { captureSchema } from "./capture";
import {
  captureTriageDecisionSchema,
  captureTriageSuggestionSchema,
} from "./capture-triage";

// Services and transports enforce this limit against encoded input bytes.
export const FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES = 524288;
const identity = foundationActorSchema.shape.projectId;
const environment = foundationActorSchema.shape.environment;
const datetime = foundationActorSchema.shape.expiresAt;
const digest = z.string().regex(/^[a-f0-9]{64}$/);

function validText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const text = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine(validText, "Invalid source text")
    .refine((value) => value.trim().length > 0, "Must not be blank");
const original = text(20000);
const title = text(200);
const body = text(20000);
const rationale = text(4000);
const reason = text(4000);
const clientPrincipal = text(500).refine((value) => {
  const prefix = "foundation-client:";
  if (!value.startsWith(prefix)) return false;
  const id = identity.safeParse(value.slice(prefix.length));
  return id.success && value === prefix + id.data;
}, "A canonical foundation client principal is required");
const humanPrincipal = text(500).refine(
  (value) => value.startsWith("user:") && value.slice(5).trim().length > 0,
  "A trusted human principal is required",
);
type CheckContext = {
  addIssue(issue: { code: "custom"; path: string[]; message: string }): void;
};
const check = (context: CheckContext, condition: boolean, path: string[]) => {
  if (!condition)
    context.addIssue({
      code: "custom",
      path,
      message: "Proposal binding mismatch",
    });
};
const sourceVersion = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .refine((value) => {
    const version = Number(value);
    return Number.isSafeInteger(version) && version <= 2147483647;
  }, "A canonical positive revision version is required");

// Whole-source identity is a snapshot reference, not a verification claim.
export const foundationFindingCitationSchema = z
  .strictObject({
    evidenceId: identity,
    sourceKind: z.enum(["capture", "knowledge_revision"]),
    sourceId: identity,
    sourceVersion: sourceVersion.nullable(),
    contentDigest: digest,
    selection: z.literal("whole_source"),
  })
  .superRefine((value, context) => {
    check(
      context,
      value.sourceKind === "capture"
        ? value.sourceVersion === null
        : value.sourceVersion !== null,
      ["sourceVersion"],
    );
  });
export type FoundationFindingCitation = z.infer<
  typeof foundationFindingCitationSchema
>;
const citations = z
  .array(foundationFindingCitationSchema)
  .min(1)
  .max(100)
  .refine(
    (values) =>
      new Set(values.map((value) => value.evidenceId)).size === values.length,
    "Duplicate evidence identity",
  );

export const foundationFindingProposalToolInputSchema = z.strictObject({
  originalContent: original,
  proposedTitle: title,
  proposedBody: body,
  rationale,
  citations,
});
export type FoundationFindingProposalToolInput = z.infer<
  typeof foundationFindingProposalToolInputSchema
>;
export const foundationFindingProposalInputSchema =
  foundationFindingProposalToolInputSchema.extend({ projectId: identity });
export type FoundationFindingProposalInput = z.infer<
  typeof foundationFindingProposalInputSchema
>;

const submissionIdentity = {
  schemaVersion: z.literal(1),
  proposalId: identity,
  captureId: identity,
  projectId: identity,
  environment,
  clientId: identity,
  principalId: clientPrincipal,
  correlationId: identity,
  submittedAt: datetime,
  sourceDigest: digest,
  proposalVersion: z.literal(1),
};

// Services bind the digests to actual bytes and immutable source snapshots.
export const foundationFindingProposalBindingSchema = z
  .strictObject({
    ...submissionIdentity,
    proposedTitle: title,
    proposedBody: body,
    rationale,
    citations,
    citationsDigest: digest,
    runtime: z.null(),
    model: z.null(),
    runId: z.null(),
  })
  .superRefine((value, context) => {
    check(
      context,
      value.principalId === "foundation-client:" + value.clientId,
      ["principalId"],
    );
  });
export type FoundationFindingProposalBinding = z.infer<
  typeof foundationFindingProposalBindingSchema
>;

export const foundationFindingProposalCaptureSchema = captureSchema
  .extend({
    id: identity,
    inputType: z.literal("text"),
    file: z.null(),
    source: z.literal("foundation-client"),
    author: clientPrincipal,
    projectId: identity,
    originalContent: original,
    filedRecord: z
      .strictObject({ kind: z.literal("note"), id: identity })
      .nullable(),
    createdAt: datetime,
    filedAt: datetime.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    check(
      context,
      value.state === "unfiled"
        ? value.filedRecord === null && value.filedAt === null
        : value.filedRecord !== null && value.filedAt !== null,
      ["state"],
    );
  });
export type FoundationFindingProposalCapture = z.infer<
  typeof foundationFindingProposalCaptureSchema
>;

export const foundationFindingProposalSuggestionSchema =
  captureTriageSuggestionSchema
    .extend({
      id: identity,
      captureId: identity,
      kind: z.literal("note"),
      proposedProjectId: identity,
      title,
      body,
      confidence: z.null(),
      rationale,
      ruleVersion: z.literal("agent-finding-proposal/v1"),
      sourceLabel: z.literal("Agent finding proposal"),
      createdAt: datetime,
      proposal: z.strictObject({
        binding: foundationFindingProposalBindingSchema,
        contentDigest: digest,
      }),
    })
    .strict()
    .superRefine((value, context) => {
      const binding = value.proposal.binding;
      check(context, value.id === binding.proposalId, ["id"]);
      check(context, value.captureId === binding.captureId, ["captureId"]);
      check(context, value.proposedProjectId === binding.projectId, [
        "proposedProjectId",
      ]);
      check(context, value.createdAt === binding.submittedAt, ["createdAt"]);
      check(context, value.title === binding.proposedTitle, ["title"]);
      check(context, value.body === binding.proposedBody, ["body"]);
      check(context, value.rationale === binding.rationale, ["rationale"]);
    });
export type FoundationFindingProposalSuggestion = z.infer<
  typeof foundationFindingProposalSuggestionSchema
>;

// Historical submission remains pending and unverified after a later review.
export const foundationFindingProposalSubmissionSchema = z
  .strictObject({
    ...submissionIdentity,
    proposalDigest: digest,
    citationsDigest: digest,
    status: z.literal("pending"),
    verification: z.literal("unverified"),
  })
  .superRefine((value, context) => {
    check(
      context,
      value.principalId === "foundation-client:" + value.clientId,
      ["principalId"],
    );
  });
export type FoundationFindingProposalSubmission = z.infer<
  typeof foundationFindingProposalSubmissionSchema
>;

const reviewBinding = {
  projectId: identity,
  proposalId: identity,
  expectedVersion: z.literal(1),
  expectedProposalDigest: digest,
  expectedSourceDigest: digest,
  expectedCitationsDigest: digest,
  reason,
};
export const foundationFindingProposalReviewInputSchema = z.discriminatedUnion(
  "decision",
  [
    z.strictObject({
      ...reviewBinding,
      decision: z.literal("approve"),
      selectedTitle: title,
      selectedBody: body,
    }),
    z.strictObject({ ...reviewBinding, decision: z.literal("reject") }),
  ],
);
export type FoundationFindingProposalReviewInput = z.infer<
  typeof foundationFindingProposalReviewInputSchema
>;

export const foundationFindingProposalDecisionSchema =
  captureTriageDecisionSchema
    .extend({
      id: identity,
      captureId: identity,
      suggestionId: identity,
      selectedProjectId: identity.nullable(),
      selectedKind: z.literal("note").nullable(),
      selectedTitle: title.nullable(),
      selectedBody: body.nullable(),
      filedRecordId: identity.nullable(),
      actor: humanPrincipal,
      createdAt: datetime,
      provenance: z.strictObject({
        schemaVersion: z.literal(1),
        projectId: identity,
        environment,
        proposalVersion: z.literal(1),
        proposalDigest: digest,
        sourceDigest: digest,
        citationsDigest: digest,
        reviewedBy: humanPrincipal,
        correlationId: identity,
        reason,
      }),
    })
    .strict()
    .superRefine((value, context) => {
      check(context, value.actor === value.provenance.reviewedBy, ["actor"]);
      if (value.decision === "approve") {
        check(context, value.selectedProjectId === value.provenance.projectId, [
          "selectedProjectId",
        ]);
        check(
          context,
          value.selectedKind === "note" &&
            value.selectedTitle !== null &&
            value.selectedBody !== null &&
            value.filedRecordId !== null,
          ["decision"],
        );
      } else {
        check(
          context,
          value.selectedProjectId === null &&
            value.selectedKind === null &&
            value.selectedTitle === null &&
            value.selectedBody === null &&
            value.filedRecordId === null,
          ["decision"],
        );
      }
    });
export type FoundationFindingProposalDecision = z.infer<
  typeof foundationFindingProposalDecisionSchema
>;

// Structural bindings do not authenticate actors or verify source bytes.
export const foundationFindingProposalDetailSchema = z
  .strictObject({
    capture: foundationFindingProposalCaptureSchema,
    suggestion: foundationFindingProposalSuggestionSchema,
    decision: foundationFindingProposalDecisionSchema.nullable(),
  })
  .superRefine((value, context) => {
    const { capture, suggestion, decision } = value;
    const binding = suggestion.proposal.binding;
    check(context, capture.id === binding.captureId, ["capture", "id"]);
    check(context, capture.projectId === binding.projectId, [
      "capture",
      "projectId",
    ]);
    check(context, capture.author === binding.principalId, [
      "capture",
      "author",
    ]);
    check(context, capture.createdAt === binding.submittedAt, [
      "capture",
      "createdAt",
    ]);
    if (decision !== null) {
      check(context, decision.captureId === capture.id, [
        "decision",
        "captureId",
      ]);
      check(context, decision.suggestionId === suggestion.id, [
        "decision",
        "suggestionId",
      ]);
      check(
        context,
        decision.provenance.projectId === binding.projectId &&
          decision.provenance.environment === binding.environment &&
          decision.provenance.proposalVersion === binding.proposalVersion &&
          decision.provenance.proposalDigest ===
            suggestion.proposal.contentDigest &&
          decision.provenance.sourceDigest === binding.sourceDigest &&
          decision.provenance.citationsDigest === binding.citationsDigest,
        ["decision", "provenance"],
      );
    }
    if (decision?.decision === "approve") {
      check(
        context,
        capture.state === "filed" &&
          capture.filedRecord?.id === decision.filedRecordId &&
          capture.filedAt === decision.createdAt,
        ["capture", "filedRecord"],
      );
    } else check(context, capture.state === "unfiled", ["capture", "state"]);
  });
export type FoundationFindingProposalDetail = z.infer<
  typeof foundationFindingProposalDetailSchema
>;

// Immutable initial Knowledge snapshot; subsequent real revisions may differ.
export const foundationFindingKnowledgeSnapshotSchema = z.strictObject({
  id: identity,
  projectId: identity,
  sourceCaptureId: identity,
  kind: z.literal("note"),
  title,
  content: body,
  version: z.literal(1),
  createdAt: datetime,
  updatedAt: datetime,
});
export type FoundationFindingKnowledgeSnapshot = z.infer<
  typeof foundationFindingKnowledgeSnapshotSchema
>;

// Filing Knowledge does not review or verify the associated assertion.
export const foundationFindingProposalReviewReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    proposalId: identity,
    captureId: identity,
    projectId: identity,
    environment,
    decision: foundationFindingProposalDecisionSchema,
    knowledge: foundationFindingKnowledgeSnapshotSchema.nullable(),
    memory: foundationMemorySchema.nullable(),
  })
  .superRefine((value, context) => {
    const { decision, knowledge, memory } = value;
    check(context, value.proposalId === decision.suggestionId, ["proposalId"]);
    check(context, value.captureId === decision.captureId, ["captureId"]);
    check(
      context,
      value.projectId === decision.provenance.projectId &&
        value.environment === decision.provenance.environment,
      ["decision", "provenance"],
    );
    if (decision.decision === "reject") {
      check(context, knowledge === null, ["knowledge"]);
      check(context, memory === null, ["memory"]);
      return;
    }
    check(context, knowledge !== null, ["knowledge"]);
    check(context, memory !== null, ["memory"]);
    if (knowledge === null || memory === null) return;
    check(
      context,
      knowledge.id === decision.filedRecordId &&
        knowledge.sourceCaptureId === value.captureId &&
        knowledge.projectId === decision.selectedProjectId,
      ["knowledge", "id"],
    );
    check(
      context,
      knowledge.title === decision.selectedTitle &&
        knowledge.content === decision.selectedBody,
      ["knowledge", "content"],
    );
    check(
      context,
      knowledge.createdAt === decision.createdAt &&
        knowledge.updatedAt === decision.createdAt,
      ["knowledge", "createdAt"],
    );
    check(
      context,
      memory.projectId === value.projectId &&
        memory.knowledgeItemId === knowledge.id &&
        memory.version === 1 &&
        memory.content.category === "finding" &&
        memory.content.statement === knowledge.content &&
        memory.lifecycle === "proposed" &&
        memory.verification === "unverified" &&
        memory.content.relatedMemoryIds.length === 0 &&
        memory.content.relationType === null &&
        memory.content.evidenceIds.length > 0,
      ["memory"],
    );
  });
export type FoundationFindingProposalReviewReceipt = z.infer<
  typeof foundationFindingProposalReviewReceiptSchema
>;
