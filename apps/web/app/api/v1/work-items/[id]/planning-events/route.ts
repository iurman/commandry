import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkItemPlanningEventsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkPlanningService,
  workPlanningFailure,
} from "../../../../../../lib/work-planning";

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
      "work_planning_events.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid planning history page" },
      400,
      "work_planning_events.invalid_query",
    );
  }
  try {
    const page = await getWorkPlanningService().listPlanningEvents(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listWorkItemPlanningEventsResponseSchema.parse(page),
      200,
      "work_planning_events.list",
    );
  } catch (error) {
    return workPlanningFailure(request, error, "work_planning_events.list");
  }
}
