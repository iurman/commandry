import { describe, expect, it, vi } from "vitest";
import {
  createProjectAgentFindingsService,
  type ProjectAgentFindingRow,
} from "./project-agent-findings";

const projectId = "0ef5d360-5d30-4863-a148-b4e4ba020101";
const otherProjectId = "1ef5d360-5d30-4863-a148-b4e4ba020101";
const runId = "3a11e8b9-97df-4831-924e-12d1e786775d";
const sourceId = "cab264fd-a273-4b24-972f-cd112134a44d";
const row: ProjectAgentFindingRow = {
  runId,
  projectId,
  agentId: "8f24f301-47fa-4ca8-8492-4264993c5025",
  agentName: "Harbor reader",
  workItemId: "0ef5d360-5d30-4863-a148-b4e4ba020102",
  workTitle: "Review monitor",
  packetId: "96aa7133-d53d-41e4-af33-9fecc2b91721",
  packetDigest: "a".repeat(64),
  completedAt: "2026-09-27T10:00:00.000Z",
  result: {
    summary: "Fake run read the exact packet.",
    contextReadIds: ["0ef5d360-5d30-4863-a148-b4e4ba020102"],
    evidence: [
      {
        kind: "event",
        id: sourceId,
        href: `/api/v1/events/${sourceId}`,
        recordedAt: "2026-09-27T09:00:00.000Z",
        occurredAt: "2026-09-27T08:55:00.000Z",
        sourceLabel: "Synthetic operational fixture",
        isSynthetic: true,
      },
    ],
    runtime: "local-fake-v1",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  },
};

describe("project cached agent findings", () => {
  it("pages exact packet-bound fake results with evidence and project scope", async () => {
    const listRows = vi
      .fn()
      .mockResolvedValueOnce({ items: [row], hasMore: true })
      .mockResolvedValueOnce({ items: [], hasMore: false });
    const service = createProjectAgentFindingsService({
      projectExists: async () => true,
      cursorExists: async (scope, cursor) =>
        scope === projectId && cursor === runId,
      listRows,
    });
    const first = await service.list(projectId, { limit: 1 });
    expect(first.nextCursor).toBe(runId);
    expect(first.items[0]).toMatchObject({
      projectId,
      runId,
      packetDigest: "a".repeat(64),
      summary: "Fake run read the exact packet.",
      evidenceCount: 1,
      evidence: [{ href: `/api/v1/events/${sourceId}`, isSynthetic: true }],
      sourceHref: `/api/v1/agent-runs/${runId}`,
      sourceLabel: "Saved synthetic local fake-run result",
      isSynthetic: true,
      verificationStatus: "unverified",
    });
    const second = await service.list(projectId, {
      limit: 1,
      cursor: first.nextCursor!,
    });
    expect(second.items).toEqual([]);
    expect(listRows.mock.calls[1]?.[1]).toEqual({ limit: 1, cursor: runId });
    await expect(
      service.list(otherProjectId, { limit: 1, cursor: runId }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("rejects a missing project and leaked rows", async () => {
    const service = createProjectAgentFindingsService({
      projectExists: async (scope) => scope === projectId,
      cursorExists: async () => true,
      listRows: async () => ({
        items: [{ ...row, projectId: otherProjectId }],
        hasMore: false,
      }),
    });
    await expect(
      service.list(otherProjectId, { limit: 10 }),
    ).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
    });
    await expect(service.list(projectId, { limit: 10 })).rejects.toThrow(
      "belongs to another project",
    );
  });
});
