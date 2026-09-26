import { loadRuntimeConfig } from "@commandry/config";
import {
  listNotificationsQuerySchema,
  listNotificationsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getNotificationService,
  notificationFailure,
} from "../../../../lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listNotificationsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid notification query" },
      400,
      "notifications.invalid_query",
    );
  try {
    const page = await getNotificationService().list(query.data);
    return jsonResponse(
      request,
      listNotificationsResponseSchema.parse(page),
      200,
      "notifications.list",
    );
  } catch (error) {
    return notificationFailure(request, error, "notifications.list");
  }
}
