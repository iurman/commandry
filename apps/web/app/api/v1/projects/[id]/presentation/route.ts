import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectPresentationSchema,
  updateProjectPresentationRequestSchema,
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
      "projects.presentation.invalid_id",
    );
  }
  try {
    const current = await getCatalogService().getProjectPresentation(id);
    return jsonResponse(
      request,
      projectPresentationSchema.parse(current),
      200,
      "projects.presentation.read",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.presentation.read");
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
      "projects.presentation.invalid_id",
    );
  }
  const parsed = updateProjectPresentationRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project view settings" },
      400,
      "projects.presentation.invalid_body",
    );
  }
  try {
    const updated = await getCatalogService().updateProjectPresentation(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      projectPresentationSchema.parse(updated),
      200,
      "projects.presentation.update",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.presentation.update");
  }
}
