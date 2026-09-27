import type {
  CreateProjectRequest,
  CreateProjectResourceLinkRequest,
  CreateResourceRequest,
  ProjectMetadataEvent,
  ProjectResourceLink,
  ProjectSummary,
  ResourceSummary,
  UpdateProjectRequest,
} from "@commandry/contracts";
import {
  ProjectMetadataConflictError,
  projectResourceRelationship,
} from "@commandry/domain";

export type CatalogPage<T> = { items: T[]; nextCursor: string | null };
export type CatalogPageQuery = { limit: number; cursor?: string | undefined };

export interface CatalogRepository {
  createProject(
    input: CreateProjectRequest & { id: string },
  ): Promise<ProjectSummary>;
  getProject(id: string): Promise<ProjectSummary | null>;
  listProjects(query: CatalogPageQuery): Promise<CatalogPage<ProjectSummary>>;
  updateProject(
    id: string,
    input: UpdateProjectRequest,
  ): Promise<ProjectSummary | null>;
  listProjectMetadataEvents(
    id: string,
    query: { limit: number; beforeVersion?: number },
  ): Promise<{ items: ProjectMetadataEvent[]; nextCursor: number | null }>;
  getProjectMetadataEvent(
    id: string,
    version: number,
  ): Promise<ProjectMetadataEvent | null>;
  createResource(
    input: CreateResourceRequest & { id: string },
  ): Promise<ResourceSummary>;
  getResource(id: string): Promise<ResourceSummary | null>;
  listResources(query: CatalogPageQuery): Promise<CatalogPage<ResourceSummary>>;
  insertProjectResourceLink(input: {
    id: string;
    projectId: string;
    resourceId: string;
    type: CreateProjectResourceLinkRequest["type"];
    sourceKind: "project" | "resource";
    targetKind: "project" | "resource";
  }): Promise<boolean>;
  listProjectResourceLinks(
    projectId: string,
    query: CatalogPageQuery,
  ): Promise<CatalogPage<ProjectResourceLink>>;
}

export class CatalogError extends Error {
  constructor(
    public readonly code:
      | "PROJECT_NOT_FOUND"
      | "PROJECT_VERSION_CONFLICT"
      | "RESOURCE_NOT_FOUND"
      | "LINK_EXISTS",
    message: string,
  ) {
    super(message);
  }
}

export function createCatalogService(repository: CatalogRepository) {
  return {
    createProject(input: CreateProjectRequest) {
      return repository.createProject({ ...input, id: crypto.randomUUID() });
    },
    getProject(id: string) {
      return repository.getProject(id);
    },
    listProjects(query: CatalogPageQuery) {
      return repository.listProjects(query);
    },
    async updateProject(id: string, input: UpdateProjectRequest) {
      try {
        const updated = await repository.updateProject(id, input);
        if (!updated) {
          throw new CatalogError("PROJECT_NOT_FOUND", "Project not found");
        }
        return updated;
      } catch (error) {
        if (error instanceof ProjectMetadataConflictError) {
          throw new CatalogError("PROJECT_VERSION_CONFLICT", error.message);
        }
        throw error;
      }
    },
    async listProjectMetadataEvents(
      id: string,
      query: { limit: number; beforeVersion?: number },
    ) {
      if (!(await repository.getProject(id))) {
        throw new CatalogError("PROJECT_NOT_FOUND", "Project not found");
      }
      return repository.listProjectMetadataEvents(id, query);
    },
    getProjectMetadataEvent(id: string, version: number) {
      return repository.getProjectMetadataEvent(id, version);
    },
    createResource(input: CreateResourceRequest) {
      return repository.createResource({ ...input, id: crypto.randomUUID() });
    },
    getResource(id: string) {
      return repository.getResource(id);
    },
    listResources(query: CatalogPageQuery) {
      return repository.listResources(query);
    },
    async linkProjectResource(
      projectId: string,
      input: CreateProjectResourceLinkRequest,
    ): Promise<ProjectResourceLink> {
      const [project, resource] = await Promise.all([
        repository.getProject(projectId),
        repository.getResource(input.resourceId),
      ]);
      if (!project)
        throw new CatalogError("PROJECT_NOT_FOUND", "Project not found");
      if (!resource)
        throw new CatalogError("RESOURCE_NOT_FOUND", "Resource not found");

      const definition = projectResourceRelationship(input.type);
      const id = crypto.randomUUID();
      const inserted = await repository.insertProjectResourceLink({
        id,
        projectId,
        resourceId: resource.id,
        type: input.type,
        sourceKind: definition.sourceKind,
        targetKind: definition.targetKind,
      });
      if (!inserted)
        throw new CatalogError("LINK_EXISTS", "Relationship already exists");
      return {
        id,
        type: input.type,
        inverseType: definition.inverseType,
        resource,
      };
    },
    async listProjectResourceLinks(projectId: string, query: CatalogPageQuery) {
      if (!(await repository.getProject(projectId))) {
        throw new CatalogError("PROJECT_NOT_FOUND", "Project not found");
      }
      return repository.listProjectResourceLinks(projectId, query);
    },
  };
}
