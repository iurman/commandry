import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listResourcesQuerySchema,
  listWorkItemsResponseSchema,
} from "@commandry/contracts";
import {
  captureFailure,
  getCaptureService,
} from "../../../../../../lib/capture";
import { jsonResponse } from "../../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success) {
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid project ID is required" },
      400,
      "project_work.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid work page query" },
      400,
      "project_work.invalid_query",
    );
  }
  try {
    const page = await getCaptureService().listProjectWork(id, parsed.data);
    return jsonResponse(
      request,
      listWorkItemsResponseSchema.parse(page),
      200,
      "project_work.list",
    );
  } catch (error) {
    return captureFailure(request, error, "project_work.list");
  }
}
