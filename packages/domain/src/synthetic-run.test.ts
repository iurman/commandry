import { expect, test } from "vitest";
import { syntheticOccurrenceId, syntheticResult } from "./synthetic-run.js";

test("occurrence IDs are deterministic and reject empty keys", () => {
  expect(syntheticOccurrenceId("  check-1  ")).toBe("synthetic:v1:check-1");
  expect(syntheticResult(syntheticOccurrenceId("check-1"))).toBe(
    "Processed synthetic:v1:check-1",
  );
  expect(() => syntheticOccurrenceId(" ")).toThrow(RangeError);
});
