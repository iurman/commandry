import { loadRuntimeConfig } from "@commandry/config";
import {
  changeWorkItemStatusRequestSchema,
  entityIdSchema,
  workItemSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkItemStatusService,
  workItemStatusFailure,
} from "../../../../../../lib/work-item-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
      "work_items.invalid_id",
    );
  }
  const parsed = changeWorkItemStatusRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid work item status change" },
      400,
      "work_items.invalid_status_body",
    );
  }
  try {
    const item = await getWorkItemStatusService().changeStatus(id, parsed.data);
    return jsonResponse(
      request,
      workItemSchema.parse(item),
      200,
      "work_items.status_changed",
    );
  } catch (error) {
    return workItemStatusFailure(request, error, "work_items.status_change");
  }
}
