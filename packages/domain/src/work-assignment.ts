export type WorkAssigneeKind = "unassigned" | "local_user" | "agent";

export class WorkAssignmentError extends Error {
  constructor(
    public readonly code:
      | "WORK_ITEM_NOT_FOUND"
      | "PROJECT_NOT_FOUND"
      | "ASSIGNMENT_INVALID"
      | "ASSIGNMENT_CONFLICT"
      | "AGENT_NOT_IN_PROJECT",
    message: string,
  ) {
    super(message);
  }
}

export function requireWorkAssignmentChange(
  current: {
    updatedAt: string;
    assigneeKind: WorkAssigneeKind;
    assigneeAgentId: string | null;
  },
  input: {
    expectedUpdatedAt: string;
    assigneeKind: WorkAssigneeKind;
    agentId: string | null;
  },
): void {
  if (
    (input.assigneeKind === "agent" && !input.agentId) ||
    (input.assigneeKind !== "agent" && input.agentId !== null)
  ) {
    throw new WorkAssignmentError(
      "ASSIGNMENT_INVALID",
      "An agent assignee requires an agent ID; other assignees cannot use one",
    );
  }
  if (
    current.updatedAt !== input.expectedUpdatedAt ||
    (current.assigneeKind === input.assigneeKind &&
      current.assigneeAgentId === input.agentId)
  ) {
    throw new WorkAssignmentError(
      "ASSIGNMENT_CONFLICT",
      "Work assignment changed or is already set; refresh before saving again",
    );
  }
}
