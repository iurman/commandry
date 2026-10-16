import { foundationAssessmentSchema } from "@commandry/contracts";
import {
  foundationEvaluationOwner,
  foundationFailure,
} from "../../../../../../../lib/foundation-access";
import { realIntegrationBody } from "../../../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const owner = await foundationEvaluationOwner(request);
    let body: unknown;
    try {
      body = await realIntegrationBody(request);
    } catch {
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    }
    const input = foundationAssessmentSchema.parse(body);
    return jsonResponse(
      request,
      await owner.reviewAssessment(
        input,
        request.headers.get("idempotency-key"),
      ),
      200,
      "foundation.owner.reviewAssessment",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
