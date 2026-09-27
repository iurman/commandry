export class WorkRelationError extends Error {
  constructor(
    public readonly code:
      | "WORK_NOT_FOUND"
      | "CROSS_PROJECT"
      | "RELATION_SELF"
      | "RELATION_EXISTS"
      | "PARENT_EXISTS"
      | "RELATION_CYCLE"
      | "RELATION_NOT_FOUND"
      | "RELATION_ARCHIVED",
    message: string,
  ) {
    super(message);
    this.name = "WorkRelationError";
  }
}

export function requireDistinctWorkRelation(
  sourceId: string,
  targetId: string,
) {
  if (sourceId === targetId) {
    throw new WorkRelationError(
      "RELATION_SELF",
      "A work item cannot relate to itself",
    );
  }
}
