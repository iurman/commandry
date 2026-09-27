export const projectOverviewCardIds = [
  "state",
  "work",
  "knowledge",
  "decisions",
  "systems",
  "resources",
  "activity",
  "attention",
] as const;

export const projectAreaIds = [
  "systems",
  "resources",
  "metrics",
  "work",
  "knowledge",
  "decisions",
] as const;

export type ProjectOverviewCardId = (typeof projectOverviewCardIds)[number];
export type ProjectAreaId = (typeof projectAreaIds)[number];

export type ProjectPresentation = {
  version: number;
  overviewCards: ProjectOverviewCardId[];
  visibleAreas: ProjectAreaId[];
};

export type ProjectPresentationRevision = {
  expectedVersion: number;
  overviewCards: ProjectOverviewCardId[];
  visibleAreas: ProjectAreaId[];
};

export const defaultProjectPresentation: ProjectPresentation = {
  version: 1,
  overviewCards: ["state", "work", "activity", "attention"],
  visibleAreas: [...projectAreaIds],
};

export class ProjectPresentationConflictError extends Error {
  constructor() {
    super("Project view changed since it was opened. Reload before saving.");
    this.name = "ProjectPresentationConflictError";
  }
}

function validUniqueSubset<T extends string>(
  items: readonly T[],
  allowed: readonly T[],
) {
  return (
    items.length <= allowed.length &&
    new Set(items).size === items.length &&
    items.every((item) => allowed.includes(item))
  );
}

export function prepareProjectPresentationRevision(
  current: ProjectPresentation,
  input: ProjectPresentationRevision,
) {
  if (current.version !== input.expectedVersion) {
    throw new ProjectPresentationConflictError();
  }
  if (
    !validUniqueSubset(input.overviewCards, projectOverviewCardIds) ||
    !validUniqueSubset(input.visibleAreas, projectAreaIds)
  ) {
    throw new Error("Invalid project presentation");
  }
  const changed =
    current.overviewCards.join("\0") !== input.overviewCards.join("\0") ||
    current.visibleAreas.join("\0") !== input.visibleAreas.join("\0");
  return changed
    ? {
        version: current.version + 1,
        overviewCards: [...input.overviewCards],
        visibleAreas: [...input.visibleAreas],
      }
    : current;
}
