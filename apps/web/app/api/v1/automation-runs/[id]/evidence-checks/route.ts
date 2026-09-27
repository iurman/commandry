import {
  entityIdSchema,
  automationEvidenceCheckSchema,
  listAutomationEvidenceChecksResponseSchema,
  listResourcesQuerySchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getAutomationReviewService,
  localAutomationFailure,
} from "../../../../../../lib/local-automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid run ID" },
      400,
      "automation_evidence.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid check page query" },
      400,
      "automation_evidence.invalid_query",
    );
  try {
    const page = await getAutomationReviewService().listChecks(id, query.data);
    return jsonResponse(
      request,
      listAutomationEvidenceChecksResponseSchema.parse(page),
      200,
      "automation_evidence.list",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_evidence.list");
  }
}

export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "Invalid run ID" },
      400,
      "automation_evidence.invalid_id",
    );
  try {
    const check = await getAutomationReviewService().checkEvidence(id);
    return jsonResponse(
      request,
      automationEvidenceCheckSchema.parse(check),
      201,
      "automation_evidence.checked",
    );
  } catch (error) {
    return localAutomationFailure(request, error, "automation_evidence.check");
  }
}
