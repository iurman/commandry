import { systemRelationshipRegistry } from "./relationships";

export const SYSTEM_CONTEXT_POLICY = {
  sourceOfTruth: "local-only",
  domainRelationship: systemRelationshipRegistry.domainOwnership.type,
  projectRelationship: systemRelationshipRegistry.projectContext.type,
  resourceRelationship: systemRelationshipRegistry.resourceSupport.type,
  relationshipsAreSecurityBoundaries: false,
  actor: "local-user:unattributed",
} as const;

export type SystemContextErrorCode =
  | "SYSTEM_NOT_FOUND"
  | "SYSTEM_ARCHIVED"
  | "SYSTEM_STALE"
  | "SYSTEM_HAS_LINKS"
  | "SYSTEM_DOMAIN_STALE"
  | "DOMAIN_NOT_FOUND"
  | "DOMAIN_ARCHIVED"
  | "PROJECT_NOT_FOUND"
  | "RESOURCE_NOT_FOUND"
  | "SYSTEM_LINK_NOT_FOUND";

export class SystemContextError extends Error {
  constructor(
    readonly code: SystemContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SystemContextError";
  }
}

export function requireEditableSystem(
  current: { lifecycle: string; version: number },
  expectedVersion: number,
) {
  if (current.lifecycle !== "active")
    throw new SystemContextError(
      "SYSTEM_ARCHIVED",
      "Archived systems cannot be changed",
    );
  if (current.version !== expectedVersion)
    throw new SystemContextError(
      "SYSTEM_STALE",
      "System changed. Reload before editing it",
    );
}

export function requireSystemWithoutLinks(activeLinkCount: number) {
  if (activeLinkCount > 0)
    throw new SystemContextError(
      "SYSTEM_HAS_LINKS",
      "Unlink the active domain, projects, and resources before archiving this system",
    );
}

export function systemDomainChange(
  currentDomainId: string | null,
  expectedDomainId: string | null,
  targetDomainId: string | null,
): "noop" | "change" {
  if (currentDomainId !== expectedDomainId)
    throw new SystemContextError(
      "SYSTEM_DOMAIN_STALE",
      "System domain changed. Reload before changing it",
    );
  return currentDomainId === targetDomainId ? "noop" : "change";
}
