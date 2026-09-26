import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, workItemSchema } from "@commandry/contracts";
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
      { code: "INVALID_ID", message: "A valid work item ID is required" },
      400,
      "work_items.invalid_id",
    );
  }
  try {
    const item = await getRecordDetailRepository().getWorkItemById(id);
    return item
      ? jsonResponse(
          request,
          workItemSchema.parse(item),
          200,
          "work_items.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Work item not found" },
          404,
          "work_items.not_found",
        );
  } catch (error) {
    return briefFailure(request, error, "work_items.read");
  }
}
