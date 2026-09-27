export class WorkAcceptanceError extends Error {
  constructor(
    public readonly code:
      | "WORK_NOT_FOUND"
      | "ACCEPTANCE_CONFLICT"
      | "ACCEPTANCE_REQUIRED"
      | "ATTACHMENT_NOT_FOUND"
      | "ATTACHMENT_SCOPE"
      | "WORK_MUST_BE_OPEN",
    message: string,
  ) {
    super(message);
  }
}
