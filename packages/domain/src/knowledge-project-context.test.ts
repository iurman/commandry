import { describe, expect, it } from "vitest";
import { knowledgeProjectRelationshipRegistry } from "./relationships";
import {
  KNOWLEDGE_PROJECT_CONTEXT_POLICY,
  requireSecondaryKnowledgeProject,
} from "./knowledge-project-context";

describe("knowledge project context", () => {
  it("keeps a primary project while registering additional local context", () => {
    expect(knowledgeProjectRelationshipRegistry.relates_to).toMatchObject({
      sourceKind: "knowledge_item",
      targetKind: "project",
      inverseType: "relates_to",
      traversal: "none",
    });
    expect(
      KNOWLEDGE_PROJECT_CONTEXT_POLICY.relationshipsAreSecurityBoundaries,
    ).toBe(false);
    expect(() => requireSecondaryKnowledgeProject("a", "b")).not.toThrow();
    expect(() => requireSecondaryKnowledgeProject("a", "a")).toThrow(/primary/);
  });
});
