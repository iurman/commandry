import { loadRuntimeConfig } from "@commandry/config";
import {
  listLocalReleaseRehearsalsQuerySchema,
  listLocalReleaseRehearsalsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../lib/http";
import {
  getLocalReleaseRehearsalService,
  localReleaseFailure,
} from "../../../../lib/local-release-rehearsal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  loadRuntimeConfig();
  const query = listLocalReleaseRehearsalsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid local release query" },
      400,
      "local_release_rehearsals.invalid_query",
    );
  try {
    const page = await getLocalReleaseRehearsalService().list(query.data);
    return jsonResponse(
      request,
      listLocalReleaseRehearsalsResponseSchema.parse(page),
      200,
      "local_release_rehearsals.list",
    );
  } catch (error) {
    return localReleaseFailure(request, "local_release_rehearsals.list", error);
  }
}
