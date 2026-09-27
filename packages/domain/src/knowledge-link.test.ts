import { describe, expect, it } from "vitest";
import { safeKnowledgeLinkUrl } from "./knowledge-link";

describe("saved knowledge links", () => {
  it("keeps a navigable URL without query or fragment data", () => {
    expect(
      safeKnowledgeLinkUrl("https://example.test/guide?token=private#chapter"),
    ).toBe("https://example.test/guide");
  });

  it("rejects embedded credentials and non-web schemes", () => {
    expect(() =>
      safeKnowledgeLinkUrl("https://user:pass@example.test/"),
    ).toThrow();
    expect(() => safeKnowledgeLinkUrl("javascript:alert(1)")).toThrow();
  });
});
