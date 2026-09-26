export type WorkPriority = "low" | "normal" | "high" | null;

export class WorkPlanningError extends Error {
  constructor(
    public readonly code: "WORK_ITEM_NOT_FOUND" | "PLANNING_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export function requireWorkPlanningChange(
  current: {
    updatedAt: string;
    priority: WorkPriority;
    dueOn: string | null;
  },
  input: {
    expectedUpdatedAt: string;
    priority: WorkPriority;
    dueOn: string | null;
  },
): void {
  if (
    current.updatedAt !== input.expectedUpdatedAt ||
    (current.priority === input.priority && current.dueOn === input.dueOn)
  ) {
    throw new WorkPlanningError(
      "PLANNING_CONFLICT",
      "Task planning changed or is already set; refresh before saving again",
    );
  }
}

export function workDueLabel(
  dueOn: string | null,
  status: "open" | "done",
  utcToday: string,
): "overdue" | "today" | "upcoming" | "none" {
  if (!dueOn || status === "done") return "none";
  if (dueOn < utcToday) return "overdue";
  return dueOn === utcToday ? "today" : "upcoming";
}
