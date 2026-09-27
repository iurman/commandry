import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkRecurrenceAuditResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../../lib/http";
import {
  getWorkRecurrenceService,
  workRecurrenceFailure,
} from "../../../../../../../lib/work-recurrence";

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
      "work_recurrence_audit.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid recurrence audit page" },
      400,
      "work_recurrence_audit.invalid_query",
    );
  }
  try {
    const page = await getWorkRecurrenceService().listAudit(id, parsed.data);
    return jsonResponse(
      request,
      listWorkRecurrenceAuditResponseSchema.parse(page),
      200,
      "work_recurrence_audit.list",
    );
  } catch (error) {
    return workRecurrenceFailure(request, error, "work_recurrence_audit.list");
  }
}
