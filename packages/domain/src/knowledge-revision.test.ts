import { describe, expect, it } from "vitest";
import {
  KnowledgeRevisionError,
  requireKnowledgeRevision,
} from "./knowledge-revision";

describe("knowledge note revisions", () => {
  it("requires a current version and a real content change", () => {
    const current = {
      version: 2,
      title: "Saved note",
      content: "Exact filed text",
    };
    expect(() =>
      requireKnowledgeRevision(current, {
        expectedVersion: 2,
        title: "Saved note",
        content: "New understanding",
      }),
    ).not.toThrow();
    expect(() =>
      requireKnowledgeRevision(current, {
        expectedVersion: 1,
        title: "Changed",
        content: "New understanding",
      }),
    ).toThrow(KnowledgeRevisionError);
    expect(() =>
      requireKnowledgeRevision(current, {
        expectedVersion: 2,
        title: current.title,
        content: current.content,
      }),
    ).toThrow(KnowledgeRevisionError);
  });
});
