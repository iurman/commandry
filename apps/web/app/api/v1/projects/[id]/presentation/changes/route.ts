import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listProjectPresentationEventsQuerySchema,
  listProjectPresentationEventsResponseSchema,
} from "@commandry/contracts";
import {
  catalogFailure,
  getCatalogService,
} from "../../../../../../../lib/catalog";
import { jsonResponse } from "../../../../../../../lib/http";

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
      "projects.presentation.changes.invalid_id",
    );
  }
  const parsed = listProjectPresentationEventsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid view change page" },
      400,
      "projects.presentation.changes.invalid_query",
    );
  }
  try {
    const page = await getCatalogService().listProjectPresentationEvents(id, {
      limit: parsed.data.limit,
      ...(parsed.data.beforeVersion !== undefined && {
        beforeVersion: parsed.data.beforeVersion,
      }),
    });
    return jsonResponse(
      request,
      listProjectPresentationEventsResponseSchema.parse(page),
      200,
      "projects.presentation.changes.list",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.presentation.changes.list");
  }
}
