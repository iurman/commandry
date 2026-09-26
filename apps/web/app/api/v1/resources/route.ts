import { loadRuntimeConfig } from "@commandry/config";
import {
  listResourcesQuerySchema,
  listResourcesResponseSchema,
} from "@commandry/contracts";
import { createResourceRepository } from "@commandry/db";
import { getDatabase } from "../../../../lib/database";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = listResourcesQuerySchema.safeParse(params);
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid resource page query" },
      400,
      "resources.invalid_query",
    );
  }
  try {
    const repository = createResourceRepository(getDatabase().db);
    const page = await repository.list({
      limit: parsed.data.limit,
      ...(parsed.data.cursor && { cursor: parsed.data.cursor }),
    });
    return jsonResponse(
      request,
      listResourcesResponseSchema.parse(page),
      200,
      "resources.list",
    );
  } catch {
    return jsonResponse(
      request,
      { code: "DATABASE_UNAVAILABLE", message: "Resources are unavailable" },
      503,
      "resources.unavailable",
    );
  }
}
