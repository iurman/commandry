import { describe, expect, it } from "vitest";
import { normalizeWorkComment } from "./work-discussion";

describe("work discussion", () => {
  it("preserves a trimmed manual comment and rejects blank or oversized text", () => {
    expect(normalizeWorkComment("  Review the original capture.\n")).toBe(
      "Review the original capture.",
    );
    expect(() => normalizeWorkComment("   ")).toThrow();
    expect(() => normalizeWorkComment("x".repeat(5_001))).toThrow();
  });
});
