import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listProjectDecisionRevisionsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getProjectDecisionService,
  projectDecisionFailure,
} from "../../../../../../lib/project-decisions";

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
      { code: "INVALID_ID", message: "Invalid decision ID" },
      400,
      "decision_revisions.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid page query" },
      400,
      "decision_revisions.invalid_query",
    );
  try {
    const page = await getProjectDecisionService().listRevisions(
      id,
      query.data,
    );
    return jsonResponse(
      request,
      listProjectDecisionRevisionsResponseSchema.parse(page),
      200,
      "decision_revisions.list",
    );
  } catch (error) {
    return projectDecisionFailure(request, error, "decision_revisions.list");
  }
}
