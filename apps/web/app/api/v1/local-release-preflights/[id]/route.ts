import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  localReleasePreflightSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalReleasePreflightService,
  localReleasePreflightFailure,
} from "../../../../../lib/local-release-preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid preflight ID is required" },
      400,
      "local_release_preflight.invalid_id",
    );
  try {
    const evidence = await getLocalReleasePreflightService().get(id);
    if (!evidence)
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Local preflight evidence not found" },
        404,
        "local_release_preflight.not_found",
      );
    return jsonResponse(
      request,
      localReleasePreflightSchema.parse(evidence),
      200,
      "local_release_preflight.get",
    );
  } catch (error) {
    return localReleasePreflightFailure(
      request,
      "local_release_preflight.get",
      error,
    );
  }
}
