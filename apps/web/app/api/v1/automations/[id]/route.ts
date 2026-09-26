import { loadRuntimeConfig } from "@commandry/config";
import {
  automationDefinitionSchema,
  entityIdSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalAutomationService,
  localAutomationFailure,
} from "../../../../../lib/local-automations";

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
      { code: "INVALID_ID", message: "Invalid automation ID" },
      400,
      "automations.invalid_id",
    );
  try {
    const definition = await (
      await getLocalAutomationService()
    ).getDefinition(id);
    return definition
      ? jsonResponse(
          request,
          automationDefinitionSchema.parse(definition),
          200,
          "automations.read",
        )
      : jsonResponse(
          request,
          { code: "AUTOMATION_NOT_FOUND", message: "Automation not found" },
          404,
          "automations.not_found",
        );
  } catch (error) {
    return localAutomationFailure(request, error, "automations.read");
  }
}
