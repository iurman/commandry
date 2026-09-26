import { loadRuntimeConfig } from "@commandry/config";
import {
  changeWorkItemPlanningRequestSchema,
  entityIdSchema,
  workItemSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkPlanningService,
  workPlanningFailure,
} from "../../../../../../lib/work-planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
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
      "work_planning.invalid_id",
    );
  }
  const parsed = changeWorkItemPlanningRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid task planning change" },
      400,
      "work_planning.invalid_body",
    );
  }
  try {
    const item = await getWorkPlanningService().changePlanning(id, parsed.data);
    return jsonResponse(
      request,
      workItemSchema.parse(item),
      200,
      "work_planning.changed",
    );
  } catch (error) {
    return workPlanningFailure(request, error, "work_planning.change");
  }
}
