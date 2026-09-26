import {
  entityIdSchema,
  simulatedApprovalDecisionRequestSchema,
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
  const modeFailure = localAgentModeFailure(request, "approvals.decide");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid approval ID is required" },
      400,
      "approvals.invalid_id",
    );
  }
  const parsed = simulatedApprovalDecisionRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid approval decision" },
      400,
      "approvals.invalid_body",
    );
  }
  try {
    const approval = await (
      await getSimulatedApprovalService()
    ).decide(id, parsed.data);
    return jsonResponse(
      request,
      simulatedApprovalSchema.parse(approval),
      200,
      "approvals.decide",
    );
  } catch (error) {
    return simulatedApprovalFailure(request, error, "approvals.decide");
  }
}
