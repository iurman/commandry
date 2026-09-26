import { expect, test } from "vitest";
import {
  decideSyntheticMonitorAlert,
  syntheticScenario,
  syntheticAvailabilitySample,
} from "./synthetic-events";

test("fixed synthetic scenarios normalize to stable facts and labeled sources", () => {
  expect(syntheticScenario("development.pr-merged")).toMatchObject({
    eventType: "git.pull_request.merged",
    sourceKind: "synthetic-development",
    requiresResource: false,
  });
  expect(syntheticScenario("operations.monitor-down")).toMatchObject({
    eventType: "monitor.down",
    sourceKind: "synthetic-operations",
    requiresResource: true,
  });
  expect(() => syntheticScenario("production.monitor-down")).toThrow();
});

test("only synthetic monitor facts yield availability samples", () => {
  expect(syntheticAvailabilitySample("monitor.down")).toMatchObject({
    name: "external_availability",
    unit: "percent",
    value: 0,
  });
  expect(syntheticAvailabilitySample("monitor.recovered")?.value).toBe(100);
  expect(syntheticAvailabilitySample("git.pull_request.merged")).toBeNull();
});

test("monitor attention stays open on repeat and ignores stale transitions", () => {
  const down = {
    type: "monitor.down" as const,
    occurredAt: "2026-01-02T00:00:00Z",
  };
  expect(decideSyntheticMonitorAlert(null, down)).toBe("open");
  expect(
    decideSyntheticMonitorAlert(
      { state: "open", lastObservedAt: "2026-01-01T00:00:00Z" },
      down,
    ),
  ).toBe("refresh");
  expect(
    decideSyntheticMonitorAlert(
      { state: "resolved", lastObservedAt: "2026-01-03T00:00:00Z" },
      down,
    ),
  ).toBe("ignore");
  expect(
    decideSyntheticMonitorAlert(
      { state: "open", lastObservedAt: "2026-01-02T00:00:00Z" },
      { type: "monitor.recovered", occurredAt: "2026-01-03T00:00:00Z" },
    ),
  ).toBe("resolve");
});
