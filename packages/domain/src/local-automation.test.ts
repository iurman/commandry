import { describe, expect, it } from "vitest";
import {
  LOCAL_PROJECT_SUMMARY_POLICY,
  requireAutomationEnabled,
  requireExpectedAutomationEnabled,
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
});
