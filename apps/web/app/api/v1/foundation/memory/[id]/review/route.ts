import { foundationReviewMemorySchema } from "@commandry/contracts";
import {
  foundationFailure,
  foundationOwner,
} from "../../../../../../../lib/foundation-access";
import { realIntegrationBody } from "../../../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await foundationOwner(request);
    let body: unknown;
    try {
      body = await realIntegrationBody(request);
    } catch {
      return jsonResponse(request, { code: "INVALID_INPUT" }, 400);
    }
    const fields = foundationReviewMemorySchema
      .omit({ memoryId: true })
      .parse(body);
    const input = foundationReviewMemorySchema.parse({
      ...fields,
      memoryId: (await context.params).id,
    });
    return jsonResponse(
      request,
      await owner.reviewMemory(input, request.headers.get("idempotency-key")),
      200,
      "foundation.owner.reviewMemory",
    );
  } catch (error) {
    return foundationFailure(request, error);
  }
}
