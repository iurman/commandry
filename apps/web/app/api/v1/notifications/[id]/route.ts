import { loadRuntimeConfig } from "@commandry/config";
import { notificationSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getNotificationService,
  notificationFailure,
} from "../../../../../lib/notifications";

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
  try {
    const item = await getNotificationService().getById(id);
    if (!item)
      return jsonResponse(
        request,
        {
          code: "NOTIFICATION_NOT_FOUND",
          message: "Notification is no longer current",
        },
        404,
        "notifications.not_found",
      );
    return jsonResponse(
      request,
      notificationSchema.parse(item),
      200,
      "notifications.get",
    );
  } catch (error) {
    return notificationFailure(request, error, "notifications.get");
  }
}
