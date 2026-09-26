import { loadRuntimeConfig } from "@commandry/config";
import {
  captureTriageReviewSchema,
  entityIdSchema,
  reviewCaptureTriageRequestSchema,
  reviewCaptureTriageResponseSchema,
} from "@commandry/contracts";
import {
  captureTriageFailure,
  getCaptureTriageService,
} from "../../../../../../lib/capture-triage";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid capture ID is required" },
      400,
      "capture_triage.invalid_id",
    );
  }
  try {
    const review = await (await getCaptureTriageService()).getReview(id);
    return jsonResponse(
      request,
      captureTriageReviewSchema.parse(review),
      200,
      "capture_triage.read",
    );
  } catch (error) {
    return captureTriageFailure(request, error, "capture_triage.read");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid capture ID is required" },
      400,
      "capture_triage.invalid_id",
    );
  }
  const parsed = reviewCaptureTriageRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid capture triage decision" },
      400,
      "capture_triage.invalid_body",
    );
  }
  try {
    const result = await (
      await getCaptureTriageService()
    ).review(id, parsed.data);
    return jsonResponse(
      request,
      reviewCaptureTriageResponseSchema.parse(result),
      200,
      "capture_triage.review",
    );
  } catch (error) {
    return captureTriageFailure(request, error, "capture_triage.review");
  }
}
