import { entityIdSchema, simulatedApprovalSchema } from "@commandry/contracts";
import { localAgentModeFailure } from "../../../../../lib/local-agents";
import {
  getSimulatedApprovalService,
  simulatedApprovalFailure,
} from "../../../../../lib/simulated-approvals";
import { jsonResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "approvals.get");
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
  try {
    const approval = await (await getSimulatedApprovalService()).getById(id);
    return jsonResponse(
      request,
      simulatedApprovalSchema.parse(approval),
      200,
      "approvals.get",
    );
  } catch (error) {
    return simulatedApprovalFailure(request, error, "approvals.get");
  }
}
