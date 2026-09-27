import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listWorkItemAcceptanceRevisionsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkAcceptanceService,
  workAcceptanceFailure,
} from "../../../../../../lib/work-acceptance";

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
      { code: "INVALID_ID", message: "A valid task ID is required" },
      400,
      "work_acceptance_revisions.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid revision page" },
      400,
      "work_acceptance_revisions.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listWorkItemAcceptanceRevisionsResponseSchema.parse(
        await getWorkAcceptanceService().listRevisions(id, query.data),
      ),
      200,
      "work_acceptance_revisions.list",
    );
  } catch (error) {
    return workAcceptanceFailure(
      request,
      error,
      "work_acceptance_revisions.list",
    );
  }
}
