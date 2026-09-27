import { loadRuntimeConfig } from "@commandry/config";
import {
  createDomainRequestSchema,
  domainSummarySchema,
  listDomainsQuerySchema,
  listDomainsResponseSchema,
} from "@commandry/contracts";
import {
  domainPortfolioFailure,
  getDomainPortfolioService,
} from "../../../../lib/domains";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = listDomainsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid domain page query" },
      400,
      "domains.invalid_query",
    );
  try {
    const page = await getDomainPortfolioService().listDomains(parsed.data);
    return jsonResponse(
      request,
      listDomainsResponseSchema.parse(page),
      200,
      "domains.list",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "domains.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const parsed = createDomainRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid domain" },
      400,
      "domains.invalid_body",
    );
  try {
    const saved = await getDomainPortfolioService().createDomain(parsed.data);
    return jsonResponse(
      request,
      domainSummarySchema.parse(saved),
      201,
      "domains.create",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "domains.create");
  }
}
