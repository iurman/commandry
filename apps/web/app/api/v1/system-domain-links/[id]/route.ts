import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, systemDomainLinkSchema } from "@commandry/contracts";
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
      { code: "INVALID_ID", message: "Invalid system domain link ID" },
      400,
      "system_domain_links.invalid_id",
    );
  try {
    const link = await getSystemContextService().getSystemDomainLink(id);
    return link
      ? jsonResponse(
          request,
          systemDomainLinkSchema.parse(link),
          200,
          "system_domain_links.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "System domain link not found" },
          404,
          "system_domain_links.not_found",
        );
  } catch (error) {
    return systemContextFailure(request, error, "system_domain_links.read");
  }
}
