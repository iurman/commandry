import { loadRuntimeConfig } from "@commandry/config";
import { automationRunSchema, entityIdSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getLocalAutomationService,
  localAutomationFailure,
} from "../../../../../lib/local-automations";

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
      "automation_runs.invalid_id",
    );
  try {
    const run = await (await getLocalAutomationService()).getRun(id);
    return run
      ? jsonResponse(
          request,
          automationRunSchema.parse(run),
          200,
          "automation_runs.read",
        )
      : jsonResponse(
          request,
          {
            code: "AUTOMATION_RUN_NOT_FOUND",
            message: "Automation run not found",
          },
          404,
          "automation_runs.not_found",
        );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_runs.read");
  }
}
