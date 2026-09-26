import { describe, expect, it } from "vitest";
import {
  requireWorkPlanningChange,
  workDueLabel,
  WorkPlanningError,
} from "./work-planning";

describe("local task planning", () => {
  it("requires a changed field and the displayed revision", () => {
    const current = {
      updatedAt: "2026-09-26T12:00:00.000Z",
      priority: null,
      dueOn: null,
    } as const;
    expect(() =>
      requireWorkPlanningChange(current, {
        expectedUpdatedAt: current.updatedAt,
        priority: "high",
        dueOn: "2026-09-27",
      }),
    ).not.toThrow();
    expect(() =>
      requireWorkPlanningChange(current, {
        expectedUpdatedAt: "2026-09-25T12:00:00.000Z",
        priority: "high",
        dueOn: "2026-09-27",
      }),
    ).toThrow(WorkPlanningError);
    expect(() =>
      requireWorkPlanningChange(current, {
        expectedUpdatedAt: current.updatedAt,
        priority: null,
        dueOn: null,
      }),
    ).toThrow(WorkPlanningError);
  });

  it("classifies UTC calendar days and excludes completed work", () => {
    expect(workDueLabel("2026-09-25", "open", "2026-09-26")).toBe("overdue");
    expect(workDueLabel("2026-09-26", "open", "2026-09-26")).toBe("today");
    expect(workDueLabel("2026-09-27", "open", "2026-09-26")).toBe("upcoming");
    expect(workDueLabel("2026-09-25", "done", "2026-09-26")).toBe("none");
    expect(workDueLabel(null, "open", "2026-09-26")).toBe("none");
  });
});
