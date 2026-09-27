import { createWorkAttachmentService } from "@commandry/application";
import { createWorkAttachmentRepository } from "@commandry/db";
import { WorkAttachmentError } from "@commandry/domain";
import { getDatabase } from "./database";
import { jsonResponse } from "./http";

export function getWorkAttachmentService() {
  return createWorkAttachmentService(
    createWorkAttachmentRepository(getDatabase().db),
  );
}

export function workAttachmentFailure(
  request: Request,
  error: unknown,
  operation: string,
) {
  if (error instanceof WorkAttachmentError) {
    const status = [
      "WORK_NOT_FOUND",
      "DOCUMENT_NOT_FOUND",
      "ATTACHMENT_NOT_FOUND",
    ].includes(error.code)
      ? 404
      : error.code === "DOCUMENT_REQUIRED"
        ? 400
        : 409;
    return jsonResponse(
      request,
      { code: error.code, message: error.message },
      status,
      `${operation}.rejected`,
    );
  }
  return jsonResponse(
    request,
    {
      code: "DATABASE_UNAVAILABLE",
      message: "Task attachments are unavailable",
    },
    503,
    `${operation}.unavailable`,
  );
}
