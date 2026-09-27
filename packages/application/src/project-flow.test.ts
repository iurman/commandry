import { describe, expect, it, vi } from "vitest";
import {
  createProjectFlowService,
  ProjectFlowError,
  type ProjectFlowRawRow,
} from "./project-flow";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const otherProjectId = "1ef5d360-5d30-4863-a148-b4e4ba020101";
const agentId = "8f24f301-47fa-4ca8-8492-4264993c5025";
const resourceId = "cab264fd-a273-4b24-972f-cd112134a44d";
const at = "2026-09-27T10:00:00.000Z";
const runId = "3a11e8b9-97df-4831-924e-12d1e786775d";
const approvalId = "5b311f36-f474-4297-9e5a-aa396fe6d257";

const rows: ProjectFlowRawRow[] = [
  {
    id: runId,
    kind: "local_agent_run",
    occurredAt: at,
    recordedAt: at,
    title: "Harbor reader",
    state: "succeeded",
    detail: "unverified",
    sourceLabel: "Synthetic local fake agent run",
    isSynthetic: true,
    primaryId: agentId,
    primaryName: "Harbor reader",
    secondaryId: "96aa7133-d53d-41e4-af33-9fecc2b91721",
    secondaryName: "Execution packet v2",
  },
  {
    id: approvalId,
    kind: "simulated_approval",
    occurredAt: at,
    recordedAt: at,
    title: "Simulated resource restart proposal",
    state: "rejected",
    detail: "simulated-resource-restart/v1",
    sourceLabel: "Simulated local action proposal",
    isSynthetic: true,
    primaryId: resourceId,
    primaryName: "Harbor host",
    secondaryId: agentId,
    secondaryName: "Harbor reader",
  },
];

describe("project flow projection", () => {
  it("maps persisted run and approval to source-linked historical entries and pages", async () => {
    const listRaw = vi
      .fn()
      .mockResolvedValueOnce({ items: [rows[0]], hasMore: true })
      .mockResolvedValueOnce({ items: [rows[1]], hasMore: false });
    const service = createProjectFlowService({
      getProjectById: async () => ({ id: projectId, name: "Harbor" }),
      listRaw,
    });
    const first = await service.list(projectId, { limit: 1 });
    expect(first.mode).toBe("historical-local-snapshot");
    expect(first.items[0]).toMatchObject({
      sourceHref: `/api/v1/agent-runs/${runId}`,
      isSynthetic: true,
      related: [
        { href: `/api/v1/agents/${agentId}` },
        {
          href: "/api/v1/execution-packets/96aa7133-d53d-41e4-af33-9fecc2b91721",
        },
      ],
    });
    const second = await service.list(projectId, {
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items[0]).toMatchObject({
      sourceHref: `/api/v1/approvals/${approvalId}`,
      state: "rejected",
    });
    expect(second.nextCursor).toBeNull();
    expect(listRaw.mock.calls[1]?.[1]?.cursor).toMatchObject({
      projectId,
      id: runId,
    });
    await expect(
      service.list(otherProjectId, { limit: 1, cursor: first.nextCursor! }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("rejects bad cursors and missing projects", async () => {
    const service = createProjectFlowService({
      getProjectById: async (id) =>
        id === projectId ? { id, name: "Harbor" } : null,
      listRaw: async () => ({ items: [], hasMore: false }),
    });
    await expect(
      service.list(projectId, { limit: 10, cursor: "bad" }),
    ).rejects.toBeInstanceOf(ProjectFlowError);
    await expect(
      service.list(otherProjectId, { limit: 10 }),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
    });
  });
});
