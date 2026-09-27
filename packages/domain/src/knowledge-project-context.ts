export const KNOWLEDGE_PROJECT_CONTEXT_POLICY = {
  sourceOfTruth: "local-only",
  relationship: "relates_to",
  inverseRelationship: "relates_to",
  relationshipsAreSecurityBoundaries: false,
  actor: "local-user:unattributed",
} as const;

export type KnowledgeProjectContextErrorCode =
  | "KNOWLEDGE_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "KNOWLEDGE_PROJECT_IS_PRIMARY"
  | "KNOWLEDGE_PROJECT_LINK_NOT_FOUND";

export class KnowledgeProjectContextError extends Error {
  constructor(
    readonly code: KnowledgeProjectContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeProjectContextError";
  }
}

export function requireSecondaryKnowledgeProject(
  primaryProjectId: string,
  targetProjectId: string,
) {
  if (primaryProjectId === targetProjectId)
    throw new KnowledgeProjectContextError(
      "KNOWLEDGE_PROJECT_IS_PRIMARY",
      "This is already the knowledge record's primary project",
    );
}
