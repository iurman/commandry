import {
  FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES,
  foundationTaskProposalReviewInputSchema,
  foundationTaskProposalReviewReceiptSchema,
  foundationActorSchema,
} from "@commandry/contracts";
import { z } from "zod";
import {
  foundationFailure,
  foundationTaskProposalOwner,
} from "../../../../../../lib/foundation-access";
import {
  foundationImportBody,
  FoundationImportBodyError,
} from "../../../../../../lib/foundation-import-body";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const resultSchema = z.strictObject({
  record: foundationTaskProposalReviewReceiptSchema,
  replayed: z.boolean(),
  correlationId: foundationActorSchema.shape.correlationId,
});
export async function POST(request: Request) {
  try {
    const owner = await foundationTaskProposalOwner(request);
    const input = foundationTaskProposalReviewInputSchema.parse(
      await foundationImportBody(
        request,
        FOUNDATION_TASK_PROPOSAL_MAX_INPUT_BYTES,
      ),
    );
    const result = await owner.reviewTaskProposal(
      input,
      request.headers.get("idempotency-key"),
    );
    const parsed = resultSchema.safeParse(result);
    if (
      !parsed.success ||
      parsed.data.correlationId !==
        parsed.data.record.decision.provenance.correlationId
    )
      throw new Error("Task proposal response unavailable");
    return jsonResponse(
      request,
      parsed.data,
      200,
      "foundation.owner.taskProposal.review",
    );
  } catch (error) {
    if (error instanceof FoundationImportBodyError)
      return jsonResponse(request, { code: error.code }, error.status);
    return foundationFailure(request, error);
  }
}
