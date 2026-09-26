import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, knowledgeItemSchema } from "@commandry/contracts";
import {
  briefFailure,
  getRecordDetailRepository,
} from "../../../../../lib/briefs";
import { jsonResponse } from "../../../../../lib/http";

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
      { code: "INVALID_ID", message: "A valid knowledge item ID is required" },
      400,
      "knowledge_items.invalid_id",
    );
  }
  try {
    const item = await getRecordDetailRepository().getKnowledgeItemById(id);
    return item
      ? jsonResponse(
          request,
          knowledgeItemSchema.parse(item),
          200,
          "knowledge_items.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Knowledge item not found" },
          404,
          "knowledge_items.not_found",
        );
  } catch (error) {
    return briefFailure(request, error, "knowledge_items.read");
  }
}
