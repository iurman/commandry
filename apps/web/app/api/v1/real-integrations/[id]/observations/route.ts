import {
  entityIdSchema,
  realIntegrationPageQuerySchema,
  listRealObservationsResponseSchema,
} from "@commandry/contracts";
import {
  getRealIntegrationService,
  realIntegrationFailure,
} from "../../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const input = realIntegrationPageQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!entityIdSchema.safeParse(id).success || !input.success)
    return jsonResponse(request, { code: "INVALID_QUERY" }, 400);
  try {
    return jsonResponse(
      request,
      listRealObservationsResponseSchema.parse(
        await getRealIntegrationService().observations(id, input.data),
      ),
    );
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
