import {
  automationExportPageSchema,
  entityIdSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getAutomationReviewService,
  localAutomationFailure,
} from "../../../../../../lib/local-automations";

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
      { code: "INVALID_ID", message: "Invalid automation ID" },
      400,
      "automation_export.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid export page query" },
      400,
      "automation_export.invalid_query",
    );
  try {
    const page = await getAutomationReviewService().exportPage(id, query.data);
    return jsonResponse(
      request,
      automationExportPageSchema.parse(page),
      200,
      "automation_export.page",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_export.page");
  }
}
