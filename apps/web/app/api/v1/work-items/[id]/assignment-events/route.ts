import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkAssignmentEventsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkAssignmentService,
  workAssignmentFailure,
} from "../../../../../../lib/work-assignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid work item ID is required" },
      400,
      "work_assignment_events.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid assignment event page" },
      400,
      "work_assignment_events.invalid_query",
    );
  }
  try {
    const page = await getWorkAssignmentService().listAssignmentEvents(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listWorkAssignmentEventsResponseSchema.parse(page),
      200,
      "work_assignment_events.list",
    );
  } catch (error) {
    return workAssignmentFailure(request, error, "work_assignment_events.list");
  }
}
