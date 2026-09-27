import { loadRuntimeConfig } from "@commandry/config";
import {
  entityIdSchema,
  listWorkItemAttachmentsQuerySchema,
  listWorkItemAttachmentsResponseSchema,
} from "@commandry/contracts";
import { jsonResponse } from "../../../../../../lib/http";
import {
  getWorkAttachmentService,
  workAttachmentFailure,
} from "../../../../../../lib/work-attachments";

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
      { code: "INVALID_ID", message: "A valid Knowledge ID is required" },
      400,
      "work_attachments.invalid_id",
    );
  const query = listWorkItemAttachmentsQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success)
    return jsonResponse(
      request,
      { code: "INVALID_QUERY", message: "Invalid attachment page" },
      400,
      "work_attachments.invalid_query",
    );
  try {
    return jsonResponse(
      request,
      listWorkItemAttachmentsResponseSchema.parse(
        await getWorkAttachmentService().listForKnowledge(id, query.data),
      ),
      200,
      "work_attachments.inverse_list",
    );
  } catch (error) {
    return workAttachmentFailure(
      request,
      error,
      "work_attachments.inverse_list",
    );
  }
}
