import { describe, expect, it } from "vitest";
import {
  LOCAL_PROJECT_SUMMARY_POLICY,
  requireAutomationEnabled,
  requireExpectedAutomationEnabled,
  requireSameAutomationOccurrence,
  scheduledAutomationTime,
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
});
