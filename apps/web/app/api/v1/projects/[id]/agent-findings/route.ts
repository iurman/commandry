import {
  entityIdSchema,
  listProjectAgentFindingsQuerySchema,
  listProjectAgentFindingsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getProjectAgentFindingsService,
  projectAgentFindingsFailure,
} from "../../../../../../lib/project-agent-findings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid project ID is required" },
      400,
      "project_agent_findings.invalid_id",
    );
  const parsed = listProjectAgentFindingsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid agent findings page" },
      400,
      "project_agent_findings.invalid_query",
    );
  try {
    const page = await getProjectAgentFindingsService().list(id, parsed.data);
    return jsonResponse(
      request,
      listProjectAgentFindingsResponseSchema.parse(page),
      200,
      "project_agent_findings.list",
    );
  } catch (error) {
    return projectAgentFindingsFailure(request, error);
  }
}
