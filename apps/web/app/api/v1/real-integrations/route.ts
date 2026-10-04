import {
  createRealIntegrationRequestSchema,
  realIntegrationPageQuerySchema,
  listRealIntegrationsResponseSchema,
  realIntegrationSchema,
} from "@commandry/contracts";
import {
  getRealIntegrationService,
  realIntegrationActor,
  realIntegrationBody,
  realIntegrationFailure,
} from "../../../../lib/real-integrations";
import { jsonResponse } from "../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const input = realIntegrationPageQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid source page" },
      400,
    );
  try {
    return jsonResponse(
      request,
      listRealIntegrationsResponseSchema.parse(
        await getRealIntegrationService().list(input.data),
      ),
    );
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await realIntegrationActor(request);
    const input = createRealIntegrationRequestSchema.safeParse(
      await realIntegrationBody(request),
    );
    if (!input.success)
      return jsonResponse(
        request,
        { code: "INVALID_BODY", message: "Invalid source configuration" },
        400,
      );
    return jsonResponse(
      request,
      realIntegrationSchema.parse(
        await getRealIntegrationService().create(input.data, actor),
      ),
      201,
      "integrations.real_created",
    );
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
