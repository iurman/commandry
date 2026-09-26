import { createNotificationService } from "@commandry/application";
import { createNotificationRepository } from "@commandry/db";
import { NotificationError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

let service: ReturnType<typeof createNotificationService> | undefined;

export function getNotificationService() {
  service ??= createNotificationService(
    createNotificationRepository(getDatabase().db),
  );
  return service;
}

export function notificationFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof NotificationError) {
    const status =
      error.code === "NOTIFICATION_NOT_FOUND"
        ? 404
        : error.code === "NOTIFICATION_STALE"
          ? 409
          : 400;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Local notifications are unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
