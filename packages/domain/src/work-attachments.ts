export class WorkAttachmentError extends Error {
  constructor(
    public readonly code:
      | "WORK_NOT_FOUND"
      | "DOCUMENT_NOT_FOUND"
      | "DOCUMENT_REQUIRED"
      | "CROSS_PROJECT"
      | "ATTACHMENT_EXISTS"
      | "ATTACHMENT_NOT_FOUND"
      | "ATTACHMENT_ARCHIVED",
    message: string,
  ) {
    super(message);
    this.name = "WorkAttachmentError";
  }
}
