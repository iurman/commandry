import {
  entityIdSchema,
  localIntegrationSchema,
  setLocalIntegrationEnabledRequestSchema,
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
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid integration ID" },
      400,
      "integrations.invalid_id",
    );
  }
  const parsed = setLocalIntegrationEnabledRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid enabled change" },
      400,
      "integrations.invalid_enabled_body",
    );
  }
  try {
    const updated = await (
      await getLocalIntegrationService()
    ).setEnabled(id, parsed.data.enabled);
    return jsonResponse(
      request,
      localIntegrationSchema.parse(updated),
      200,
      "integrations.enabled_changed",
    );
  } catch (error) {
    return localIntegrationFailure(
      request,
      error,
      "integrations.enabled_change",
    );
  }
}
