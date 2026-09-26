import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listKnowledgeItemsResponseSchema,
  listResourcesQuerySchema,
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
      "project_knowledge.invalid_id",
    );
  }
  const parsed = listResourcesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid knowledge page query" },
      400,
      "project_knowledge.invalid_query",
    );
  }
  try {
    const page = await getCaptureService().listProjectKnowledge(
      id,
      parsed.data,
    );
    return jsonResponse(
      request,
      listKnowledgeItemsResponseSchema.parse(page),
      200,
      "project_knowledge.list",
    );
  } catch (error) {
    return captureFailure(request, error, "project_knowledge.list");
  }
}
