import { describe, expect, it } from "vitest";
import type { Capture, WorkItem } from "@commandry/contracts";
import { createCaptureService, type CaptureRepository } from "./capture";

const originalContent = "  Replace the garden timer after the next trip.\n";
const capture: Capture = {
  id: "48401dbc-26ee-4c68-b7f5-e5360b504dc0",
  inputType: "text",
  originalContent,
  source: "manual-local",
  author: "local-user",
  state: "unfiled",
  projectId: null,
  filedRecord: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  filedAt: null,
};
const work: WorkItem = {
  id: "9235b672-c3ba-4bb8-83e6-e2add0035c89",
  projectId: "3fb6d394-a43b-4dcf-b070-1d0ad9f84d51",
  sourceCaptureId: capture.id,
  title: "Replace timer",
  description: originalContent,
  status: "open",
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function port(overrides: Partial<CaptureRepository> = {}): CaptureRepository {
  return {
    projectExists: async () => true,
    createCapture: async () => capture,
    getCapture: async () => capture,
    listCaptures: async () => ({ items: [capture], nextCursor: null }),
    fileAsTask: async () => ({
      capture: { ...capture, state: "filed" },
      record: work,
    }),
    fileAsNote: async () => {
      throw new Error("unused");
    },
    listProjectWork: async () => ({ items: [work], nextCursor: null }),
    listProjectKnowledge: async () => ({ items: [], nextCursor: null }),
    search: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

describe("manual capture application", () => {
  it("passes original text unchanged into persistence", async () => {
    let storedContent = "";
    const service = createCaptureService(
      port({
        createCapture: async (input) => {
          storedContent = input.originalContent;
          return capture;
        },
      }),
    );
    await service.createCapture({ inputType: "text", originalContent });
    expect(storedContent).toBe(originalContent);
  });

  it("files a task with provenance and a derived copy of source text", async () => {
    let filedDescription = "";
    const service = createCaptureService(
      port({
        fileAsTask: async (input) => {
          filedDescription = input.description;
          return { capture: { ...capture, state: "filed" }, record: work };
        },
      }),
    );
    const result = await service.fileCapture(capture.id, {
      projectId: work.projectId,
      kind: "task",
      title: work.title,
    });
    expect(filedDescription).toBe(originalContent);
    expect(result.record.sourceCaptureId).toBe(capture.id);
  });

  it("refuses filing when the project is missing", async () => {
    let writes = 0;
    const service = createCaptureService(
      port({
        projectExists: async () => false,
        fileAsTask: async () => {
          writes += 1;
          throw new Error("should not write");
        },
      }),
    );
    await expect(
      service.fileCapture(capture.id, {
        projectId: work.projectId,
        kind: "task",
        title: work.title,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(writes).toBe(0);
  });
});
