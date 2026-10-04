import {
  entityIdSchema,
  realIntegrationSchema,
  setRealIntegrationEnabledRequestSchema,
} from "@commandry/contracts";
import {
  getRealIntegrationService,
  realIntegrationActor,
  realIntegrationBody,
  realIntegrationFailure,
} from "../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(request, { code: "INVALID_ID" }, 400);
  try {
    const item = await getRealIntegrationService().get(id);
    return item
      ? jsonResponse(request, realIntegrationSchema.parse(item))
      : jsonResponse(request, { code: "NOT_FOUND" }, 404);
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(request, { code: "INVALID_ID" }, 400);
  try {
    const actor = await realIntegrationActor(request);
    const input = setRealIntegrationEnabledRequestSchema.safeParse(
      await realIntegrationBody(request),
    );
    if (!input.success)
      return jsonResponse(request, { code: "INVALID_BODY" }, 400);
    return jsonResponse(
      request,
      realIntegrationSchema.parse(
        await getRealIntegrationService().setEnabled(
          id,
          input.data.enabled,
          actor,
        ),
      ),
    );
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
