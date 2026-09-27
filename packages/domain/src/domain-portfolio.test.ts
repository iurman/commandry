import { describe, expect, it } from "vitest";
import {
  DOMAIN_PORTFOLIO_POLICY,
  projectDomainChange,
  requireArchivableDomain,
  requireEditableDomain,
} from "./domain-portfolio";

describe("domain portfolio policy", () => {
  it("keeps membership as organization metadata and requires current revisions", () => {
    expect(DOMAIN_PORTFOLIO_POLICY).toMatchObject({
      membershipType: "owned_by",
      inverseMembershipType: "owns",
      membershipIsSecurityBoundary: false,
    });
    expect(() =>
      requireEditableDomain({ lifecycle: "active", version: 2 }, 2),
    ).not.toThrow();
    expect(() =>
      requireEditableDomain({ lifecycle: "active", version: 2 }, 1),
    ).toThrow(/Reload/);
    expect(() =>
      requireEditableDomain({ lifecycle: "archived", version: 2 }, 2),
    ).toThrow(/Archived/);
    expect(projectDomainChange(null, null, "domain-a")).toBe("change");
    expect(projectDomainChange("domain-a", "domain-a", "domain-a")).toBe(
      "noop",
    );
    expect(() => projectDomainChange("domain-a", null, "domain-b")).toThrow(
      /Reload/,
    );
    expect(() => requireArchivableDomain(1)).toThrow(/Move or unlink/);
    expect(() => requireArchivableDomain(0)).not.toThrow();
  });
});
