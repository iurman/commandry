import { describe, expect, it } from "vitest";
import { requireLocalIntegrationScenario } from "./integrations";

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
