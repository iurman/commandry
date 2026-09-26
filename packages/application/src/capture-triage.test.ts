import { expect, test } from "vitest";
import type { Capture } from "@commandry/contracts";
import { createCaptureAndRequestTriage } from "./capture-triage";

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
