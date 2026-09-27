import { loadRuntimeConfig } from "@commandry/config";
import {
  createWorkItemAttachmentRequestSchema,
  entityIdSchema,
  listWorkItemAttachmentsQuerySchema,
  listWorkItemAttachmentsResponseSchema,
  workItemAttachmentSchema,
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
      { code: "INVALID_ID", message: "A valid task ID is required" },
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
        await getWorkAttachmentService().listForWork(id, query.data),
      ),
      200,
      "work_attachments.list",
    );
  } catch (error) {
    return workAttachmentFailure(request, error, "work_attachments.list");
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
      "work_attachments.invalid_id",
    );
  const input = createWorkItemAttachmentRequestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!input.success)
    return jsonResponse(
      request,
      { code: "INVALID_BODY", message: "A Knowledge document ID is required" },
      400,
      "work_attachments.invalid_body",
    );
  try {
    return jsonResponse(
      request,
      workItemAttachmentSchema.parse(
        await getWorkAttachmentService().create(id, input.data.knowledgeItemId),
      ),
      201,
      "work_attachments.created",
    );
  } catch (error) {
    return workAttachmentFailure(request, error, "work_attachments.create");
  }
}
