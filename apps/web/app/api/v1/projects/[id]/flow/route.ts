import {
  entityIdSchema,
  listProjectFlowQuerySchema,
  listProjectFlowResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getProjectFlowService,
  projectFlowFailure,
} from "../../../../../../lib/project-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid project ID is required" },
      400,
      "project_flow.invalid_id",
    );
  const parsed = listProjectFlowQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid project flow page" },
      400,
      "project_flow.invalid_query",
    );
  try {
    const result = await getProjectFlowService().list(id, parsed.data);
    return jsonResponse(
      request,
      listProjectFlowResponseSchema.parse(result),
      200,
      "project_flow.list",
    );
  } catch (error) {
    return projectFlowFailure(request, error);
  }
}
