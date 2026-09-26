import {
  createLocalAgentRequestSchema,
  listLocalAgentsResponseSchema,
  listResourcesQuerySchema,
  localAgentProfileSchema,
} from "@commandry/contracts";
import {
  getLocalAgentService,
  localAgentFailure,
  localAgentModeFailure,
} from "../../../../lib/local-agents";
import { jsonResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "agents.list");
  if (modeFailure) return modeFailure;
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid agent page query" },
      400,
      "agents.invalid_query",
    );
  }
  try {
    const page = await getLocalAgentService().list(parsed.data);
    return jsonResponse(
      request,
      listLocalAgentsResponseSchema.parse(page),
      200,
      "agents.list",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agents.list");
  }
}

export async function POST(request: Request): Promise<Response> {
  const modeFailure = localAgentModeFailure(request, "agents.create");
  if (modeFailure) return modeFailure;
  const parsed = createLocalAgentRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local agent profile" },
      400,
      "agents.invalid_body",
    );
  }
  try {
    const agent = await getLocalAgentService().create(parsed.data);
    return jsonResponse(
      request,
      localAgentProfileSchema.parse(agent),
      201,
      "agents.create",
    );
  } catch (error) {
    return localAgentFailure(request, error, "agents.create");
  }
}
