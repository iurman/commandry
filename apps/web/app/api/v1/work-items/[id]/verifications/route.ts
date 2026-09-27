import { loadRuntimeConfig } from "@commandry/config";
import {
  createWorkItemVerificationRequestSchema,
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkItemVerificationsResponseSchema,
  workItemVerificationSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkAcceptanceService,
  workAcceptanceFailure,
} from "../../../../../../lib/work-acceptance";

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
      { code: "INVALID_ID", message: "A valid task ID is required" },
      400,
      "work_verifications.invalid_id",
    );
  const query = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid review page" },
      400,
      "work_verifications.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listWorkItemVerificationsResponseSchema.parse(
        await getWorkAcceptanceService().listVerifications(id, query.data),
      ),
      200,
      "work_verifications.list",
    );
  } catch (error) {
    return workAcceptanceFailure(request, error, "work_verifications.list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid task ID is required" },
      400,
      "work_verifications.invalid_id",
    );
  const input = createWorkItemVerificationRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid review record" },
      400,
      "work_verifications.invalid_body",
    );
  try {
    return jsonResponse(
      request,
      workItemVerificationSchema.parse(
        await getWorkAcceptanceService().recordVerification(id, input.data),
      ),
      201,
      "work_verifications.recorded",
    );
  } catch (error) {
    return workAcceptanceFailure(request, error, "work_verifications.record");
  }
}
