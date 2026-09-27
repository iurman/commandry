export const resourceRelationshipRegistry = {
  depends_on: {
    sourceKind: "resource",
    targetKind: "resource",
    inverseType: "required_by",
  },
} as const;

export const RESOURCE_IMPACT_MAX_HOPS = 6;

export function explainResourceImpact(pathNames: string[]): string {
  const source = pathNames[0];
  const dependent = pathNames.at(-1);
  const hops = pathNames.length - 1;
  if (!source || !dependent || hops < 1) {
    throw new Error("A potential impact needs a recorded dependency path");
  }
  return `${dependent} is connected to ${source} by ${hops} manually recorded dependency ${hops === 1 ? "link" : "links"}. This is potential impact, not an observed outage.`;
}

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
