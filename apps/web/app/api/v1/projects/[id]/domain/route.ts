import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  projectDomainResponseSchema,
  setProjectDomainRequestSchema,
} from "@commandry/contracts";
import {
  domainPortfolioFailure,
  getDomainPortfolioService,
} from "../../../../../../lib/domains";
import { jsonResponse } from "../../../../../../lib/http";

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
      { code: "INVALID_ID", message: "Invalid project ID" },
      400,
      "projects.domain.invalid_id",
    );
  try {
    const membership = await getDomainPortfolioService().getProjectDomain(id);
    return jsonResponse(
      request,
      projectDomainResponseSchema.parse({ membership }),
      200,
      "projects.domain.read",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "projects.domain.read");
  }
}

export async function PUT(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid project ID" },
      400,
      "projects.domain.invalid_id",
    );
  const parsed = setProjectDomainRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project domain change" },
      400,
      "projects.domain.invalid_body",
    );
  try {
    const membership = await getDomainPortfolioService().setProjectDomain(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      projectDomainResponseSchema.parse({ membership }),
      200,
      "projects.domain.change",
    );
  } catch (error) {
    return domainPortfolioFailure(request, error, "projects.domain.change");
  }
}
