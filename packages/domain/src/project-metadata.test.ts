import { describe, expect, it } from "vitest";
import {
  prepareProjectMetadataRevision,
  ProjectMetadataConflictError,
} from "./project-metadata";

const current = {
  name: "Original",
  summary: "A durable concern",
  type: "personal",
  lifecycle: "active" as const,
  version: 3,
};

describe("project metadata revisions", () => {
  it("normalizes a change and records the exact changed fields", () => {
    expect(
      prepareProjectMetadataRevision(current, {
        expectedVersion: 3,
        name: " Revised ",
        summary: " ",
        type: "personal",
        lifecycle: "paused",
      }),
    ).toEqual({
      next: {
        name: "Revised",
        summary: null,
        type: "personal",
        lifecycle: "paused",
        version: 4,
      },
      changedFields: ["name", "summary", "lifecycle"],
    });
  });

  it("does not create history for a no-op but rejects a stale editor", () => {
    expect(
      prepareProjectMetadataRevision(current, {
        name: current.name,
        summary: current.summary,
        type: current.type,
        lifecycle: current.lifecycle,
        expectedVersion: 3,
      }).changedFields,
    ).toEqual([]);
    expect(() =>
      prepareProjectMetadataRevision(current, {
        name: current.name,
        summary: current.summary,
        type: current.type,
        lifecycle: current.lifecycle,
        expectedVersion: 2,
      }),
    ).toThrow(ProjectMetadataConflictError);
  });
});
