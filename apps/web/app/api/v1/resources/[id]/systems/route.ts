import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listSystemResourcesResponseSchema,
} from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../../lib/systems";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid resource ID" },
      400,
      "resources.systems.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid resource system page" },
      400,
      "resources.systems.invalid_query",
    );
  try {
    const page = await getSystemContextService().listResourceSystems(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listSystemResourcesResponseSchema.parse(page),
      200,
      "resources.systems.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "resources.systems.list");
  }
}
