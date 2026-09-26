export class KnowledgeRevisionError extends Error {
  constructor(
    public readonly code: "KNOWLEDGE_NOT_FOUND" | "REVISION_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}

export function requireKnowledgeRevision(
  current: { version: number; title: string; content: string },
  input: { expectedVersion: number; title: string; content: string },
): void {
  if (
    current.version !== input.expectedVersion ||
    (current.title === input.title && current.content === input.content)
  ) {
    throw new KnowledgeRevisionError(
      "REVISION_CONFLICT",
      "Knowledge note changed or is already set; refresh before saving again",
    );
  }
}
