import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listDomainProjectsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  domainPortfolioFailure,
  getDomainPortfolioService,
} from "../../../../../../lib/domains";
import { jsonResponse } from "../../../../../../lib/http";

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
      { code: "INVALID_ID", message: "Invalid domain ID" },
      400,
      "domains.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid domain project page" },
      400,
      "domains.invalid_query",
    );
  try {
    const page = await getDomainPortfolioService().listDomainProjects(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listDomainProjectsResponseSchema.parse(page),
      200,
      "domains.projects.list",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "domains.projects.list");
  }
}
