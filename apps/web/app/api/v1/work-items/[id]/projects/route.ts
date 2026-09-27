import { loadRuntimeConfig } from "@commandry/config";
import {
  createWorkProjectLinkRequestSchema,
  entityIdSchema,
  workProjectConnectionSchema,
  listWorkProjectConnectionsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  getWorkProjectContextService,
  workProjectFailure,
} from "../../../../../../lib/work-projects";
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
      { code: "INVALID_ID", message: "Invalid work ID" },
      400,
      "work.projects.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid work project page" },
      400,
      "work.projects.invalid_query",
    );
  try {
    const page = await getWorkProjectContextService().listLinks(id, query.data);
    return jsonResponse(
      request,
      listWorkProjectConnectionsResponseSchema.parse(page),
      200,
      "work.projects.list",
    );
  } catch (error) {
    return workProjectFailure(request, error, "work.projects.list");
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
      { code: "INVALID_ID", message: "Invalid work ID" },
      400,
      "work.projects.invalid_id",
    );
  const parsed = createWorkProjectLinkRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project relation" },
      400,
      "work.projects.invalid_body",
    );
  try {
    const linked = await getWorkProjectContextService().link(
      id,
      parsed.data.projectId,
    );
    return jsonResponse(
      request,
      workProjectConnectionSchema.parse(linked),
      200,
      "work.projects.link",
    );
  } catch (error) {
    return workProjectFailure(request, error, "work.projects.link");
  }
}
