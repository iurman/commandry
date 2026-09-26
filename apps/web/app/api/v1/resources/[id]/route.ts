import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, resourceSummarySchema } from "@commandry/contracts";
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
      { code: "INVALID_ID", message: "A valid resource ID is required" },
      400,
      "resources.invalid_id",
    );
  }
  try {
    const item = await getCatalogService().getResource(id);
    return item
      ? jsonResponse(
          request,
          resourceSummarySchema.parse(item),
          200,
          "resources.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Resource not found" },
          404,
          "resources.not_found",
        );
  } catch (error) {
    return catalogFailure(request, error, "resources.read");
  }
}
