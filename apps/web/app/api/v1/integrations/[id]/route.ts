import { entityIdSchema, localIntegrationSchema } from "@commandry/contracts";
import { loadRuntimeConfig } from "@commandry/config";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalIntegrationService,
  localIntegrationFailure,
} from "../../../../../lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid integration ID" },
      400,
      "integrations.invalid_id",
    );
  }
  try {
    const instance = await (await getLocalIntegrationService()).get(id);
    if (!instance) {
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Integration not found" },
        404,
        "integrations.not_found",
      );
    }
    return jsonResponse(
      request,
      localIntegrationSchema.parse(instance),
      200,
      "integrations.get",
    );
  } catch (error) {
    return localIntegrationFailure(request, error, "integrations.get");
  }
}
