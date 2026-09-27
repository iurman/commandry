import { ZodError } from "zod";
import {
  entityIdSchema,
  listLocalAgentCallbacksQuerySchema,
  listLocalAgentCallbacksResponseSchema,
  localAgentCallbackEventSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalRunnerCallbackService,
  localRunnerCallbackFailure,
  localRunnerModeFailure,
  localRunnerRunExists,
} from "../../../../../../lib/local-runner-callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localRunnerModeFailure(request, "agent_callbacks.list");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid run ID is required" },
      400,
      "agent_callbacks.invalid_id",
    );
  const query = listLocalAgentCallbacksQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid callback page query" },
      400,
      "agent_callbacks.invalid_query",
    );
  try {
    if (!(await localRunnerRunExists(id)))
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Local agent run not found" },
        404,
        "agent_callbacks.run_not_found",
      );
    const page = await getLocalRunnerCallbackService().list(id, query.data);
    return jsonResponse(
      request,
      listLocalAgentCallbacksResponseSchema.parse(page),
      200,
      "agent_callbacks.list",
    );
  } catch (error) {
    return localRunnerCallbackFailure(request, "agent_callbacks.list", error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const modeFailure = localRunnerModeFailure(request, "agent_callbacks.report");
  if (modeFailure) return modeFailure;
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid run ID is required" },
      400,
      "agent_callbacks.invalid_id",
    );
  const bearer = /^Bearer ([0-9a-f]{64})$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  if (!bearer)
    return jsonResponse(
      request,
      { code: "CALLBACK_AUTH_DENIED", message: "A callback token is required" },
      403,
      "agent_callbacks.auth_denied",
    );
  try {
    const event = await getLocalRunnerCallbackService().report(
      id,
      bearer,
      await request.json().catch(() => undefined),
    );
    return jsonResponse(
      request,
      localAgentCallbackEventSchema.parse(event),
      201,
      "agent_callbacks.report",
    );
  } catch (error) {
    if (error instanceof ZodError)
      return jsonResponse(
        request,
        { code: "INVALID_BODY", message: "Invalid callback payload" },
        400,
        "agent_callbacks.invalid_body",
      );
    return localRunnerCallbackFailure(request, "agent_callbacks.report", error);
  }
}
