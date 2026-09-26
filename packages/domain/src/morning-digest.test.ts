import { describe, expect, it } from "vitest";
import {
  morningDigestCursor,
  morningDigestOutcome,
  morningDigestWindow,
  parseMorningDigestCursor,
} from "./morning-digest";

describe("local morning digest", () => {
  it("uses an explicit bounded UTC window", () => {
    expect(
      morningDigestWindow("2026-09-25T06:00:00Z", "2026-09-26T06:00:00Z"),
    ).toEqual({
      from: new Date("2026-09-25T06:00:00Z"),
      to: new Date("2026-09-26T06:00:00Z"),
    });
    expect(() =>
      morningDigestWindow("2026-09-26T06:00:00Z", "2026-09-26T06:00:00Z"),
    ).toThrow(/window/);
    expect(() =>
      morningDigestWindow("2026-08-01T06:00:00Z", "2026-09-26T06:00:00Z"),
    ).toThrow(/31 days/);
  });

  it("calls every synthetic success unverified and awaiting review", () => {
    expect(morningDigestOutcome("succeeded")).toBe("awaiting_review");
    expect(morningDigestOutcome("failed")).toBe("failed");
    expect(morningDigestOutcome("skipped")).toBe("skipped");
  });

  it("round trips a stable cross-source pagination anchor", () => {
    const value = {
      completedAt: new Date("2026-09-26T06:00:00.000Z"),
      kind: "agent" as const,
      id: "c57b4625-c91c-4257-b00b-345e58c0ee46",
    };
    expect(parseMorningDigestCursor(morningDigestCursor(value))).toEqual(value);
    expect(() => parseMorningDigestCursor("bad cursor")).toThrow(/invalid/);
  });
});
