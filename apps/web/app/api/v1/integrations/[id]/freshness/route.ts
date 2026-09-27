import {
  entityIdSchema,
  localIntegrationSchema,
  setLocalIntegrationFreshnessRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalIntegrationService,
  localIntegrationFailure,
  localIntegrationWriteAllowed,
} from "../../../../../../lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
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
  const input = setLocalIntegrationFreshnessRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      {
        code: "INVALID_BODY",
        message: "Freshness window must be 1 to 10080 minutes",
      },
      400,
      "integrations.invalid_freshness_window",
    );
  try {
    const updated = await (
      await getLocalIntegrationService()
    ).setFreshnessWindow(id, input.data.windowMinutes);
    return jsonResponse(
      request,
      localIntegrationSchema.parse(updated),
      200,
      "integrations.freshness_window_updated",
    );
  } catch (error) {
    return localIntegrationFailure(
      request,
      error,
      "integrations.freshness_window",
    );
  }
}
