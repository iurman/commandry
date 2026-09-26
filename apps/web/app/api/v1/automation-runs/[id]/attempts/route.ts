import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listAutomationRunAttemptsResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalAutomationService,
  localAutomationFailure,
} from "../../../../../../lib/local-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid run ID" },
      400,
      "automation_attempts.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid attempt page query" },
      400,
      "automation_attempts.invalid_query",
    );
  try {
    const page = await (
      await getLocalAutomationService()
    ).listAttempts(id, query.data);
    return jsonResponse(
      request,
      listAutomationRunAttemptsResponseSchema.parse(page),
      200,
      "automation_attempts.list",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_attempts.list");
  }
}
