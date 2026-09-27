import { describe, expect, it } from "vitest";
import {
  firstWorkRecurrenceAfter,
  generatedWorkDraft,
  requireWorkRecurrenceSchedule,
  requireWorkRecurrenceSource,
  workRecurrenceDue,
  WorkRecurrenceError,
} from "./work-recurrence";

describe("local recurring Work", () => {
  it("bounds the UTC cadence and only schedules original tasks", () => {
    const now = new Date("2026-09-27T10:00:00.000Z");
    expect(
      requireWorkRecurrenceSchedule(
        { startAt: "2026-09-27T11:00:00.000Z", everyMinutes: 60 },
        now,
      ).everyMinutes,
    ).toBe(60);
    expect(() =>
      requireWorkRecurrenceSchedule(
        { startAt: now.toISOString(), everyMinutes: 60 },
        now,
      ),
    ).toThrow(WorkRecurrenceError);
    expect(() =>
      requireWorkRecurrenceSchedule(
        { startAt: "2026-09-27T11:00:00.000Z", everyMinutes: 4 },
        now,
      ),
    ).toThrow(WorkRecurrenceError);
    expect(() =>
      requireWorkRecurrenceSource({
        workType: "initiative",
        generatedFromWorkItemId: null,
      }),
    ).toThrow(WorkRecurrenceError);
    expect(() =>
      requireWorkRecurrenceSource({
        workType: "task",
        generatedFromWorkItemId: crypto.randomUUID(),
      }),
    ).toThrow(WorkRecurrenceError);
  });

  it("takes one latest due slot and starts a new task without assignment", () => {
    const start = new Date("2026-09-27T10:00:00.000Z");
    const late = new Date("2026-09-27T10:16:00.000Z");
    expect(workRecurrenceDue(start, 5, late)).toEqual({
      dueAt: new Date("2026-09-27T10:15:00.000Z"),
      nextAt: new Date("2026-09-27T10:20:00.000Z"),
      skipped: 3,
    });
    expect(firstWorkRecurrenceAfter(start, 5, late)).toEqual(
      new Date("2026-09-27T10:20:00.000Z"),
    );
    expect(
      generatedWorkDraft(
        {
          id: crypto.randomUUID(),
          projectId: crypto.randomUUID(),
          sourceCaptureId: crypto.randomUUID(),
          title: "Inspect the system",
          description: "Keep the source intact",
          priority: "high",
        },
        start,
      ),
    ).toMatchObject({
      title: "Inspect the system",
      priority: "high",
      dueOn: "2026-09-27",
      status: "open",
      assigneeKind: "unassigned",
    });
  });
});
