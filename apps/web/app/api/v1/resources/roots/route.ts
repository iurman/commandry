import { loadRuntimeConfig } from "@commandry/config";
import {
  listResourcesQuerySchema,
  listResourcesResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getResourceTopologyService,
  resourceTopologyFailure,
} from "../../../../../lib/resource-topology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid root resource page query" },
      400,
      "resources.roots.invalid_query",
    );
  }
  try {
    const page = await getResourceTopologyService().listRoots(parsed.data);
    return jsonResponse(
      request,
      listResourcesResponseSchema.parse(page),
      200,
      "resources.roots.list",
    );
  } catch (error) {
    return resourceTopologyFailure(request, error, "resources.roots.list");
  }
}
