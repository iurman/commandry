import { loadRuntimeConfig } from "@commandry/config";
import {
  changeNotificationStateRequestSchema,
  notificationSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getNotificationService,
  notificationFailure,
} from "../../../../../../lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
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
  const parsed = changeNotificationStateRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid notification state change" },
      400,
      "notifications.invalid_body",
    );
  try {
    const item = await getNotificationService().changeState(id, parsed.data);
    return jsonResponse(
      request,
      notificationSchema.parse(item),
      200,
      "notifications.state_changed",
    );
  } catch (error) {
    return notificationFailure(request, error, "notifications.state_change");
  }
}
