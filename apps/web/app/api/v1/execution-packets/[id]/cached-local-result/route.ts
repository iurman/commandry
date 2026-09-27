import {
  cachedLocalAgentResultQuerySchema,
  cachedLocalAgentResultResponseSchema,
  entityIdSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalAgentRoutingService,
  localAgentFailure,
  localAgentModeFailure,
} from "../../../../../../lib/local-agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "cached_local_result.get");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid packet ID is required" },
      400,
      "cached_local_result.invalid_id",
    );
  const parsed = cachedLocalAgentResultQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid cached result query" },
      400,
      "cached_local_result.invalid_query",
    );
  try {
    const page = await getLocalAgentRoutingService().getCachedResult(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      cachedLocalAgentResultResponseSchema.parse(page),
      200,
      "cached_local_result.get",
    );
  } catch (error) {
    return localAgentFailure(request, error, "cached_local_result.get");
  }
}
