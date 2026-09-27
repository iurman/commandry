import { entityIdSchema, localAgentRunSchema } from "@commandry/contracts";
import {
  getLocalAgentRunControlService,
  localAgentFailure,
  localAgentModeFailure,
} from "../../../../../../lib/local-agents";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "agent_runs.cancel");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid run ID is required" },
      400,
      "agent_runs.invalid_id",
    );
  }
  try {
    const run = await getLocalAgentRunControlService().cancel(id);
    return jsonResponse(
      request,
      localAgentRunSchema.parse(run),
      200,
      "agent_runs.canceled",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_runs.cancel");
  }
}
