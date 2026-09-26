import { expect, test } from "vitest";
import { listResourcesQuerySchema, syntheticJobV1Schema } from "./index.js";

test("resource pagination has a bounded default", () => {
  expect(listResourcesQuerySchema.parse({})).toEqual({ limit: 25 });
  expect(listResourcesQuerySchema.safeParse({ limit: 101 }).success).toBe(
    false,
  );
});

test("synthetic jobs are versioned", () => {
  expect(
    syntheticJobV1Schema.safeParse({
      version: 2,
      runId: crypto.randomUUID(),
      occurrenceId: "x",
    }).success,
  ).toBe(false);
});
