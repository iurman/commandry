import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listResourcesResponseSchema,
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
      "resources.children.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid child resource page query" },
      400,
      "resources.children.invalid_query",
    );
  }
  try {
    const page = await getResourceTopologyService().listChildren(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listResourcesResponseSchema.parse(page),
      200,
      "resources.children.list",
    );
  } catch (error) {
    return resourceTopologyFailure(request, error, "resources.children.list");
  }
}
