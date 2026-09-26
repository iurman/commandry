import { entityIdSchema, localAgentRunSchema } from "@commandry/contracts";
import {
  getLocalAgentRunService,
  localAgentFailure,
  localAgentModeFailure,
} from "../../../../../lib/local-agents";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "agent_runs.read");
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
    const run = await (await getLocalAgentRunService()).getById(id);
    return run
      ? jsonResponse(
          request,
          localAgentRunSchema.parse(run),
          200,
          "agent_runs.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Local agent run not found" },
          404,
          "agent_runs.not_found",
        );
  } catch (error) {
    return localAgentFailure(request, error, "agent_runs.read");
  }
}
