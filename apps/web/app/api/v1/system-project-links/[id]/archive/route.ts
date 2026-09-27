import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, systemProjectLinkSchema } from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../../lib/systems";
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
      { code: "INVALID_ID", message: "Invalid system project link ID" },
      400,
      "system_project_links.invalid_id",
    );
  try {
    const link = await getSystemContextService().archiveSystemProjectLink(id);
    return jsonResponse(
      request,
      systemProjectLinkSchema.parse(link),
      200,
      "system_project_links.archive",
    );
  } catch (error) {
    return systemContextFailure(request, error, "system_project_links.archive");
  }
}
