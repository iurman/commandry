import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  localReleaseRehearsalSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalReleaseRehearsalService,
  localReleaseFailure,
} from "../../../../../lib/local-release-rehearsal";

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
      {
        code: "INVALID_ID",
        message: "A valid release rehearsal ID is required",
      },
      400,
      "local_release_rehearsal.invalid_id",
    );
  try {
    const evidence = await getLocalReleaseRehearsalService().get(id);
    if (!evidence)
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Local release evidence not found" },
        404,
        "local_release_rehearsal.not_found",
      );
    return jsonResponse(
      request,
      localReleaseRehearsalSchema.parse(evidence),
      200,
      "local_release_rehearsal.get",
    );
  } catch (error) {
    return localReleaseFailure(request, "local_release_rehearsal.get", error);
  }
}
