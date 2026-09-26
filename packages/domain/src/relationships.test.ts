import { expect, test } from "vitest";
import { projectResourceRelationship } from "./relationships";

test("project-resource relationships have deliberate direction and inverse", () => {
  expect(projectResourceRelationship("supports")).toEqual({
    sourceKind: "resource",
    targetKind: "project",
    inverseType: "supported_by",
  });
  expect(projectResourceRelationship("relates_to")).toEqual({
    sourceKind: "project",
    targetKind: "resource",
    inverseType: "relates_to",
  });
  expect(() => projectResourceRelationship("contains")).toThrow();
});
