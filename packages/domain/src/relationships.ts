export const projectResourceRelationshipRegistry = {
  supports: {
    sourceKind: "resource",
    targetKind: "project",
    inverseType: "supported_by",
  },
  relates_to: {
    sourceKind: "project",
    targetKind: "resource",
    inverseType: "relates_to",
  },
} as const;

export type ProjectResourceRelationshipType =
  keyof typeof projectResourceRelationshipRegistry;

export function projectResourceRelationship(
  type: string,
): (typeof projectResourceRelationshipRegistry)[ProjectResourceRelationshipType] {
  if (!Object.hasOwn(projectResourceRelationshipRegistry, type)) {
    throw new Error(`Unsupported project-resource relationship: ${type}`);
  }
  return projectResourceRelationshipRegistry[
    type as ProjectResourceRelationshipType
  ];
}
