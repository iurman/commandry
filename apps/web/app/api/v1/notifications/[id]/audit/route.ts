import { loadRuntimeConfig } from "@commandry/config";
import {
  listNotificationAuditResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getNotificationService,
  notificationFailure,
} from "../../../../../../lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (id.length > 120 || id.length === 0)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid notification ID" },
      400,
      "notifications.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid audit query" },
      400,
      "notifications.invalid_audit_query",
    );
  try {
    const page = await getNotificationService().listAudit(id, query.data);
    return jsonResponse(
      request,
      listNotificationAuditResponseSchema.parse(page),
      200,
      "notifications.audit_list",
    );
  } catch (error) {
    return notificationFailure(request, error, "notifications.audit_list");
  }
}
