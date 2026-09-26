import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, projectBriefSchema } from "@commandry/contracts";
import {
  briefFailure,
  getProjectBriefService,
} from "../../../../../../lib/briefs";
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
      "project_brief.invalid_id",
    );
  }
  try {
    const brief = await getProjectBriefService().getBrief(id);
    return brief
      ? jsonResponse(
          request,
          projectBriefSchema.parse(brief),
          200,
          "project_brief.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Project not found" },
          404,
          "project_brief.not_found",
        );
  } catch (error) {
    return briefFailure(request, error, "project_brief.read");
  }
}
