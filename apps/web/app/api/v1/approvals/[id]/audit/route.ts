import {
  entityIdSchema,
  listResourcesQuerySchema,
  listSimulatedApprovalAuditResponseSchema,
} from "@commandry/contracts";
import { localAgentModeFailure } from "../../../../../../lib/local-agents";
import {
  getSimulatedApprovalService,
  simulatedApprovalFailure,
} from "../../../../../../lib/simulated-approvals";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "approvals.audit");
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
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid approval audit page query" },
      400,
      "approvals.invalid_audit_query",
    );
  }
  try {
    const page = await (
      await getSimulatedApprovalService()
    ).listAudit(id, parsed.data);
    return jsonResponse(
      request,
      listSimulatedApprovalAuditResponseSchema.parse(page),
      200,
      "approvals.audit",
    );
  } catch (error) {
    return simulatedApprovalFailure(request, error, "approvals.audit");
  }
}
