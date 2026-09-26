import { loadRuntimeConfig } from "@commandry/config";
import {
  automationDefinitionSchema,
  entityIdSchema,
  setAutomationEnabledRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalAutomationService,
  localAutomationFailure,
} from "../../../../../../lib/local-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid automation ID" },
      400,
      "automations.invalid_id",
    );
  const parsed = setAutomationEnabledRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid enabled change" },
      400,
      "automations.invalid_enabled_body",
    );
  try {
    const definition = await (
      await getLocalAutomationService()
    ).setEnabled(id, parsed.data);
    return jsonResponse(
      request,
      automationDefinitionSchema.parse(definition),
      200,
      "automations.enabled_changed",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automations.enabled_change");
  }
}
