import { expect, test } from "vitest";
import {
  requireAcyclicParent,
  requireDistinctDependency,
  resourceRelationshipRegistry,
} from "./resource-topology";

test("resource relationships have resource-to-resource inverse meaning", () => {
  expect(resourceRelationshipRegistry.depends_on).toEqual({
    sourceKind: "resource",
    targetKind: "resource",
    inverseType: "required_by",
  });
});

test("primary parent and dependency guards reject self and ancestry cycles", () => {
  expect(() => requireAcyclicParent("a", null, new Set())).not.toThrow();
  expect(() => requireAcyclicParent("a", "b", new Set(["b"]))).not.toThrow();
  expect(() => requireAcyclicParent("a", "a", new Set())).toThrowError(
    expect.objectContaining({ code: "HIERARCHY_CYCLE" }),
  );
  expect(() =>
    requireAcyclicParent("a", "b", new Set(["b", "a"])),
  ).toThrowError(expect.objectContaining({ code: "HIERARCHY_CYCLE" }));
  expect(() => requireDistinctDependency("a", "a")).toThrowError(
    expect.objectContaining({ code: "DEPENDENCY_SELF" }),
  );
});
