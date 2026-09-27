import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  savedViewSchema,
  updateSavedViewRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getSavedViewService,
  savedViewFailure,
} from "../../../../../lib/saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid saved view ID is required" },
      400,
      "saved_views.invalid_id",
    );
  try {
    const view = await getSavedViewService().get(id);
    return view
      ? jsonResponse(
          request,
          savedViewSchema.parse(view),
          200,
          "saved_views.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Saved view not found" },
          404,
          "saved_views.not_found",
        );
  } catch (error) {
    return savedViewFailure(request, error, "saved_views.read");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid saved view ID is required" },
      400,
      "saved_views.invalid_id",
    );
  const parsed = updateSavedViewRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid saved view update" },
      400,
      "saved_views.invalid_body",
    );
  try {
    const view = await getSavedViewService().update(id, parsed.data);
    return jsonResponse(
      request,
      savedViewSchema.parse(view),
      200,
      "saved_views.updated",
    );
  } catch (error) {
    return savedViewFailure(request, error, "saved_views.update");
  }
}
