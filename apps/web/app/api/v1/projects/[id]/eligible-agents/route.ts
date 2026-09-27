import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listProjectEligibleAgentsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import { localAgentModeFailure } from "../../../../../../lib/local-agents";
import {
  getWorkAssignmentService,
  workAssignmentFailure,
} from "../../../../../../lib/work-assignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const modeFailure = localAgentModeFailure(request, "eligible_agents.list");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid project ID is required" },
      400,
      "eligible_agents.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid agent page" },
      400,
      "eligible_agents.invalid_query",
    );
  }
  try {
    const page = await getWorkAssignmentService().listEligibleAgents(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listProjectEligibleAgentsResponseSchema.parse(page),
      200,
      "eligible_agents.list",
    );
  } catch (error) {
    return workAssignmentFailure(request, error, "eligible_agents.list");
  }
}
