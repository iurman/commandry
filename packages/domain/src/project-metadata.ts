export const projectLifecycleValues = [
  "proposed",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type ProjectLifecycle = (typeof projectLifecycleValues)[number];

export type ProjectMetadata = {
  name: string;
  summary: string | null;
  type: string;
  lifecycle: ProjectLifecycle;
  version: number;
};

export type ProjectMetadataRevision = Omit<ProjectMetadata, "version"> & {
  expectedVersion: number;
};

export class ProjectMetadataConflictError extends Error {
  constructor() {
    super("Project changed since it was opened. Reload before saving.");
    this.name = "ProjectMetadataConflictError";
  }
}

export function prepareProjectMetadataRevision(
  current: ProjectMetadata,
  input: ProjectMetadataRevision,
) {
  if (input.expectedVersion !== current.version) {
    throw new ProjectMetadataConflictError();
  }
  const next = {
    name: input.name.trim(),
    summary: input.summary?.trim() || null,
    type: input.type.trim(),
    lifecycle: input.lifecycle,
    version: current.version + 1,
  } satisfies ProjectMetadata;
  if (
    !next.name ||
    next.name.length > 200 ||
    (next.summary?.length ?? 0) > 4000 ||
    !next.type ||
    next.type.length > 100 ||
    !projectLifecycleValues.includes(next.lifecycle)
  ) {
    throw new Error("Invalid project metadata");
  }
  const changedFields = (
    ["name", "summary", "type", "lifecycle"] as const
  ).filter((field) => current[field] !== next[field]);
  return {
    next: changedFields.length > 0 ? next : current,
    changedFields,
  };
}
