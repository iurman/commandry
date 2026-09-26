import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listAutomationAuditResponseSchema,
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
      { code: "INVALID_ID", message: "Invalid automation ID" },
      400,
      "automation_audit.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid audit page query" },
      400,
      "automation_audit.invalid_query",
    );
  try {
    const page = await (
      await getLocalAutomationService()
    ).listAudit(id, query.data);
    return jsonResponse(
      request,
      listAutomationAuditResponseSchema.parse(page),
      200,
      "automation_audit.list",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_audit.list");
  }
}
