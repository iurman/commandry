import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, workProjectLinkSchema } from "@commandry/contracts";
import {
  getWorkProjectContextService,
  workProjectFailure,
} from "../../../../../../lib/work-projects";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid work project link ID" },
      400,
      "work.project_link.archive.invalid_id",
    );
  try {
    const link = await getWorkProjectContextService().archiveLink(id);
    return jsonResponse(
      request,
      workProjectLinkSchema.parse(link),
      200,
      "work.project_link.archive",
    );
  } catch (error) {
    return workProjectFailure(request, error, "work.project_link.archive");
  }
}
