import type {
  CreateResourceDependencyRequest,
  ResourceDependency,
  ResourceSummary,
  SetResourceParentRequest,
} from "@commandry/contracts";
import {
  requireAcyclicParent,
  requireDistinctDependency,
} from "@commandry/domain";

export type ResourceTopologyPage<T> = {
  items: T[];
  nextCursor: string | null;
};
export type ResourceTopologyPageQuery = {
  limit: number;
  cursor?: string | undefined;
};

export interface ResourceTopologyPort {
  setParent(
    resourceId: string,
    input: SetResourceParentRequest,
  ): Promise<ResourceSummary>;
  listRoots(
    query: ResourceTopologyPageQuery,
  ): Promise<ResourceTopologyPage<ResourceSummary>>;
  listChildren(
    resourceId: string,
    query: ResourceTopologyPageQuery,
  ): Promise<ResourceTopologyPage<ResourceSummary>>;
  addDependency(
    resourceId: string,
    input: CreateResourceDependencyRequest,
  ): Promise<ResourceDependency>;
  listDependencies(
    resourceId: string,
    query: ResourceTopologyPageQuery & {
      direction: "outgoing" | "incoming";
    },
  ): Promise<ResourceTopologyPage<ResourceDependency>>;
}

export function createResourceTopologyService(port: ResourceTopologyPort) {
  return {
    async setParent(resourceId: string, input: SetResourceParentRequest) {
      requireAcyclicParent(resourceId, input.parentResourceId, new Set());
      return port.setParent(resourceId, input);
    },
    listRoots: port.listRoots,
    listChildren: port.listChildren,
    async addDependency(
      resourceId: string,
      input: CreateResourceDependencyRequest,
    ) {
      requireDistinctDependency(resourceId, input.requiredResourceId);
      return port.addDependency(resourceId, input);
    },
    listDependencies: port.listDependencies,
  };
}
