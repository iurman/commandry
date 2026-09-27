import { loadRuntimeConfig } from "@commandry/config";
import {
  domainSummarySchema,
  entityIdSchema,
  updateDomainRequestSchema,
} from "@commandry/contracts";
import {
  domainPortfolioFailure,
  getDomainPortfolioService,
} from "../../../../../lib/domains";
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
      { code: "INVALID_ID", message: "Invalid domain ID" },
      400,
      "domains.invalid_id",
    );
  try {
    const item = await getDomainPortfolioService().getDomain(id);
    return item
      ? jsonResponse(
          request,
          domainSummarySchema.parse(item),
          200,
          "domains.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Domain not found" },
          404,
          "domains.not_found",
        );
  } catch (error) {
    return domainPortfolioFailure(request, error, "domains.read");
  }
}

export async function PATCH(
  request: Request,
  context: Context,
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
  const parsed = updateDomainRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid domain update" },
      400,
      "domains.invalid_body",
    );
  try {
    const saved = await getDomainPortfolioService().updateDomain(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      domainSummarySchema.parse(saved),
      200,
      "domains.update",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "domains.update");
  }
}
