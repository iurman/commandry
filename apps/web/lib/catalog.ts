import { CatalogError, createCatalogService } from "@commandry/application";
import { createCatalogRepository } from "@commandry/db";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getCatalogService() {
  return createCatalogService(createCatalogRepository(getDatabase().db));
}

export function catalogFailure(
  request: Request,
  error: unknown,
  operation: string,
): Response {
  if (error instanceof CatalogError) {
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      error.code === "LINK_EXISTS" || error.code === "PROJECT_VERSION_CONFLICT"
        ? 409
        : 404,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    { code: "DATABASE_UNAVAILABLE", message: "Catalog is unavailable" },
    503,
    `${operation}.unavailable`,
  );
}
