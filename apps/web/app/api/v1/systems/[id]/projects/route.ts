import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  linkSystemProjectRequestSchema,
  listResourcesQuerySchema,
  listSystemProjectsResponseSchema,
  systemProjectConnectionSchema,
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
      "systems.projects.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid system project page" },
      400,
      "systems.projects.invalid_query",
    );
  try {
    const page = await getSystemContextService().listSystemProjects(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listSystemProjectsResponseSchema.parse(page),
      200,
      "systems.projects.list",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.projects.list");
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
      "systems.projects.invalid_id",
    );
  const parsed = linkSystemProjectRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid system project link" },
      400,
      "systems.projects.invalid_body",
    );
  try {
    const link = await getSystemContextService().linkSystemProject(
      id,
      parsed.data.projectId,
    );
    return jsonResponse(
      request,
      systemProjectConnectionSchema.parse(link),
      200,
      "systems.projects.link",
    );
  } catch (error) {
    return systemContextFailure(request, error, "systems.projects.link");
  }
}
