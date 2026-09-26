import { loadRuntimeConfig } from "@commandry/config";
import {
  createProjectRequestSchema,
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  projectSummarySchema,
} from "@commandry/contracts";
import { catalogFailure, getCatalogService } from "../../../../lib/catalog";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listProjectsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid project page query" },
      400,
      "projects.invalid_query",
    );
  }
  try {
    const page = await getCatalogService().listProjects(parsed.data);
    return jsonResponse(
      request,
      listProjectsResponseSchema.parse(page),
      200,
      "projects.list",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = createProjectRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project" },
      400,
      "projects.invalid_body",
    );
  }
  try {
    const created = await getCatalogService().createProject(parsed.data);
    return jsonResponse(
      request,
      projectSummarySchema.parse(created),
      201,
      "projects.create",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.create");
  }
}
