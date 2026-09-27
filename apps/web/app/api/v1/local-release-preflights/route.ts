import { loadRuntimeConfig } from "@commandry/config";
import {
  listLocalReleasePreflightsQuerySchema,
  listLocalReleasePreflightsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalReleasePreflightService,
  localReleasePreflightFailure,
} from "../../../../lib/local-release-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listLocalReleasePreflightsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid local preflight query" },
      400,
      "local_release_preflights.invalid_query",
    );
  try {
    const page = await getLocalReleasePreflightService().list(query.data);
    return jsonResponse(
      request,
      listLocalReleasePreflightsResponseSchema.parse(page),
      200,
      "local_release_preflights.list",
    );
  } catch (error) {
    return localReleasePreflightFailure(
      request,
      "local_release_preflights.list",
      error,
    );
  }
}
