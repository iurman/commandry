import { describe, expect, it } from "vitest";
import { systemRelationshipRegistry } from "./relationships";
import {
  requireEditableSystem,
  requireSystemWithoutLinks,
  systemDomainChange,
  SYSTEM_CONTEXT_POLICY,
} from "./system-context";

describe("local system context", () => {
  it("keeps System distinct and its relationships outside authorization scope", () => {
    expect(systemRelationshipRegistry.domainOwnership).toMatchObject({
      sourceKind: "system",
      targetKind: "domain",
      inverseType: "owns",
      maxActiveTargets: 1,
      traversal: "containment",
    });
    expect(systemRelationshipRegistry.projectContext.traversal).toBe("none");
    expect(systemRelationshipRegistry.resourceSupport).toMatchObject({
      sourceKind: "resource",
      targetKind: "system",
      inverseType: "supported_by",
    });
    expect(SYSTEM_CONTEXT_POLICY.resourceRelationship).toBe("supports");
    expect(SYSTEM_CONTEXT_POLICY.relationshipsAreSecurityBoundaries).toBe(
      false,
    );
    expect(systemDomainChange(null, null, "home")).toBe("change");
    expect(systemDomainChange("home", "home", "home")).toBe("noop");
    expect(() => systemDomainChange("home", null, "work")).toThrow(/changed/);
  });

  it("requires current active revisions and no active links to archive", () => {
    expect(() =>
      requireEditableSystem({ lifecycle: "active", version: 2 }, 1),
    ).toThrow(/Reload/);
    expect(() =>
      requireEditableSystem({ lifecycle: "archived", version: 2 }, 2),
    ).toThrow(/Archived/);
    expect(() => requireSystemWithoutLinks(1)).toThrow(/Unlink/);
    expect(() => requireSystemWithoutLinks(0)).not.toThrow();
  });
});
