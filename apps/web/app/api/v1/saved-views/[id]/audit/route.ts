import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listSavedViewAuditResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getSavedViewService,
  savedViewFailure,
} from "../../../../../../lib/saved-views";

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
      "saved_view_audit.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid audit page query" },
      400,
      "saved_view_audit.invalid_query",
    );
  try {
    const page = await getSavedViewService().listAudit({ id, ...parsed.data });
    return jsonResponse(
      request,
      listSavedViewAuditResponseSchema.parse(page),
      200,
      "saved_view_audit.list",
    );
  } catch (error) {
    return savedViewFailure(request, error, "saved_view_audit.list");
  }
}
