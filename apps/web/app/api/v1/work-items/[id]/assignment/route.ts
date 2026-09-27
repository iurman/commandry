import { loadRuntimeConfig } from "@commandry/config";
import {
  changeWorkAssignmentRequestSchema,
  entityIdSchema,
  workItemSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import { localAgentModeFailure } from "../../../../../../lib/local-agents";
import {
  getWorkAssignmentService,
  workAssignmentFailure,
} from "../../../../../../lib/work-assignment";

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
      "work_assignment.invalid_id",
    );
  }
  const parsed = changeWorkAssignmentRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid Work assignment change" },
      400,
      "work_assignment.invalid_body",
    );
  }
  if (parsed.data.assigneeKind === "agent") {
    const modeFailure = localAgentModeFailure(
      request,
      "work_assignment.change",
    );
    if (modeFailure) return modeFailure;
  }
  try {
    const item = await getWorkAssignmentService().changeAssignment(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      workItemSchema.parse(item),
      200,
      "work_assignment.changed",
    );
  } catch (error) {
    return workAssignmentFailure(request, error, "work_assignment.change");
  }
}
