import { describe, expect, it } from "vitest";
import {
  defaultProjectPresentation,
  prepareProjectPresentationRevision,
  ProjectPresentationConflictError,
} from "./project-presentation";

describe("project presentation", () => {
  it("versions visible card order and areas without changing the default", () => {
    const next = prepareProjectPresentationRevision(
      defaultProjectPresentation,
      {
        expectedVersion: 1,
        overviewCards: ["work", "state", "knowledge"],
        visibleAreas: ["work", "knowledge"],
      },
    );
    expect(next).toEqual({
      version: 2,
      overviewCards: ["work", "state", "knowledge"],
      visibleAreas: ["work", "knowledge"],
    });
    expect(defaultProjectPresentation.version).toBe(1);
    expect(defaultProjectPresentation.visibleAreas).toContain("systems");
  });

  it("rejects stale edits and duplicate or unknown entries", () => {
    expect(() =>
      prepareProjectPresentationRevision(defaultProjectPresentation, {
        expectedVersion: 2,
        overviewCards: ["state"],
        visibleAreas: ["work"],
      }),
    ).toThrow(ProjectPresentationConflictError);
    expect(() =>
      prepareProjectPresentationRevision(defaultProjectPresentation, {
        expectedVersion: 1,
        overviewCards: ["state", "state"],
        visibleAreas: ["work"],
      }),
    ).toThrow("Invalid project presentation");
  });

  it("does not create a revision for unchanged settings", () => {
    const next = prepareProjectPresentationRevision(
      defaultProjectPresentation,
      {
        expectedVersion: 1,
        overviewCards: [...defaultProjectPresentation.overviewCards],
        visibleAreas: [...defaultProjectPresentation.visibleAreas],
      },
    );
    expect(next).toBe(defaultProjectPresentation);
  });
});
