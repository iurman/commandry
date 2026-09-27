export class WorkDiscussionError extends Error {
  constructor(
    public readonly code: "WORK_NOT_FOUND" | "INVALID_COMMENT",
    message: string,
  ) {
    super(message);
    this.name = "WorkDiscussionError";
  }
}

export function normalizeWorkComment(body: string): string {
  const normalized = body.trim();
  if (!normalized || normalized.length > 5_000) {
    throw new WorkDiscussionError(
      "INVALID_COMMENT",
      "Comment must contain 1 to 5000 characters",
    );
  }
  return normalized;
}
