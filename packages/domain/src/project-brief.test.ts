import { describe, expect, it } from "vitest";
import {
  briefExcerpt,
  briefMissing,
  nextActionForOpenWork,
  projectStateText,
  requireFactualEvidence,
  resourceFactText,
} from "./project-brief";

describe("deterministic project brief rules", () => {
  it("describes only recorded state and unknown resource health", () => {
    expect(projectStateText("active")).toContain("saved project record");
    expect(resourceFactText(null)).toContain("unknown");
    expect(briefMissing("No decision type exists yet")).toEqual({
      status: "not_recorded",
      message: "No decision type exists yet",
    });
  });

  it("requires evidence for facts and marks task suggestions as review candidates", () => {
    expect(() => requireFactualEvidence(0)).toThrow(/source reference/);
    expect(() => requireFactualEvidence(1)).not.toThrow();
    expect(nextActionForOpenWork("Inspect logs")).toBe(
      "Review open task: Inspect logs",
    );
    expect(briefExcerpt("x".repeat(300))).toHaveLength(243);
  });
});
