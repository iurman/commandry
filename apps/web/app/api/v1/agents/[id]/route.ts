import { entityIdSchema, localAgentProfileSchema } from "@commandry/contracts";
import {
  getLocalAgentService,
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
  const modeFailure = localAgentModeFailure(request, "agents.read");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid agent ID is required" },
      400,
      "agents.invalid_id",
    );
  }
  try {
    const agent = await getLocalAgentService().getById(id);
    return agent
      ? jsonResponse(
          request,
          localAgentProfileSchema.parse(agent),
          200,
          "agents.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Local agent not found" },
          404,
          "agents.not_found",
        );
  } catch (error) {
    return localAgentFailure(request, error, "agents.read");
  }
}
