export const DOMAIN_PORTFOLIO_POLICY = {
  sourceOfTruth: "local-only",
  membershipType: "owned_by",
  inverseMembershipType: "owns",
  membershipIsSecurityBoundary: false,
  actor: "local-user:unattributed",
} as const;

export type DomainPortfolioErrorCode =
  | "DOMAIN_NOT_FOUND"
  | "DOMAIN_ARCHIVED"
  | "DOMAIN_STALE"
  | "DOMAIN_HAS_PROJECTS"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_DOMAIN_STALE";

export class DomainPortfolioError extends Error {
  constructor(
    readonly code: DomainPortfolioErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainPortfolioError";
  }
}

export function requireEditableDomain(
  current: { lifecycle: string; version: number },
  expectedVersion: number,
) {
  if (current.lifecycle !== "active")
    throw new DomainPortfolioError(
      "DOMAIN_ARCHIVED",
      "Archived domains cannot be changed",
    );
  if (current.version !== expectedVersion)
    throw new DomainPortfolioError(
      "DOMAIN_STALE",
      "Domain changed. Reload before editing it",
    );
}

export function requireArchivableDomain(activeProjectCount: number) {
  if (activeProjectCount > 0)
    throw new DomainPortfolioError(
      "DOMAIN_HAS_PROJECTS",
      "Move or unlink active projects before archiving this domain",
    );
}

export function projectDomainChange(
  currentDomainId: string | null,
  expectedDomainId: string | null,
  targetDomainId: string | null,
): "noop" | "change" {
  if (currentDomainId !== expectedDomainId)
    throw new DomainPortfolioError(
      "PROJECT_DOMAIN_STALE",
      "Project domain changed. Reload before changing it",
    );
  return currentDomainId === targetDomainId ? "noop" : "change";
}
