import {
  createLocalAgentProjectAssignmentRequestSchema,
  entityIdSchema,
  listLocalAgentProjectAssignmentsResponseSchema,
  listResourcesQuerySchema,
  localAgentProjectAssignmentSchema,
} from "@commandry/contracts";
import {
  getLocalAgentService,
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
  const modeFailure = localAgentModeFailure(request, "agent_projects.list");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid agent ID is required" },
      400,
      "agent_projects.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid assignment page query" },
      400,
      "agent_projects.invalid_query",
    );
  }
  try {
    const page = await getLocalAgentService().listProjects(id, parsed.data);
    return jsonResponse(
      request,
      listLocalAgentProjectAssignmentsResponseSchema.parse(page),
      200,
      "agent_projects.list",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_projects.list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "agent_projects.assign");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid agent ID is required" },
      400,
      "agent_projects.invalid_id",
    );
  }
  const parsed = createLocalAgentProjectAssignmentRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid project assignment" },
      400,
      "agent_projects.invalid_body",
    );
  }
  try {
    const assignment = await getLocalAgentService().assignProject(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      localAgentProjectAssignmentSchema.parse(assignment),
      201,
      "agent_projects.assign",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agent_projects.assign");
  }
}
