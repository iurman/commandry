import { loadRuntimeConfig } from "@commandry/config";
import {
  automationRunSchema,
  entityIdSchema,
  listAutomationRunsResponseSchema,
  listResourcesQuerySchema,
  triggerAutomationRunRequestSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getLocalAutomationService,
  localAutomationFailure,
} from "../../../../../../lib/local-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid automation ID" },
      400,
      "automation_runs.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid run page query" },
      400,
      "automation_runs.invalid_query",
    );
  try {
    const page = await (
      await getLocalAutomationService()
    ).listRuns(id, query.data);
    return jsonResponse(
      request,
      listAutomationRunsResponseSchema.parse(page),
      200,
      "automation_runs.list",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_runs.list");
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid automation ID" },
      400,
      "automation_runs.invalid_id",
    );
  const parsed = triggerAutomationRunRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid local run occurrence" },
      400,
      "automation_runs.invalid_body",
    );
  try {
    const run = await (
      await getLocalAutomationService()
    ).triggerRun(id, parsed.data);
    return jsonResponse(
      request,
      automationRunSchema.parse(run),
      202,
      "automation_runs.queued",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_runs.queue");
  }
}
