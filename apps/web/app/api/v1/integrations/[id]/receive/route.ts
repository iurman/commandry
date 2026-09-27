import {
  entityIdSchema,
  runLocalIntegrationSampleRequestSchema,
  syntheticEventImportSchema,
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
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token)
    return jsonResponse(
      request,
      {
        code: "INVALID_RECEIVER_TOKEN",
        message: "Local receiver token required",
      },
      401,
      "integrations.local_receiver_denied",
    );
  const input = runLocalIntegrationSampleRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid synthetic source envelope" },
      400,
      "integrations.invalid_receiver_body",
    );
  try {
    const receipt = await (
      await getLocalConnectorService()
    ).receive(id, token, input.data);
    if (!receipt)
      return jsonResponse(
        request,
        {
          code: "INVALID_RECEIVER_TOKEN",
          message: "Local receiver token invalid",
        },
        401,
        "integrations.local_receiver_denied",
      );
    return jsonResponse(
      request,
      syntheticEventImportSchema.parse(receipt),
      202,
      "integrations.local_receiver_submitted",
    );
  } catch (error) {
    return localIntegrationFailure(
      request,
      error,
      "integrations.local_receiver",
    );
  }
}
