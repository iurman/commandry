import { expect, test } from "vitest";
import {
  explainResourceImpact,
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

test("impact explanations follow recorded paths without claiming an outage", () => {
  expect(explainResourceImpact(["Database", "API", "Website"])).toBe(
    "Website is connected to Database by 2 manually recorded dependency links. This is potential impact, not an observed outage.",
  );
  expect(() => explainResourceImpact(["Database"])).toThrow();
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
