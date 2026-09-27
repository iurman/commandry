import { loadRuntimeConfig } from "@commandry/config";
import { entityIdSchema, workItemAttachmentSchema } from "@commandry/contracts";
import { jsonResponse } from "../../../../../lib/http";
import {
  getWorkAttachmentService,
  workAttachmentFailure,
} from "../../../../../lib/work-attachments";

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
      { code: "INVALID_ID", message: "A valid attachment ID is required" },
      400,
      "work_attachments.invalid_id",
    );
  try {
    const attachment = await getWorkAttachmentService().getById(id);
    return attachment
      ? jsonResponse(
          request,
          workItemAttachmentSchema.parse(attachment),
          200,
          "work_attachments.read",
        )
      : jsonResponse(
          request,
          { code: "NOT_FOUND", message: "Task attachment not found" },
          404,
          "work_attachments.not_found",
        );
  } catch (error) {
    return workAttachmentFailure(request, error, "work_attachments.read");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  loadRuntimeConfig();
  const { id } = await context.params;
  if (!entityIdSchema.safeParse(id).success)
    return jsonResponse(
      request,
      { code: "INVALID_ID", message: "A valid attachment ID is required" },
      400,
      "work_attachments.invalid_id",
    );
  try {
    return jsonResponse(
      request,
      workItemAttachmentSchema.parse(
        await getWorkAttachmentService().archive(id),
      ),
      200,
      "work_attachments.archived",
    );
  } catch (error) {
    return workAttachmentFailure(request, error, "work_attachments.archive");
  }
}
