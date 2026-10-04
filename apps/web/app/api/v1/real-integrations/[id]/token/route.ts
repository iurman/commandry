import { entityIdSchema, realReceiverTokenSchema } from "@commandry/contracts";
import {
  getRealIntegrationService,
  realIntegrationActor,
  realIntegrationFailure,
} from "../../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(request, { code: "INVALID_ID" }, 400);
  try {
    const actor = await realIntegrationActor(request);
    return jsonResponse(
      request,
      realReceiverTokenSchema.parse(
        await getRealIntegrationService().rotateToken(id, actor),
      ),
      201,
    );
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
