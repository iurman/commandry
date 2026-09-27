import { createSavedViewService } from "@commandry/application";
import { createSavedViewRepository } from "@commandry/db";
import { SavedViewError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getSavedViewService() {
  return createSavedViewService(createSavedViewRepository(getDatabase().db));
}

export function savedViewFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof SavedViewError) {
    const status =
      error.code === "SAVED_VIEW_NOT_FOUND" ||
      error.code === "PROJECT_NOT_FOUND"
        ? 404
        : 409;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Saved views are unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
