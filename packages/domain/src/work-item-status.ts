export type WorkItemStatus = "open" | "done";

export class WorkItemStatusError extends Error {
  constructor(
    public readonly code:
      "WORK_ITEM_NOT_FOUND" | "STATUS_CONFLICT" | "ACCEPTANCE_UNMET",
    message: string,
  ) {
    super(message);
  }
}

export function requireWorkItemStatusChange(
  current: WorkItemStatus,
  expected: WorkItemStatus,
  next: WorkItemStatus,
): void {
  if (current !== expected || current === next) {
    throw new WorkItemStatusError(
      "STATUS_CONFLICT",
      "Work item status changed; refresh before deciding again",
    );
  }
}
