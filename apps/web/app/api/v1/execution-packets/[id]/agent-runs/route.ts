import {
  createLocalAgentRunRequestSchema,
  entityIdSchema,
  localAgentRunSchema,
} from "@commandry/contracts";
import {
  getLocalAgentRunService,
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
  const modeFailure = localAgentModeFailure(request, "agent_runs.submit");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid packet ID is required" },
      400,
      "agent_runs.invalid_packet_id",
    );
  }
  const parsed = createLocalAgentRunRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local run request" },
      400,
      "agent_runs.invalid_body",
    );
  }
  try {
    const run = await (await getLocalAgentRunService()).submit(id, parsed.data);
    return jsonResponse(
      request,
      localAgentRunSchema.parse(run),
      202,
      "agent_runs.submit",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_runs.submit");
  }
}
