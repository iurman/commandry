import {
  listSimulatedApprovalsQuerySchema,
  listSimulatedApprovalsResponseSchema,
} from "@commandry/contracts";
import { localAgentModeFailure } from "../../../../lib/local-agents";
import {
  getSimulatedApprovalService,
  simulatedApprovalFailure,
} from "../../../../lib/simulated-approvals";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "approvals.list");
  if (modeFailure) return modeFailure;
  const parsed = listSimulatedApprovalsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid approval page query" },
      400,
      "approvals.invalid_query",
    );
  }
  try {
    const page = await (await getSimulatedApprovalService()).list(parsed.data);
    return jsonResponse(
      request,
      listSimulatedApprovalsResponseSchema.parse(page),
      200,
      "approvals.list",
    );
  } catch (error) {
    return simulatedApprovalFailure(request, error, "approvals.list");
  }
}
