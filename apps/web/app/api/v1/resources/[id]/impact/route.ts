import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourceImpactQuerySchema,
  resourceImpactResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getResourceTopologyService,
  resourceTopologyFailure,
} from "../../../../../../lib/resource-topology";

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
      { code: "INVALID_ID", message: "A valid resource ID is required" },
      400,
      "resources.impact.invalid_id",
    );
  }
  const parsed = listResourceImpactQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid resource impact page query" },
      400,
      "resources.impact.invalid_query",
    );
  }
  try {
    const impact = await getResourceTopologyService().listImpact(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      resourceImpactResponseSchema.parse(impact),
      200,
      "resources.impact.read",
    );
  } catch (error) {
    return resourceTopologyFailure(request, error, "resources.impact.read");
  }
}
