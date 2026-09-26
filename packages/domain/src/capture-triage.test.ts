import { expect, test } from "vitest";
import {
  CAPTURE_TRIAGE_RULE_VERSION,
  CAPTURE_TRIAGE_SOURCE_LABEL,
  requireCaptureTriageReview,
  suggestCaptureTriage,
} from "./capture-triage";
import { requireWorkItemStatusChange } from "./work-item-status";

test("local triage labels its fixed rule and leaves ambiguous capture for review", () => {
  expect(CAPTURE_TRIAGE_RULE_VERSION).toBe("capture-triage/v1");
  expect(CAPTURE_TRIAGE_SOURCE_LABEL).toBe("Local deterministic rule");
  expect(
    suggestCaptureTriage({
      inputType: "text",
      originalContent: "  Need to fix the timer.\nKeep this line.  ",
    }),
  ).toMatchObject({ kind: "task", confidence: 60 });
  expect(
    suggestCaptureTriage({
      inputType: "text",
      originalContent: "A thought about the garden",
    }),
  ).toMatchObject({ kind: "note", confidence: 50 });
  expect(
    suggestCaptureTriage({
      inputType: "url",
      originalContent: "https://example.test/reference?q=1",
    }),
  ).toMatchObject({
    kind: "note",
    title: "Saved link: example.test",
    confidence: 70,
  });
});

test("review and status guards reject stale or repeated decisions", () => {
  expect(() =>
    requireCaptureTriageReview({
      captureState: "unfiled",
      suggestionExists: true,
      decisionExists: false,
    }),
  ).not.toThrow();
  expect(() =>
    requireCaptureTriageReview({
      captureState: "unfiled",
      suggestionExists: false,
      decisionExists: false,
    }),
  ).toThrowError(expect.objectContaining({ code: "SUGGESTION_NOT_READY" }));
  expect(() =>
    requireCaptureTriageReview({
      captureState: "unfiled",
      suggestionExists: true,
      decisionExists: true,
    }),
  ).toThrowError(expect.objectContaining({ code: "TRIAGE_ALREADY_REVIEWED" }));
  expect(() =>
    requireWorkItemStatusChange("open", "open", "done"),
  ).not.toThrow();
  expect(() =>
    requireWorkItemStatusChange("done", "open", "open"),
  ).toThrowError(expect.objectContaining({ code: "STATUS_CONFLICT" }));
});
