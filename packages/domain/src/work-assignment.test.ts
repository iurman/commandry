import { describe, expect, it } from "vitest";
import {
  requireWorkAssignmentChange,
  WorkAssignmentError,
} from "./work-assignment";

describe("local Work assignment", () => {
  const current = {
    updatedAt: "2026-09-26T12:00:00.000Z",
    assigneeKind: "unassigned" as const,
    assigneeAgentId: null,
  };

  it("requires an exact displayed revision and an actual change", () => {
    expect(() =>
      requireWorkAssignmentChange(current, {
        expectedUpdatedAt: current.updatedAt,
        assigneeKind: "local_user",
        agentId: null,
      }),
    ).not.toThrow();
    expect(() =>
      requireWorkAssignmentChange(current, {
        expectedUpdatedAt: "2026-09-25T12:00:00.000Z",
        assigneeKind: "local_user",
        agentId: null,
      }),
    ).toThrow(WorkAssignmentError);
    expect(() =>
      requireWorkAssignmentChange(current, {
        expectedUpdatedAt: current.updatedAt,
        assigneeKind: "unassigned",
        agentId: null,
      }),
    ).toThrow(WorkAssignmentError);
  });

  it("requires a real agent ID only for agent assignments", () => {
    expect(() =>
      requireWorkAssignmentChange(current, {
        expectedUpdatedAt: current.updatedAt,
        assigneeKind: "agent",
        agentId: null,
      }),
    ).toThrow(WorkAssignmentError);
    expect(() =>
      requireWorkAssignmentChange(current, {
        expectedUpdatedAt: current.updatedAt,
        assigneeKind: "local_user",
        agentId: crypto.randomUUID(),
      }),
    ).toThrow(WorkAssignmentError);
  });
});
