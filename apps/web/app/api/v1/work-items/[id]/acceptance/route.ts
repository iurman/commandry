import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  saveWorkItemAcceptanceRequestSchema,
  workItemAcceptanceSchema,
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
      "work_acceptance.invalid_id",
    );
  try {
    return jsonResponse(
      request,
      workItemAcceptanceSchema.parse(await getWorkAcceptanceService().get(id)),
      200,
      "work_acceptance.get",
    );
  } catch (error) {
    return workAcceptanceFailure(request, error, "work_acceptance.get");
  }
}

export async function PUT(
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
      "work_acceptance.invalid_id",
    );
  const input = saveWorkItemAcceptanceRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "Invalid acceptance criteria" },
      400,
      "work_acceptance.invalid_body",
    );
  try {
    return jsonResponse(
      request,
      workItemAcceptanceSchema.parse(
        await getWorkAcceptanceService().save(id, input.data),
      ),
      200,
      "work_acceptance.saved",
    );
  } catch (error) {
    return workAcceptanceFailure(request, error, "work_acceptance.save");
  }
}
