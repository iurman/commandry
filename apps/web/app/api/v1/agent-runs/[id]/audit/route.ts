import {
  entityIdSchema,
  listAgentRunAuditResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import {
  getAgentContextService,
  localAgentFailure,
  localAgentModeFailure,
} from "../../../../../../lib/local-agents";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "agent_runs.audit");
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
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid audit page query" },
      400,
      "agent_runs.invalid_audit_query",
    );
  }
  try {
    const page = await getAgentContextService().listAudit(id, parsed.data);
    return jsonResponse(
      request,
      listAgentRunAuditResponseSchema.parse(page),
      200,
      "agent_runs.audit",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_runs.audit");
  }
}
