import { loadRuntimeConfig } from "@commandry/config";
import {
  createProjectResourceLinkRequestSchema,
  entityIdSchema,
  listProjectResourceLinksResponseSchema,
  listResourcesQuerySchema,
  projectResourceLinkSchema,
} from "@commandry/contracts";
import {
  catalogFailure,
  getCatalogService,
} from "../../../../../../lib/catalog";
import { jsonResponse } from "../../../../../../lib/http";

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
      { code: "INVALID_ID", message: "A valid project ID is required" },
      400,
      "project_resources.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid relationship page query" },
      400,
      "project_resources.invalid_query",
    );
  }
  try {
    const page = await getCatalogService().listProjectResourceLinks(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listProjectResourceLinksResponseSchema.parse(page),
      200,
      "project_resources.list",
    );
  } catch (error) {
    return catalogFailure(request, error, "project_resources.list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid project ID is required" },
      400,
      "project_resources.invalid_id",
    );
  }
  const parsed = createProjectResourceLinkRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project relationship" },
      400,
      "project_resources.invalid_body",
    );
  }
  try {
    const created = await getCatalogService().linkProjectResource(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      projectResourceLinkSchema.parse(created),
      201,
      "project_resources.create",
    );
  } catch (error) {
    return catalogFailure(request, error, "project_resources.create");
  }
}
