export const WORK_PROJECT_CONTEXT_POLICY = {
  sourceOfTruth: "local-only",
  relationship: "relates_to",
  inverseRelationship: "relates_to",
  relationshipsAreSecurityBoundaries: false,
  actor: "local-user:unattributed",
} as const;

export type WorkProjectContextErrorCode =
  | "WORK_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "WORK_PROJECT_IS_PRIMARY"
  | "WORK_PROJECT_LINK_NOT_FOUND";

export class WorkProjectContextError extends Error {
  constructor(
    readonly code: WorkProjectContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkProjectContextError";
  }
}

export function requireSecondaryWorkProject(
  primaryProjectId: string,
  targetProjectId: string,
) {
  if (primaryProjectId === targetProjectId)
    throw new WorkProjectContextError(
      "WORK_PROJECT_IS_PRIMARY",
      "This is already the work item's primary project",
    );
}
