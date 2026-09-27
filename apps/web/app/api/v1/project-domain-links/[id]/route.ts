import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, projectDomainLinkSchema } from "@commandry/contracts";
import {
  domainPortfolioFailure,
  getDomainPortfolioService,
} from "../../../../../lib/domains";
import { jsonResponse } from "../../../../../lib/http";

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
      { code: "INVALID_ID", message: "Invalid domain link ID" },
      400,
      "project_domain_links.invalid_id",
    );
  try {
    const item = await getDomainPortfolioService().getProjectDomainLink(id);
    return item
      ? jsonResponse(
          request,
          projectDomainLinkSchema.parse(item),
          200,
          "project_domain_links.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Domain link not found" },
          404,
          "project_domain_links.not_found",
        );
  } catch (error) {
    return domainPortfolioFailure(request, error, "project_domain_links.read");
  }
}
