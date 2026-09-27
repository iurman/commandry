import {
  entityIdSchema,
  localConnectorTokenSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalConnectorService,
  localIntegrationFailure,
  localIntegrationWriteAllowed,
} from "../../../../../../lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = localIntegrationWriteAllowed(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid integration ID" },
      400,
      "integrations.invalid_id",
    );
  try {
    const result = await (await getLocalConnectorService()).rotateToken(id);
    return jsonResponse(
      request,
      localConnectorTokenSchema.parse(result),
      201,
      "integrations.local_receiver_token_rotated",
    );
  } catch (error) {
    return localIntegrationFailure(
      request,
      error,
      "integrations.receiver_token",
    );
  }
}
