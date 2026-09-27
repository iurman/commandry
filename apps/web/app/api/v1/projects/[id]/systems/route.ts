import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listSystemProjectsResponseSchema,
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
      { code: "INVALID_ID", message: "Invalid project ID" },
      400,
      "projects.systems.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid project system page" },
      400,
      "projects.systems.invalid_query",
    );
  try {
    const page = await getSystemContextService().listProjectSystems(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listSystemProjectsResponseSchema.parse(page),
      200,
      "projects.systems.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "projects.systems.list");
  }
}
