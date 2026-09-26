import {
  agentContextReadRequestSchema,
  agentContextReadResponseSchema,
  entityIdSchema,
} from "@commandry/contracts";
import {
  getAgentContextService,
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
  const modeFailure = localAgentModeFailure(request, "agent_context.read");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid run ID is required" },
      400,
      "agent_context.invalid_run_id",
    );
  }
  const parsed = agentContextReadRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid scoped context request" },
      400,
      "agent_context.invalid_body",
    );
  }
  try {
    const read = await getAgentContextService().read(
      id,
      parsed.data,
      "manual-local-reviewer",
    );
    return jsonResponse(
      request,
      agentContextReadResponseSchema.parse(read),
      200,
      "agent_context.read",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_context.read");
  }
}
