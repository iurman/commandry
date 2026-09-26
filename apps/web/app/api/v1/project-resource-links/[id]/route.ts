import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectResourceLinkDetailSchema,
} from "@commandry/contracts";
import {
  briefFailure,
  getRecordDetailRepository,
} from "../../../../../lib/briefs";
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
      { code: "INVALID_ID", message: "A valid resource link ID is required" },
      400,
      "project_resource_links.invalid_id",
    );
  }
  try {
    const link =
      await getRecordDetailRepository().getProjectResourceLinkById(id);
    return link
      ? jsonResponse(
          request,
          projectResourceLinkDetailSchema.parse(link),
          200,
          "project_resource_links.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Resource link not found" },
          404,
          "project_resource_links.not_found",
        );
  } catch (error) {
    return briefFailure(request, error, "project_resource_links.read");
  }
}
