import {
  entityIdSchema,
  listResourcesQuerySchema,
  localAgentRoutingResponseSchema,
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
  const modeFailure = localAgentModeFailure(request, "agent_routing.list");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid packet ID is required" },
      400,
      "agent_routing.invalid_id",
    );
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid routing page" },
      400,
      "agent_routing.invalid_query",
    );
  try {
    const page = await getLocalAgentRoutingService().listCandidates(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      localAgentRoutingResponseSchema.parse(page),
      200,
      "agent_routing.list",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_routing.list");
  }
}
