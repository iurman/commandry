import { expect, test } from "vitest";
import {
  createCaptureRequestSchema,
  listResourcesQuerySchema,
  searchQuerySchema,
  syntheticJobV1Schema,
} from "./index.js";

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

test("capture contracts preserve source text and reject malformed URLs", () => {
  const originalContent = "  Keep these spaces.\n";
  expect(
    createCaptureRequestSchema.parse({ inputType: "text", originalContent })
      .originalContent,
  ).toBe(originalContent);
  expect(
    createCaptureRequestSchema.safeParse({
      inputType: "url",
      originalContent: "ftp://example.test/file",
    }).success,
  ).toBe(false);
});

test("search requires a bounded term and scoped cursor", () => {
  expect(searchQuerySchema.safeParse({}).success).toBe(false);
  expect(searchQuerySchema.safeParse({ q: "timer", limit: 101 }).success).toBe(
    false,
  );
  expect(searchQuerySchema.parse({ q: " timer " }).q).toBe("timer");
});
