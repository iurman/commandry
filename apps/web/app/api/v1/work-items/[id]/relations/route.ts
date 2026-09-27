import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listWorkItemRelationsQuerySchema,
  listWorkItemRelationsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkRelationsService,
  workRelationsFailure,
} from "../../../../../../lib/work-relations";

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
      { code: "INVALID_ID", message: "A valid work item ID is required" },
      400,
      "work_relations.invalid_id",
    );
  const query = listWorkItemRelationsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid work relationship page" },
      400,
      "work_relations.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listWorkItemRelationsResponseSchema.parse(
        await getWorkRelationsService().list(id, query.data),
      ),
      200,
      "work_relations.list",
    );
  } catch (error) {
    return workRelationsFailure(request, error, "work_relations.list");
  }
}
