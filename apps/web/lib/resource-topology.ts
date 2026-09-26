import { createResourceTopologyService } from "@commandry/application";
import { createResourceTopologyRepository } from "@commandry/db";
import { ResourceTopologyError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getResourceTopologyService() {
  return createResourceTopologyService(
    createResourceTopologyRepository(getDatabase().db),
  );
}

export function resourceTopologyFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof ResourceTopologyError) {
    const status =
      error.code === "RESOURCE_NOT_FOUND" || error.code === "PARENT_NOT_FOUND"
        ? 404
        : error.code === "DEPENDENCY_SELF"
          ? 400
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
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Resource topology is unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
