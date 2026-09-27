import { entityIdSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../../../../lib/http";
import {
  getLocalRunnerCallbackService,
  localRunnerCallbackFailure,
  localRunnerModeFailure,
} from "../../../../../../../../lib/local-runner-callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; eventId: string }> },
): Promise<Response> {
  const modeFailure = localRunnerModeFailure(
    request,
    "agent_callbacks.artifact",
  );
  if (modeFailure) return modeFailure;
  const { id, eventId } = await context.params;
  if (
    !entityIdSchema.safeParse(id).success ||
    !entityIdSchema.safeParse(eventId).success
  )
    return jsonResponse(
      request,
      {
        code: "INVALID_ID",
        message: "Valid run and artifact IDs are required",
      },
      400,
      "agent_callbacks.invalid_artifact_id",
    );
  try {
    const found = await getLocalRunnerCallbackService().getArtifact(
      id,
      eventId,
    );
    if (!found)
      return jsonResponse(
        request,
        { code: "NOT_FOUND", message: "Local runner artifact not found" },
        404,
        "agent_callbacks.artifact_not_found",
      );
    return new Response(found.content, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="synthetic-run-report.json"',
        "Content-Length": String(found.event.artifactBytes),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return localRunnerCallbackFailure(
      request,
      "agent_callbacks.artifact",
      error,
    );
  }
}
