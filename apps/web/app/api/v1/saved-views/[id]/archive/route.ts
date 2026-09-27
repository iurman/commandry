import { loadRuntimeConfig } from "@commandry/config";
import {
  archiveSavedViewRequestSchema,
  entityIdSchema,
  savedViewSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getSavedViewService,
  savedViewFailure,
} from "../../../../../../lib/saved-views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const parsed = archiveSavedViewRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid saved view archive" },
      400,
      "saved_views.invalid_body",
    );
  try {
    const view = await getSavedViewService().archive(
      id,
      parsed.data.expectedVersion,
    );
    return jsonResponse(
      request,
      savedViewSchema.parse(view),
      200,
      "saved_views.archived",
    );
  } catch (error) {
    return savedViewFailure(request, error, "saved_views.archive");
  }
}
