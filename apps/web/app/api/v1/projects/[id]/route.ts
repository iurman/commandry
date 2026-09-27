import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectSummarySchema,
  updateProjectRequestSchema,
} from "@commandry/contracts";
import { catalogFailure, getCatalogService } from "../../../../../lib/catalog";
import { jsonResponse } from "../../../../../lib/http";

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
      "projects.invalid_id",
    );
  }
  try {
    const item = await getCatalogService().getProject(id);
    return item
      ? jsonResponse(
          request,
          projectSummarySchema.parse(item),
          200,
          "projects.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Project not found" },
          404,
          "projects.not_found",
        );
  } catch (error) {
    return catalogFailure(request, error, "projects.read");
  }
}

export async function PATCH(
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
      "projects.invalid_id",
    );
  }
  const parsed = updateProjectRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project revision" },
      400,
      "projects.invalid_body",
    );
  }
  try {
    const updated = await getCatalogService().updateProject(id, parsed.data);
    return jsonResponse(
      request,
      projectSummarySchema.parse(updated),
      200,
      "projects.update",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.update");
  }
}
