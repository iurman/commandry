import { describe, expect, it, vi } from "vitest";
import { LocalAgentError } from "@commandry/domain";
import { createLocalAgentRoutingService } from "./local-agent-routing";

const packetId = "74b24060-76b8-4bb6-806b-664a04147952";
const projectId = "239d4964-47e3-47bd-878c-47c54dd0e2c4";
const agentId = "fb9dbb61-f302-4cb5-9319-3dca31c0cf2e";
const runId = "74762b1b-96b9-4f12-92c5-380e9509e99b";
const at = "2026-09-26T10:00:00.000Z";
const digest = "a".repeat(64);
const evidence = [projectId, packetId, agentId].map((id) => ({
  kind: "project" as const,
  id,
  href: `/api/v1/projects/${id}`,
  recordedAt: at,
  occurredAt: null,
  sourceLabel: "Synthetic local fixture",
  isSynthetic: true,
}));

function fixture() {
  const getLatestSucceededResult = vi.fn(async () => ({
    id: runId,
    completedAt: at,
    result: {
      summary: "Saved synthetic context review",
      contextReadIds: [crypto.randomUUID()],
      evidence,
      runtime: "local-fake-v1",
      isSynthetic: true,
      verificationStatus: "unverified",
      externalActions: [],
    },
  }));
  const port = {
    getPacketById: vi.fn(async () => ({
      id: packetId,
      contentDigest: digest,
      projectId,
    })),
    listAssignedCandidates: vi.fn(async () => ({
      items: [
        {
          agent: {
            id: agentId,
            name: "Local reviewer",
            role: null,
            runtime: "local-fake-v1" as const,
            sourceLabel: "Synthetic local agent" as const,
            isSynthetic: true as const,
            createdAt: at,
          },
          activeRunCount: 2,
        },
      ],
      nextCursor: null,
    })),
    isAssigned: vi.fn(async () => true),
    getLatestSucceededResult,
  };
  return { port, service: createLocalAgentRoutingService(port) };
}

describe("local agent routing and saved fake result", () => {
  it("explains only recorded project scope and manual fake dispatch", async () => {
    const { service } = fixture();
    const route = await service.listCandidates(packetId, { limit: 10 });
    expect(route.items).toHaveLength(1);
    expect(route.items[0]).toMatchObject({
      activeRunCount: 2,
      reason: "Assigned to this packet's project for scoped reads",
      readOperations: ["project.brief.read", "work.read"],
    });
    expect(route.dispatchMode).toBe("manual-fake-only");
    expect(route.unassessed).toEqual(["skills", "budget", "provider capacity"]);
  });

  it("bounds historical evidence and binds retrieval to the current packet digest", async () => {
    const { service, port } = fixture();
    const first = await service.getCachedResult(packetId, {
      agentId,
      limit: 2,
    });
    expect(first.result).toMatchObject({
      runId,
      packetDigest: digest,
      verificationStatus: "unverified",
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(2);
    const second = await service.getCachedResult(packetId, {
      agentId,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(port.getLatestSucceededResult).toHaveBeenCalledWith({
      packetId,
      packetDigest: digest,
      agentId,
    });
    await expect(
      service.getCachedResult(packetId, { agentId, limit: 2, cursor: 4 }),
    ).rejects.toMatchObject({ code: "INVALID_CACHE_CURSOR" });
  });

  it("refuses a removed assignment and never reads its saved result", async () => {
    const { service, port } = fixture();
    port.isAssigned.mockResolvedValueOnce(false);
    await expect(
      service.getCachedResult(packetId, { agentId, limit: 10 }),
    ).rejects.toBeInstanceOf(LocalAgentError);
    expect(port.getLatestSucceededResult).not.toHaveBeenCalled();
  });
});
