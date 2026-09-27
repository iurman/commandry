import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  linkSystemResourceRequestSchema,
  listResourcesQuerySchema,
  listSystemResourcesResponseSchema,
  systemResourceConnectionSchema,
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
      { code: "INVALID_ID", message: "Invalid system ID" },
      400,
      "systems.resources.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid system resource page" },
      400,
      "systems.resources.invalid_query",
    );
  try {
    const page = await getSystemContextService().listSystemResources(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listSystemResourcesResponseSchema.parse(page),
      200,
      "systems.resources.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.resources.list");
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid system ID" },
      400,
      "systems.resources.invalid_id",
    );
  const parsed = linkSystemResourceRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid system resource link" },
      400,
      "systems.resources.invalid_body",
    );
  try {
    const link = await getSystemContextService().linkSystemResource(
      id,
      parsed.data.resourceId,
    );
    return jsonResponse(
      request,
      systemResourceConnectionSchema.parse(link),
      200,
      "systems.resources.link",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.resources.link");
  }
}
