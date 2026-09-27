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

export const systemRelationshipRegistry = {
  domainOwnership: {
    type: "owned_by",
    sourceKind: "system",
    targetKind: "domain",
    inverseType: "owns",
    maxActiveTargets: 1,
    traversal: "containment",
  },
  projectContext: {
    type: "relates_to",
    sourceKind: "system",
    targetKind: "project",
    inverseType: "relates_to",
    maxActiveTargets: null,
    traversal: "none",
  },
  resourceSupport: {
    type: "supports",
    sourceKind: "resource",
    targetKind: "system",
    inverseType: "supported_by",
    maxActiveTargets: null,
    traversal: "none",
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
