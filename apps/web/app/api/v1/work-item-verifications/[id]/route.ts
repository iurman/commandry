import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  workItemVerificationSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getWorkAcceptanceService,
  workAcceptanceFailure,
} from "../../../../../lib/work-acceptance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid review ID is required" },
      400,
      "work_verifications.invalid_id",
    );
  try {
    const verification = await getWorkAcceptanceService().getVerification(id);
    if (!verification)
      return jsonResponse(
        request,
        { code: "REVIEW_NOT_FOUND", message: "Review record not found" },
        404,
        "work_verifications.not_found",
      );
    return jsonResponse(
      request,
      workItemVerificationSchema.parse(verification),
      200,
      "work_verifications.get",
    );
  } catch (error) {
    return workAcceptanceFailure(request, error, "work_verifications.get");
  }
}
