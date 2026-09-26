import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkItemStatusEventsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkItemStatusService,
  workItemStatusFailure,
} from "../../../../../../lib/work-item-status";

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
      "work_items.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid status history page query" },
      400,
      "work_items.invalid_status_query",
    );
  }
  try {
    const events = await getWorkItemStatusService().listStatusEvents(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listWorkItemStatusEventsResponseSchema.parse(events),
      200,
      "work_items.status_history",
    );
  } catch (error) {
    return workItemStatusFailure(request, error, "work_items.status_history");
  }
}
