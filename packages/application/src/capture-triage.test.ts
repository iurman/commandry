import { expect, test } from "vitest";
import type { Capture } from "@commandry/contracts";
import {
  createCaptureAndRequestTriage,
  createCaptureTriageService,
  createCaptureTriageProcessor,
  type CaptureTriagePort,
} from "./capture-triage";

test("queue failure does not erase or fail a saved original capture", async () => {
  const capture: Capture = {
    id: "e84746b2-a159-4bba-8c0d-00ca907e436a",
    inputType: "text",
    originalContent: "  Original line.\nSecond line.  ",
    source: "manual-local",
    author: "local-user",
    state: "unfiled",
    projectId: null,
    filedRecord: null,
    createdAt: "2026-09-26T00:00:00.000Z",
    filedAt: null,
  };
  const result = await createCaptureAndRequestTriage(
    async (input) => {
      expect(input.originalContent).toBe(capture.originalContent);
      return capture;
    },
    async () => {
      throw new Error("queue unavailable");
    },
    { inputType: "text", originalContent: capture.originalContent },
  );
  expect(result).toEqual({ capture, triageQueued: false });
});

test("actual-client originals cannot enter deterministic jobs or legacy decisions", async () => {
  const id = "e84746b2-a159-4bba-8c0d-00ca907e436a";
  let effects = 0;
  const port: CaptureTriagePort = {
    getCapture: async () => ({
      id,
      inputType: "text",
      source: "foundation-client",
      originalContent: "fix this",
      state: "unfiled",
      projectId: id,
    }),
    getReview: async () => {
      throw new Error("unused");
    },
    createSuggestionOnce: async () => {
      effects++;
      return null;
    },
    review: async () => {
      effects++;
      throw new Error("unexpected review");
    },
    enqueueSuggestion: async () => {
      effects++;
    },
  };
  const service = createCaptureTriageService(port);
  await expect(service.requestSuggestion(id)).rejects.toMatchObject({
    code: "CAPTURE_REVIEW_REQUIRED",
  });
  await expect(
    service.review(id, { decision: "reject" }),
  ).rejects.toMatchObject({ code: "CAPTURE_REVIEW_REQUIRED" });
  expect(await createCaptureTriageProcessor(port)(id)).toBeNull();
  expect(effects).toBe(0);
});
