import {
  entityIdSchema,
  localAttentionSignalSchema,
  submitLocalAttentionReviewRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalAttentionService,
  localAttentionFailure,
  localAttentionModeFailure,
} from "../../../../../../lib/local-attention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAttentionModeFailure(
    request,
    "attention_signal.review",
  );
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid signal ID is required" },
      400,
      "attention_signal.review.invalid_id",
    );
  const parsed = submitLocalAttentionReviewRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local signal review" },
      400,
      "attention_signal.review.invalid_body",
    );
  try {
    const signal = await getLocalAttentionService().reviewSignal(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      localAttentionSignalSchema.parse(signal),
      200,
      "attention_signal.review",
    );
  } catch (error) {
    return localAttentionFailure(request, error, "attention_signal.review");
  }
}
