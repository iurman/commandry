import { entityIdSchema, linuxHostSampleSchema } from "@commandry/contracts";
import {
  getRealIntegrationService,
  realIntegrationBody,
  realIntegrationFailure,
} from "../../../../../../lib/real-integrations";
import { jsonResponse } from "../../../../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(request, { code: "INVALID_ID" }, 400);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 200)
    return jsonResponse(
      request,
      { code: "UNAUTHORIZED", message: "Host receiver token required" },
      401,
    );
  try {
    const input = linuxHostSampleSchema.safeParse(
      await realIntegrationBody(request),
    );
    if (!input.success)
      return jsonResponse(
        request,
        { code: "INVALID_BODY", message: "Invalid host sample" },
        400,
      );
    await getRealIntegrationService().receive(id, token, input.data);
    return jsonResponse(
      request,
      { accepted: true, isSynthetic: false },
      202,
      "integrations.real_host_received",
    );
  } catch (error) {
    return realIntegrationFailure(request, error);
  }
}
