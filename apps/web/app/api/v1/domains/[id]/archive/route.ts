import { loadRuntimeConfig } from "@commandry/config";
import {
  archiveDomainRequestSchema,
  domainSummarySchema,
  entityIdSchema,
} from "@commandry/contracts";
import {
  domainPortfolioFailure,
  getDomainPortfolioService,
} from "../../../../../../lib/domains";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
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
  const parsed = archiveDomainRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid domain archive request" },
      400,
      "domains.invalid_body",
    );
  try {
    const saved = await getDomainPortfolioService().archiveDomain(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      domainSummarySchema.parse(saved),
      200,
      "domains.archive",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "domains.archive");
  }
}
