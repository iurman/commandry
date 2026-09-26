export const resourceRelationshipRegistry = {
  depends_on: {
    sourceKind: "resource",
    targetKind: "resource",
    inverseType: "required_by",
  },
} as const;

export class ResourceTopologyError extends Error {
  constructor(
    public readonly code:
      | "RESOURCE_NOT_FOUND"
      | "PARENT_NOT_FOUND"
      | "PARENT_CONFLICT"
      | "HIERARCHY_CYCLE"
      | "DEPENDENCY_SELF"
      | "DEPENDENCY_EXISTS",
    message: string,
  ) {
    super(message);
  }
}

export function requireAcyclicParent(
  resourceId: string,
  parentResourceId: string | null,
  ancestorIds: ReadonlySet<string>,
): void {
  if (
    parentResourceId === resourceId ||
    (parentResourceId && ancestorIds.has(resourceId))
  ) {
    throw new ResourceTopologyError(
      "HIERARCHY_CYCLE",
      "A resource cannot be its own ancestor",
    );
  }
}

export function requireDistinctDependency(
  dependentResourceId: string,
  requiredResourceId: string,
): void {
  if (dependentResourceId === requiredResourceId) {
    throw new ResourceTopologyError(
      "DEPENDENCY_SELF",
      "A resource cannot depend on itself",
    );
  }
}
