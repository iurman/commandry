import { loadRuntimeConfig } from "@commandry/config";
import {
  createProjectDecisionRequestSchema,
  entityIdSchema,
  listProjectDecisionsResponseSchema,
  listResourcesQuerySchema,
  projectDecisionSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getProjectDecisionService,
  projectDecisionFailure,
} from "../../../../../../lib/project-decisions";

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
      "decisions.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid page query" },
      400,
      "decisions.invalid_query",
    );
  try {
    const page = await getProjectDecisionService().list(id, query.data);
    return jsonResponse(
      request,
      listProjectDecisionsResponseSchema.parse(page),
      200,
      "decisions.list",
    );
  } catch (error) {
    return projectDecisionFailure(request, error, "decisions.list");
  }
}

export async function POST(
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
      "decisions.invalid_id",
    );
  const parsed = createProjectDecisionRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid decision" },
      400,
      "decisions.invalid_body",
    );
  try {
    const decision = await getProjectDecisionService().create(id, parsed.data);
    return jsonResponse(
      request,
      projectDecisionSchema.parse(decision),
      201,
      "decisions.created",
    );
  } catch (error) {
    return projectDecisionFailure(request, error, "decisions.create");
  }
}
