import { z, type ZodType } from "zod";
import {
  FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES,
  FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES,
  FOUNDATION_ONBOARDING_MAX_INPUT_BYTES,
  foundationActorSchema,
  foundationFindingProposalDetailSchema,
  foundationFindingProposalReviewInputSchema,
  foundationFindingProposalReviewReceiptSchema,
  foundationImprovementDecisionInputSchema,
  foundationImprovementDecisionSchema,
  foundationImprovementDetailSchema,
  foundationImprovementPageSchema,
  foundationOnboardingApplyInputSchema,
  foundationOnboardingDecisionSchema,
  foundationOnboardingDetailSchema,
  foundationOnboardingOutcomeSchema,
  foundationOnboardingPageSchema,
  foundationOnboardingPreviewSchema,
  foundationOnboardingReviewInputSchema,
  foundationWorkflowListQuerySchema,
} from "@commandry/contracts";
import {
  foundationFailure,
  foundationWorkflowOwner,
} from "./foundation-access";
import {
  foundationImportBody,
  FoundationImportBodyError,
} from "./foundation-import-body";
import { jsonResponse } from "./http";

const projectQuery = z.strictObject({
  projectId: foundationActorSchema.shape.projectId,
});
function query(request: Request, paged = false) {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1))
    throw new z.ZodError([
      { code: "custom", path: [], message: "Duplicate query" },
    ]);
  const value: Record<string, unknown> = Object.fromEntries(params);
  if (paged && params.has("limit")) value.limit = Number(params.get("limit"));
  return paged
    ? foundationWorkflowListQuerySchema.parse(value)
    : projectQuery.parse(value);
}
function output<T>(
  request: Request,
  schema: ZodType<T>,
  value: unknown,
  bound: (value: T) => boolean,
) {
  const parsed = schema.safeParse(value);
  if (!parsed.success || !bound(parsed.data))
    throw new Error("Workflow response unavailable");
  return jsonResponse(
    request,
    parsed.data,
    200,
    "foundation.owner.workflow.response",
  );
}
const mutation = <T extends ZodType>(record: T) =>
  z.strictObject({
    record,
    replayed: z.boolean(),
    correlationId: foundationActorSchema.shape.correlationId,
  });
const matchesInput = (record: object, input: object) =>
  Object.entries(input).every(
    ([key, value]) => (record as Record<string, unknown>)[key] === value,
  );

/** HTTP orchestration only. Every owner identity, transaction, policy and
 * canonical mutation is resolved by the shared application services. */
export async function foundationWorkflowHttp(request: Request, path: string[]) {
  try {
    const owner = await foundationWorkflowOwner(request);
    const [kind, action, suffix] = path;
    if (
      request.method === "GET" &&
      path.length === 1 &&
      (kind === "improvements" || kind === "onboarding")
    ) {
      const input = foundationWorkflowListQuerySchema.parse(
        query(request, true),
      );
      if (kind === "improvements")
        return output(
          request,
          foundationImprovementPageSchema,
          await owner.improvement.list(input),
          (value) => value.projectId === input.projectId,
        );
      return output(
        request,
        foundationOnboardingPageSchema,
        await owner.onboarding.list(input),
        (value) => value.projectId === input.projectId,
      );
    }
    if (
      request.method === "GET" &&
      kind === "findings" &&
      action === "by-capture" &&
      path.length === 3
    ) {
      const input = {
        ...query(request),
        captureId: foundationActorSchema.shape.projectId.parse(suffix),
      };
      return output(
        request,
        foundationFindingProposalDetailSchema,
        await owner.findings.byCapture(input),
        (value) =>
          value.capture.id === input.captureId &&
          value.capture.projectId === input.projectId,
      );
    }
    if (
      request.method === "GET" &&
      path.length === 2 &&
      (kind === "improvements" || kind === "onboarding" || kind === "findings")
    ) {
      const input = {
        ...query(request),
        id: foundationActorSchema.shape.projectId.parse(action),
      };
      if (kind === "improvements")
        return output(
          request,
          foundationImprovementDetailSchema,
          await owner.improvement.get(input),
          (value) =>
            value.proposal.id === input.id &&
            value.proposal.projectId === input.projectId,
        );
      if (kind === "onboarding")
        return output(
          request,
          foundationOnboardingDetailSchema,
          await owner.onboarding.get(input),
          (value) =>
            value.proposal.id === input.id &&
            value.proposal.projectId === input.projectId,
        );
      return output(
        request,
        foundationFindingProposalDetailSchema,
        await owner.findings.get(input),
        (value) =>
          value.suggestion.id === input.id &&
          value.capture.projectId === input.projectId,
      );
    }
    if (
      request.method === "GET" &&
      path.length === 3 &&
      kind === "onboarding" &&
      suffix === "preview"
    ) {
      const input = {
        ...query(request),
        id: foundationActorSchema.shape.projectId.parse(action),
      };
      return output(
        request,
        foundationOnboardingPreviewSchema,
        await owner.onboarding.preview(input),
        (value) =>
          value.proposalId === input.id && value.projectId === input.projectId,
      );
    }
    if (
      request.method === "POST" &&
      path.length === 2 &&
      new URL(request.url).search === ""
    ) {
      const key = request.headers.get("idempotency-key");
      if (kind === "improvements" && action === "review") {
        const input = foundationImprovementDecisionInputSchema.parse(
          await foundationImportBody(
            request,
            FOUNDATION_IMPROVEMENT_MAX_INPUT_BYTES,
          ),
        );
        return output(
          request,
          mutation(foundationImprovementDecisionSchema),
          await owner.improvement.review(input, key),
          (value) => matchesInput(value.record, input),
        );
      }
      if (kind === "findings" && action === "review") {
        const input = foundationFindingProposalReviewInputSchema.parse(
          await foundationImportBody(
            request,
            FOUNDATION_FINDING_PROPOSAL_MAX_INPUT_BYTES,
          ),
        );
        return output(
          request,
          mutation(foundationFindingProposalReviewReceiptSchema),
          await owner.findings.review(input, key),
          (value) =>
            value.record.projectId === input.projectId &&
            value.record.proposalId === input.proposalId &&
            value.record.decision.decision === input.decision &&
            value.record.decision.provenance.proposalVersion ===
              input.expectedVersion &&
            value.record.decision.provenance.proposalDigest ===
              input.expectedProposalDigest &&
            value.record.decision.provenance.sourceDigest ===
              input.expectedSourceDigest &&
            value.record.decision.provenance.citationsDigest ===
              input.expectedCitationsDigest &&
            value.record.decision.provenance.reason === input.reason &&
            (input.decision !== "approve" ||
              (value.record.decision.selectedTitle === input.selectedTitle &&
                value.record.decision.selectedBody === input.selectedBody)) &&
            value.record.decision.provenance.correlationId ===
              value.correlationId,
        );
      }
      if (kind === "onboarding" && action === "review") {
        const input = foundationOnboardingReviewInputSchema.parse(
          await foundationImportBody(
            request,
            FOUNDATION_ONBOARDING_MAX_INPUT_BYTES,
          ),
        );
        return output(
          request,
          mutation(foundationOnboardingDecisionSchema),
          await owner.onboarding.review(input, key),
          (value) => matchesInput(value.record, input),
        );
      }
      if (kind === "onboarding" && action === "apply") {
        const input = foundationOnboardingApplyInputSchema.parse(
          await foundationImportBody(
            request,
            FOUNDATION_ONBOARDING_MAX_INPUT_BYTES,
          ),
        );
        return output(
          request,
          mutation(foundationOnboardingOutcomeSchema),
          await owner.onboarding.apply(input, key),
          (value) =>
            value.record.projectId === input.projectId &&
            value.record.proposalId === input.proposalId &&
            value.record.decisionId === input.decisionId &&
            value.record.decisionVersion === input.expectedDecisionVersion &&
            value.record.decisionDigest === input.expectedDecisionDigest &&
            value.record.proposalDigest === input.expectedProposalDigest &&
            value.record.correlationId === value.correlationId,
        );
      }
    }
    return jsonResponse(request, { code: "NOT_FOUND" }, 404);
  } catch (error) {
    if (error instanceof FoundationImportBodyError)
      return jsonResponse(request, { code: error.code }, error.status);
    return foundationFailure(request, error);
  }
}
