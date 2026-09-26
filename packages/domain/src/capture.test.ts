import { expect, test } from "vitest";
import { manualFilingContent, validateOriginalCaptureContent } from "./capture";

test("manual text capture accepts exact original spacing", () => {
  const original = "  Keep this phrasing and spacing.\n";
  expect(() => validateOriginalCaptureContent("text", original)).not.toThrow();
  expect(manualFilingContent(original, undefined)).toBe(original);
});

test("manual URLs require valid HTTP links without rewriting them", () => {
  expect(() =>
    validateOriginalCaptureContent("url", "https://example.test/a?x=1"),
  ).not.toThrow();
  expect(() =>
    validateOriginalCaptureContent("url", " ftp://example.test"),
  ).toThrow();
  expect(() => validateOriginalCaptureContent("url", "not a URL")).toThrow();
});
