import { describe, expect, it } from "vitest";
import {
  LOCAL_PROJECT_SUMMARY_POLICY,
  requireAutomationEnabled,
  requireExpectedAutomationEnabled,
  requireSameAutomationOccurrence,
  scheduledAutomationTime,
  recurringAutomationStart,
  firstRecurrenceAfter,
  dueRecurrence,
  localAutomationTrigger,
  syntheticEventAutomationDecision,
} from "./local-automation";

describe("local automation policy", () => {
  it("declares a bounded read-only capability and rejects disabled or stale runs", () => {
    expect(LOCAL_PROJECT_SUMMARY_POLICY).toMatchObject({
      risk: "read_only",
      requiredCapability: "project.brief.read",
      approval: "not_required",
      externalActions: false,
    });
    expect(() => requireAutomationEnabled(false)).toThrow(/Enable/);
    expect(() => requireExpectedAutomationEnabled(true, false, false)).toThrow(
      /reload/,
    );
    expect(() =>
      requireExpectedAutomationEnabled(true, true, false),
    ).not.toThrow();
  });

  it("accepts one explicit future instant and rejects elapsed schedules", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    expect(scheduledAutomationTime(undefined, now)).toBeNull();
    expect(
      scheduledAutomationTime("2026-09-26T12:05:00.000+00:00", now),
    ).toEqual(new Date("2026-09-26T12:05:00.000Z"));
    expect(() =>
      scheduledAutomationTime("2026-09-26T11:59:59.000Z", now),
    ).toThrow(/future/);
  });

  it("replays only an occurrence with the same automation and due time", () => {
    const saved = {
      definitionId: "definition-a",
      scheduledFor: new Date("2026-09-26T12:05:00.000Z"),
    };
    expect(() =>
      requireSameAutomationOccurrence(
        saved,
        "definition-a",
        "2026-09-26T12:05:00+00:00",
      ),
    ).not.toThrow();
    expect(() =>
      requireSameAutomationOccurrence(
        saved,
        "definition-a",
        "2026-09-26T12:06:00.000Z",
      ),
    ).toThrow(/different/);
    expect(() =>
      requireSameAutomationOccurrence(saved, "definition-b", undefined),
    ).toThrow(/different/);
  });

  it("anchors recurrence in UTC, catches up once, and advances past the latest due time", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    const recurrence = recurringAutomationStart(
      { startAt: "2026-09-26T12:05:00+00:00", everyMinutes: 5 },
      now,
    );
    expect(recurrence).toEqual({
      startAt: new Date("2026-09-26T12:05:00.000Z"),
      everyMinutes: 5,
    });
    expect(() =>
      recurringAutomationStart(
        { startAt: now.toISOString(), everyMinutes: 5 },
        now,
      ),
    ).toThrow(/future/);
    expect(() =>
      recurringAutomationStart(
        { startAt: "2026-09-26T12:05:00Z", everyMinutes: 1 },
        now,
      ),
    ).toThrow(/interval/);
    expect(dueRecurrence(recurrence!.startAt, 5, now)).toBeNull();
    expect(
      dueRecurrence(recurrence!.startAt, 5, new Date("2026-09-26T12:21:00Z")),
    ).toEqual({
      dueAt: new Date("2026-09-26T12:20:00Z"),
      nextAt: new Date("2026-09-26T12:25:00Z"),
      skipped: 3,
    });
    expect(
      firstRecurrenceAfter(
        recurrence!.startAt,
        5,
        new Date("2026-09-26T12:21:00Z"),
      ),
    ).toEqual(new Date("2026-09-26T12:25:00Z"));
  });

  it("separates creation, recurring, and synthetic event triggers", () => {
    expect(localAutomationTrigger({})).toBe("on_creation_once");
    expect(localAutomationTrigger({ eventType: "monitor.down" })).toBe(
      "synthetic_event",
    );
    expect(
      localAutomationTrigger({
        recurrence: { startAt: "2026-09-26T12:05:00Z", everyMinutes: 5 },
      }),
    ).toBe("recurring_interval");
    expect(() =>
      localAutomationTrigger({
        eventType: "monitor.down",
        recurrence: { startAt: "2026-09-26T12:05:00Z", everyMinutes: 5 },
      }),
    ).toThrow(/Choose/);
  });

  it("matches only newly ingested project events and records disabled or overlapping work", () => {
    const event = {
      projectId: "project-a",
      type: "monitor.down",
      ingestedAt: new Date("2026-09-26T12:00:00Z"),
    };
    const definition = {
      projectId: "project-a",
      triggerType: "synthetic_event",
      eventType: "monitor.down",
      createdAt: new Date("2026-09-26T11:59:00Z"),
      enabled: true,
    };
    expect(syntheticEventAutomationDecision(definition, event, false)).toBe(
      "queue",
    );
    expect(syntheticEventAutomationDecision(definition, event, true)).toBe(
      "skip_overlap",
    );
    expect(
      syntheticEventAutomationDecision(
        { ...definition, enabled: false },
        event,
        false,
      ),
    ).toBe("skip_disabled");
    expect(
      syntheticEventAutomationDecision(
        { ...definition, projectId: "project-b" },
        event,
        false,
      ),
    ).toBe("ineligible");
    expect(
      syntheticEventAutomationDecision(
        { ...definition, createdAt: new Date("2026-09-26T12:01:00Z") },
        event,
        false,
      ),
    ).toBe("ineligible");
  });
});
