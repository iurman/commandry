import { z } from "zod";
import { foundationActorSchema } from "./agent-foundation";
import { captureSchema } from "./capture";
import {
  captureTriageDecisionSchema,
  captureTriageSuggestionSchema,
} from "./capture-triage";
import { foundationProjectWorkRecordSchema } from "./foundation-work";

// Enforced by services/transports against encoded input, not a JSON encoder.
export const FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES = 524288;
const identity = foundationActorSchema.shape.projectId;
const environment = foundationActorSchema.shape.environment;
const datetime = foundationActorSchema.shape.expiresAt;
const digest = z
  .string()
  .length(64)
  .regex(/^[a-f0-9]{64}$/);

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
const text = (maximum: number, nonblank = false) =>
  z
    .string()
    .max(maximum)
    .refine(validText, "Invalid source text")
    .refine(
      (value) => !nonblank || value.trim().length > 0,
      "Must not be blank",
    );
const original = text(20000, true);
const title = text(200, true);
const body = text(20000);
const rationale = text(4000, true);
const clientPrincipal = z.string().refine((value) => {
  const prefix = "foundation-client:";
  if (!value.startsWith(prefix)) return false;
  const id = identity.safeParse(value.slice(prefix.length));
  return id.success && value === prefix + id.data;
}, "A canonical foundation client principal is required");
const humanPrincipal = text(500, true).refine(
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
const sameId = (left: string | null, right: string | null) =>
  left !== null && right !== null && left.toLowerCase() === right.toLowerCase();

export const foundationTaskProposalToolInputSchema = z.strictObject({
  originalContent: original,
  proposedTitle: title,
  proposedBody: body,
  rationale,
});
export type FoundationTaskProposalToolInput = z.infer<
  typeof foundationTaskProposalToolInputSchema
>;
export const foundationTaskProposalInputSchema =
  foundationTaskProposalToolInputSchema.extend({ projectId: identity });
export type FoundationTaskProposalInput = z.infer<
  typeof foundationTaskProposalInputSchema
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

// Hashing and stored truth are application/database responsibilities.
export const foundationTaskProposalBindingSchema = z
  .strictObject({
    ...submissionIdentity,
    proposedTitle: title,
    proposedBody: body,
    rationale,
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
export type FoundationTaskProposalBinding = z.infer<
  typeof foundationTaskProposalBindingSchema
>;

export const foundationTaskProposalCaptureSchema = captureSchema
  .extend({
    inputType: z.literal("text"),
    file: z.null(),
    source: z.literal("foundation-client"),
    author: clientPrincipal,
    projectId: identity,
    originalContent: original,
    filedRecord: captureSchema.shape.filedRecord
      .unwrap()
      .extend({ kind: z.literal("task") })
      .strict()
      .nullable(),
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
export type FoundationTaskProposalCapture = z.infer<
  typeof foundationTaskProposalCaptureSchema
>;

export const foundationTaskProposalSuggestionSchema =
  captureTriageSuggestionSchema
    .extend({
      kind: z.literal("task"),
      proposedProjectId: identity,
      title,
      body,
      confidence: z.null(),
      rationale,
      ruleVersion: z.literal("agent-task-proposal/v1"),
      sourceLabel: z.literal("Agent task proposal"),
      proposal: z.strictObject({
        binding: foundationTaskProposalBindingSchema,
        contentDigest: digest,
      }),
    })
    .strict()
    .superRefine((value, context) => {
      const binding = value.proposal.binding;
      check(context, sameId(value.id, binding.proposalId), ["id"]);
      check(context, sameId(value.captureId, binding.captureId), ["captureId"]);
      check(context, sameId(value.proposedProjectId, binding.projectId), [
        "proposedProjectId",
      ]);
      check(context, value.createdAt === binding.submittedAt, ["createdAt"]);
      check(context, value.title === binding.proposedTitle, ["title"]);
      check(context, value.body === binding.proposedBody, ["body"]);
      check(context, value.rationale === binding.rationale, ["rationale"]);
    });
export type FoundationTaskProposalSuggestion = z.infer<
  typeof foundationTaskProposalSuggestionSchema
>;

// Immutable historical submission, not a claim about the current review state.
export const foundationTaskProposalSubmissionSchema = z
  .strictObject({
    ...submissionIdentity,
    proposalDigest: digest,
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
export type FoundationTaskProposalSubmission = z.infer<
  typeof foundationTaskProposalSubmissionSchema
>;

const reviewBinding = {
  projectId: identity,
  proposalId: identity,
  expectedVersion: z.literal(1),
  expectedProposalDigest: digest,
  expectedSourceDigest: digest,
};
export const foundationTaskProposalReviewInputSchema = z.discriminatedUnion(
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
export type FoundationTaskProposalReviewInput = z.infer<
  typeof foundationTaskProposalReviewInputSchema
>;

export const foundationTaskProposalDecisionSchema = captureTriageDecisionSchema
  .extend({
    selectedProjectId: identity.nullable(),
    selectedKind: z.literal("task").nullable(),
    selectedTitle: title.nullable(),
    selectedBody: body.nullable(),
    actor: humanPrincipal,
    provenance: z.strictObject({
      schemaVersion: z.literal(1),
      projectId: identity,
      environment,
      proposalVersion: z.literal(1),
      proposalDigest: digest,
      sourceDigest: digest,
      reviewedBy: humanPrincipal,
      correlationId: identity,
    }),
  })
  .strict()
  .superRefine((value, context) => {
    check(context, value.actor === value.provenance.reviewedBy, ["actor"]);
    if (value.decision === "approve") {
      check(
        context,
        sameId(value.selectedProjectId, value.provenance.projectId),
        ["selectedProjectId"],
      );
      check(
        context,
        value.selectedKind === "task" &&
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
export type FoundationTaskProposalDecision = z.infer<
  typeof foundationTaskProposalDecisionSchema
>;

// These relationships do not verify source bytes, grants or owner identity.
export const foundationTaskProposalDetailSchema = z
  .strictObject({
    capture: foundationTaskProposalCaptureSchema,
    suggestion: foundationTaskProposalSuggestionSchema,
    decision: foundationTaskProposalDecisionSchema.nullable(),
  })
  .superRefine((value, context) => {
    const { capture, suggestion, decision } = value;
    const binding = suggestion.proposal.binding;
    check(context, sameId(capture.id, binding.captureId), ["capture", "id"]);
    check(context, sameId(capture.projectId, binding.projectId), [
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
      check(context, sameId(decision.captureId, capture.id), [
        "decision",
        "captureId",
      ]);
      check(context, sameId(decision.suggestionId, suggestion.id), [
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
          decision.provenance.sourceDigest === binding.sourceDigest,
        ["decision", "provenance"],
      );
    }
    if (decision?.decision === "approve") {
      check(
        context,
        capture.state === "filed" &&
          sameId(capture.filedRecord?.id ?? null, decision.filedRecordId),
        ["capture", "filedRecord"],
      );
    } else check(context, capture.state === "unfiled", ["capture", "state"]);
  });
export type FoundationTaskProposalDetail = z.infer<
  typeof foundationTaskProposalDetailSchema
>;

// Immutable INITIAL canonical Work snapshot; later normal Work edits are valid.
export const foundationTaskProposalReviewReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    proposalId: identity,
    captureId: identity,
    projectId: identity,
    environment,
    decision: foundationTaskProposalDecisionSchema,
    work: foundationProjectWorkRecordSchema.nullable(),
  })
  .superRefine((value, context) => {
    const { decision, work } = value;
    check(context, sameId(value.proposalId, decision.suggestionId), [
      "proposalId",
    ]);
    check(context, sameId(value.captureId, decision.captureId), ["captureId"]);
    check(
      context,
      value.projectId === decision.provenance.projectId &&
        value.environment === decision.provenance.environment,
      ["decision", "provenance"],
    );
    if (decision.decision === "reject") {
      check(context, work === null, ["work"]);
    } else {
      check(context, work !== null, ["work"]);
      if (work === null) return;
      check(
        context,
        sameId(work.id, decision.filedRecordId) &&
          sameId(work.sourceCaptureId, value.captureId) &&
          sameId(work.projectId, decision.selectedProjectId),
        ["work", "id"],
      );
      check(
        context,
        work.title === decision.selectedTitle &&
          work.description === decision.selectedBody,
        ["work", "title"],
      );
      check(
        context,
        work.workType === "task" &&
          work.status === "open" &&
          work.assigneeKind === "unassigned" &&
          work.assigneeAgentId === null &&
          work.assigneeLabel === null &&
          work.generatedFromWorkItemId === null &&
          work.priority === null &&
          work.dueOn === null &&
          work.contextLink === null,
        ["work"],
      );
    }
  });
export type FoundationTaskProposalReviewReceipt = z.infer<
  typeof foundationTaskProposalReviewReceiptSchema
>;
