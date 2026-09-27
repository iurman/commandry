import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listProjectMetadataEventsQuerySchema,
  listProjectMetadataEventsResponseSchema,
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
      "projects.changes.invalid_id",
    );
  }
  const parsed = listProjectMetadataEventsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid project change page" },
      400,
      "projects.changes.invalid_query",
    );
  }
  try {
    const page = await getCatalogService().listProjectMetadataEvents(id, {
      limit: parsed.data.limit,
      ...(parsed.data.beforeVersion !== undefined && {
        beforeVersion: parsed.data.beforeVersion,
      }),
    });
    return jsonResponse(
      request,
      listProjectMetadataEventsResponseSchema.parse(page),
      200,
      "projects.changes.list",
    );
  } catch (error) {
    return catalogFailure(request, error, "projects.changes.list");
  }
}
