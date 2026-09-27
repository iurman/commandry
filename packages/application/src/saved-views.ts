import type {
  SavedView,
  SavedViewAuditEvent,
  SavedViewDefinition,
} from "@commandry/contracts";
import { SavedViewError } from "@commandry/domain";

export interface SavedViewPort {
  projectExists(projectId: string): Promise<boolean>;
  get(id: string): Promise<SavedView | null>;
  list(input: {
    surface: "work" | "knowledge";
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: SavedView[]; nextCursor: string | null }>;
  create(input: {
    id: string;
    name: string;
    definition: SavedViewDefinition;
  }): Promise<SavedView>;
  update(input: {
    id: string;
    expectedVersion: number;
    name: string;
    definition: SavedViewDefinition;
  }): Promise<SavedView>;
  archive(id: string, expectedVersion: number): Promise<SavedView>;
  listAudit(input: {
    id: string;
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: SavedViewAuditEvent[]; nextCursor: string | null }>;
}

export function createSavedViewService(port: SavedViewPort) {
  async function requireProject(definition: SavedViewDefinition) {
    if (
      definition.projectId &&
      !(await port.projectExists(definition.projectId))
    )
      throw new SavedViewError("PROJECT_NOT_FOUND", "Project not found");
  }
  async function requireActive(id: string, expectedVersion?: number) {
    const current = await port.get(id);
    if (!current)
      throw new SavedViewError("SAVED_VIEW_NOT_FOUND", "Saved view not found");
    if (current.lifecycle !== "active")
      throw new SavedViewError("SAVED_VIEW_ARCHIVED", "Saved view is archived");
    if (expectedVersion && current.version !== expectedVersion)
      throw new SavedViewError(
        "SAVED_VIEW_CONFLICT",
        "Saved view changed since it was opened",
      );
    return current;
  }
  return {
    get: port.get,
    list: port.list,
    async create(input: { name: string; definition: SavedViewDefinition }) {
      await requireProject(input.definition);
      return port.create({ id: crypto.randomUUID(), ...input });
    },
    async update(
      id: string,
      input: {
        expectedVersion: number;
        name: string;
        definition: SavedViewDefinition;
      },
    ) {
      const current = await requireActive(id, input.expectedVersion);
      if (current.definition.surface !== input.definition.surface)
        throw new SavedViewError(
          "SAVED_VIEW_SURFACE_IMMUTABLE",
          "Saved view surface cannot change",
        );
      await requireProject(input.definition);
      return port.update({ id, ...input });
    },
    async archive(id: string, expectedVersion: number) {
      await requireActive(id, expectedVersion);
      return port.archive(id, expectedVersion);
    },
    async listAudit(input: {
      id: string;
      limit: number;
      cursor?: string | undefined;
    }) {
      if (!(await port.get(input.id)))
        throw new SavedViewError(
          "SAVED_VIEW_NOT_FOUND",
          "Saved view not found",
        );
      return port.listAudit(input);
    },
  };
}
