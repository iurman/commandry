import {
  createSimulatedActionRequestSchema,
  entityIdSchema,
  simulatedApprovalSchema,
} from "@commandry/contracts";
import { localAgentModeFailure } from "../../../../../../lib/local-agents";
import {
  getSimulatedApprovalService,
  simulatedApprovalFailure,
} from "../../../../../../lib/simulated-approvals";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(
    request,
    "simulated_actions.propose",
  );
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid run ID is required" },
      400,
      "simulated_actions.invalid_run_id",
    );
  }
  const parsed = createSimulatedActionRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid simulated action proposal" },
      400,
      "simulated_actions.invalid_body",
    );
  }
  try {
    const approval = await (
      await getSimulatedApprovalService()
    ).propose(id, parsed.data);
    return jsonResponse(
      request,
      simulatedApprovalSchema.parse(approval),
      201,
      "simulated_actions.propose",
    );
  } catch (error) {
    return simulatedApprovalFailure(
      request,
      error,
      "simulated_actions.propose",
    );
  }
}
