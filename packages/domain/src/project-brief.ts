export const PROJECT_BRIEF_METHOD = "deterministic-local-v1" as const;
export const PROJECT_BRIEF_PREVIEW_LIMIT = 5;
export const NEXT_ACTION_RULE = "open-work-review-v1" as const;
export const PROJECT_BRIEF_EXCERPT_LENGTH = 240;

export function briefExcerpt(value: string): string {
  const characters = Array.from(value);
  return characters.length > PROJECT_BRIEF_EXCERPT_LENGTH
    ? `${characters.slice(0, PROJECT_BRIEF_EXCERPT_LENGTH).join("")}...`
    : value;
}

export function projectStateText(lifecycle: string): string {
  return `Project lifecycle is ${lifecycle}. This reflects the saved project record.`;
}

export function workFactText(status: string): string {
  return status === "open" ? "Open task" : "Completed task";
}

export function resourceFactText(state: string | null): string {
  return state === null
    ? "Observed health is unknown in Commandry."
    : `Saved resource state is ${state}.`;
}

export function briefMissing(message: string) {
  return { status: "not_recorded" as const, message };
}

export function nextActionForOpenWork(title: string): string {
  return `Review open task: ${title}`;
}

export function requireFactualEvidence(evidenceCount: number): void {
  if (evidenceCount < 1) {
    throw new Error(
      "A factual brief statement needs at least one source reference",
    );
  }
}
