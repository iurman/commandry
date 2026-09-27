import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  workItemAssignmentEventSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getWorkAssignmentService,
  workAssignmentFailure,
} from "../../../../../lib/work-assignment";

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
      {
        code: "INVALID_ID",
        message: "A valid assignment event ID is required",
      },
      400,
      "work_assignment_event.invalid_id",
    );
  }
  try {
    const event = await getWorkAssignmentService().getAssignmentEventById(id);
    if (!event) {
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Assignment event not found" },
        404,
        "work_assignment_event.not_found",
      );
    }
    return jsonResponse(
      request,
      workItemAssignmentEventSchema.parse(event),
      200,
      "work_assignment_event.get",
    );
  } catch (error) {
    return workAssignmentFailure(request, error, "work_assignment_event.get");
  }
}
