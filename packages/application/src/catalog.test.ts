import { describe, expect, it } from "vitest";
import type { ProjectSummary, ResourceSummary } from "@commandry/contracts";
import {
  defaultProjectPresentation,
  ProjectPresentationConflictError,
} from "@commandry/domain";
import {
  CatalogError,
  createCatalogService,
  type CatalogRepository,
} from "./catalog";

const project: ProjectSummary = {
  id: "48401dbc-26ee-4c68-b7f5-e5360b504dc0",
  name: "Garden",
  summary: null,
  type: "general",
  lifecycle: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const resource: ResourceSummary = {
  id: "9235b672-c3ba-4bb8-83e6-e2add0035c89",
  kind: "document",
  name: "Garden plan",
  subtype: null,
  parentResourceId: null,
  state: null,
  externalUrl: null,
  lastObservedAt: null,
};

function port(overrides: Partial<CatalogRepository> = {}): CatalogRepository {
  return {
    createProject: async () => project,
    getProject: async () => project,
    listProjects: async () => ({ items: [project], nextCursor: null }),
    updateProject: async () => project,
    listProjectMetadataEvents: async () => ({ items: [], nextCursor: null }),
    getProjectMetadataEvent: async () => null,
    getProjectPresentation: async () => defaultProjectPresentation,
    updateProjectPresentation: async () => defaultProjectPresentation,
    listProjectPresentationEvents: async () => ({
      items: [],
      nextCursor: null,
    }),
    getProjectPresentationEvent: async () => null,
    createResource: async () => resource,
    getResource: async () => resource,
    listResources: async () => ({ items: [resource], nextCursor: null }),
    insertProjectResourceLink: async () => true,
    listProjectResourceLinks: async () => ({ items: [], nextCursor: null }),
    ...overrides,
  };
}

describe("catalog application", () => {
  it("keeps project view conflicts distinct from missing projects", async () => {
    const revision = {
      expectedVersion: 1,
      overviewCards: ["state"] as const,
      visibleAreas: ["work"] as const,
    };
    const missing = createCatalogService(
      port({ getProjectPresentation: async () => null }),
    );
    await expect(
      missing.getProjectPresentation(project.id),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
    });
    const stale = createCatalogService(
      port({
        updateProjectPresentation: async () => {
          throw new ProjectPresentationConflictError();
        },
      }),
    );
    await expect(
      stale.updateProjectPresentation(project.id, {
        ...revision,
        overviewCards: [...revision.overviewCards],
        visibleAreas: [...revision.visibleAreas],
      }),
    ).rejects.toMatchObject({ code: "PROJECT_VERSION_CONFLICT" });
  });

  it("uses the registered direction and inverse for a resource supporting a project", async () => {
    let direction: unknown;
    const service = createCatalogService(
      port({
        insertProjectResourceLink: async (input) => {
          direction = [input.sourceKind, input.targetKind];
          return true;
        },
      }),
    );
    const link = await service.linkProjectResource(project.id, {
      resourceId: resource.id,
      type: "supports",
    });
    expect(direction).toEqual(["resource", "project"]);
    expect(link).toMatchObject({
      type: "supports",
      inverseType: "supported_by",
      resource,
    });
  });

  it("rejects missing endpoints before an edge is written", async () => {
    let writes = 0;
    const service = createCatalogService(
      port({
        getResource: async () => null,
        insertProjectResourceLink: async () => {
          writes += 1;
          return true;
        },
      }),
    );
    await expect(
      service.linkProjectResource(project.id, {
        resourceId: resource.id,
        type: "relates_to",
      }),
    ).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    } satisfies Partial<CatalogError>);
    expect(writes).toBe(0);
  });

  it("returns an explicit conflict for a duplicate edge", async () => {
    const service = createCatalogService(
      port({ insertProjectResourceLink: async () => false }),
    );
    await expect(
      service.linkProjectResource(project.id, {
        resourceId: resource.id,
        type: "relates_to",
      }),
    ).rejects.toMatchObject({
      code: "LINK_EXISTS",
    } satisfies Partial<CatalogError>);
  });
});
