import { describe, expect, it, vi } from "vitest";
import { LocalAgentError } from "@commandry/domain";
import {
  createLocalAgentService,
  type LocalAgentRepository,
} from "./local-agents";

const agentId = "b431c966-08af-4fe1-ac50-af71594f1182";
const projectId = "c7f050e5-50e6-46d9-ac58-83054cb9b035";
const profile = {
  id: agentId,
  name: "Local reviewer",
  role: "Review context only",
  runtime: "local-fake-v1" as const,
  sourceLabel: "Synthetic local agent" as const,
  isSynthetic: true as const,
  createdAt: "2026-09-26T10:00:00.000Z",
};
const assignment = {
  id: "9c5db0a0-0ae0-40f0-8147-4397ce9b2df4",
  agentId,
  projectId,
  isSynthetic: true as const,
  createdAt: "2026-09-26T10:01:00.000Z",
};

function repository(): LocalAgentRepository {
  return {
    create: vi.fn(async () => profile),
    getById: vi.fn(async (id) => (id === agentId ? profile : null)),
    list: vi.fn(async () => ({ items: [profile], nextCursor: null })),
    projectExists: vi.fn(async (id) => id === projectId),
    assignProject: vi.fn(async () => assignment),
    listProjects: vi.fn(async () => ({
      items: [assignment],
      nextCursor: null,
    })),
    isAssigned: vi.fn(async () => false),
  };
}

describe("synthetic local agent profiles", () => {
  it("creates a labeled profile and validates project membership before assigning", async () => {
    const port = repository();
    const service = createLocalAgentService(port);
    expect(await service.create({ name: "Local reviewer" })).toEqual(profile);
    await expect(
      service.assignProject(agentId, { projectId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(port.assignProject).not.toHaveBeenCalled();
    expect(await service.assignProject(agentId, { projectId })).toEqual(
      assignment,
    );
  });

  it("rejects duplicate assignment and preserves cursor pages", async () => {
    const port = repository();
    port.isAssigned = vi.fn(async () => true);
    const service = createLocalAgentService(port);
    await expect(
      service.assignProject(agentId, { projectId }),
    ).rejects.toBeInstanceOf(LocalAgentError);
    await expect(
      service.assignProject(agentId, { projectId }),
    ).rejects.toMatchObject({ code: "ASSIGNMENT_EXISTS" });
    expect(await service.list({ limit: 1 })).toEqual({
      items: [profile],
      nextCursor: null,
    });
    expect(await service.listProjects(agentId, { limit: 1 })).toEqual({
      items: [assignment],
      nextCursor: null,
    });
  });
});
