export type ProjectDecisionErrorCode =
  | "PROJECT_NOT_FOUND"
  | "DECISION_NOT_FOUND"
  | "DECISION_STALE"
  | "DECISION_FINAL";

export class ProjectDecisionError extends Error {
  constructor(
    readonly code: ProjectDecisionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProjectDecisionError";
  }
}

export function requireDecisionRevision(
  current: { revision: number; status: string },
  expectedRevision: number,
  nextStatus: string,
) {
  if (current.revision !== expectedRevision) {
    throw new ProjectDecisionError(
      "DECISION_STALE",
      "Decision changed since it was opened; reload before revising",
    );
  }
  if (current.status === "superseded") {
    throw new ProjectDecisionError(
      "DECISION_FINAL",
      "A superseded decision cannot be revised",
    );
  }
  if (current.status === "accepted" && nextStatus === "proposed") {
    throw new ProjectDecisionError(
      "DECISION_FINAL",
      "An accepted decision cannot return to proposed",
    );
  }
}
