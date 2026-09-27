import { describe, expect, it } from "vitest";
import {
  classifyObservationFreshness,
  requireLocalIntegrationScenario,
} from "./integrations";

describe("local integration scenario boundaries", () => {
  it("keeps development and operations samples in their configured categories", () => {
    expect(() =>
      requireLocalIntegrationScenario(
        "synthetic-development",
        "development.pr-merged",
      ),
    ).not.toThrow();
    expect(() =>
      requireLocalIntegrationScenario(
        "synthetic-operations",
        "operations.monitor-recovered",
      ),
    ).not.toThrow();
    expect(() =>
      requireLocalIntegrationScenario(
        "synthetic-development",
        "operations.monitor-down",
      ),
    ).toThrowError(expect.objectContaining({ code: "SCENARIO_MISMATCH" }));
  });
});

describe("source observation freshness", () => {
  const now = new Date("2026-09-27T12:00:00.000Z");
  it("keeps missing and future-dated observations out of fresh health", () => {
    expect(classifyObservationFreshness(null, 60, now)).toBe("unknown");
    expect(
      classifyObservationFreshness(
        new Date("2026-09-27T12:00:01.000Z"),
        60,
        now,
      ),
    ).toBe("future");
  });
  it("uses the configured boundary inclusive of the exact window", () => {
    expect(
      classifyObservationFreshness(
        new Date("2026-09-27T11:00:00.000Z"),
        60,
        now,
      ),
    ).toBe("fresh");
    expect(
      classifyObservationFreshness(
        new Date("2026-09-27T10:59:59.999Z"),
        60,
        now,
      ),
    ).toBe("stale");
  });
});
