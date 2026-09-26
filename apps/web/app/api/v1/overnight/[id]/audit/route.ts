import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listOvernightQueueAuditResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getOvernightQueueService,
  overnightQueueFailure,
} from "../../../../../../lib/overnight-queue";

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
      { code: "INVALID_ID", message: "Valid queue entry ID required" },
      400,
      "overnight.audit.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid audit page query" },
      400,
      "overnight.audit.invalid_query",
    );
  try {
    const service = await getOvernightQueueService();
    if (!(await service.getById(id)))
      return jsonResponse(
        request,
        { code: "ENTRY_NOT_FOUND", message: "Overnight entry not found" },
        404,
        "overnight.audit.not_found",
      );
    const page = await service.listAudit(id, query.data);
    return jsonResponse(
      request,
      listOvernightQueueAuditResponseSchema.parse(page),
      200,
      "overnight.audit",
    );
  } catch (error) {
    return overnightQueueFailure(request, error, "overnight.audit");
  }
}
