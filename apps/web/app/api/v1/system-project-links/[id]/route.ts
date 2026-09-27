import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, systemProjectLinkSchema } from "@commandry/contracts";
import {
  getSystemContextService,
  systemContextFailure,
} from "../../../../../lib/systems";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(
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
    const link = await getSystemContextService().getSystemProjectLink(id);
    return link
      ? jsonResponse(
          request,
          systemProjectLinkSchema.parse(link),
          200,
          "system_project_links.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "System project link not found" },
          404,
          "system_project_links.not_found",
        );
  } catch (error) {
    return systemContextFailure(request, error, "system_project_links.read");
  }
}
