import { describe, expect, it, vi } from "vitest";
import type { LocalMcpSession, WorkItem } from "@commandry/contracts";
import { localMcpTokenDigest } from "@commandry/domain";
import { createLocalMcpService, type LocalMcpPort } from "./local-mcp";

const packetId = "378ac30c-b07b-4a87-a2f7-0ac7938d5e41";
const agentId = "92097f71-8fa3-452a-826f-b239c15e55cc";
const projectId = "b81f6938-e216-4e15-bc30-c2cb7d1f857d";
const workItemId = "2fa1320c-b68d-4796-9e75-a1e256590be2";
const createdAt = "2026-09-26T10:00:00.000Z";
const packet = {
  id: packetId,
  packetVersion: 2,
  contentDigest: "a".repeat(64),
  projectId,
  workItemId,
};
const work: WorkItem = {
  id: workItemId,
  projectId,
  sourceCaptureId: crypto.randomUUID(),
  title: "Review the saved packet",
  description: "Inspect source evidence",
  status: "open",
  createdAt,
  updatedAt: createdAt,
};

function fixture() {
  let saved: LocalMcpSession | null = null;
  let savedDigest: string | null = null;
  const port: LocalMcpPort = {
    getPacketById: vi.fn(async () => packet),
    getAgentById: vi.fn(async () => ({
      id: agentId,
      name: "Synthetic local agent",
      role: null,
      runtime: "local-fake-v1" as const,
      sourceLabel: "Synthetic local agent" as const,
      isSynthetic: true as const,
      createdAt,
    })),
    isAssigned: vi.fn(async () => true),
    create: vi.fn(async (input) => {
      savedDigest = input.tokenDigest;
      saved = {
        id: crypto.randomUUID(),
        packetId,
        packetVersion: input.packetVersion,
        packetDigest: input.packetDigest,
        agentId,
        projectId,
        workItemId,
        operations: ["project.brief.read", "work.read"],
        expiresAt: "2026-09-26T10:30:00.000Z",
        revokedAt: null,
        sourceLabel: "Local read-only MCP preview",
        createdAt,
      };
      return saved;
    }),
    getById: vi.fn(async () => saved),
    getByTokenDigest: vi.fn(async (digest) =>
      digest === savedDigest ? saved : null,
    ),
    list: vi.fn(async () => ({
      items: saved ? [saved] : [],
      nextCursor: null,
    })),
    revoke: vi.fn(async () => {
      if (!saved) throw new Error("Expected a saved session");
      saved = { ...saved, revokedAt: createdAt };
      return saved;
    }),
    recordAudit: vi.fn(async () => ({ id: crypto.randomUUID() })),
    listAudit: vi.fn(async () => ({ items: [], nextCursor: null })),
    getProjectBrief: vi.fn(async () => null),
    getWorkItem: vi.fn(async () => work),
  };
  return { port, savedDigest: () => savedDigest };
}

describe("local MCP sessions and scoped reads", () => {
  it("mints a one-time token, stores only its digest, and audits the exact work read", async () => {
    const { port, savedDigest } = fixture();
    const service = createLocalMcpService(
      port,
      1800,
      () => new Date("2026-09-26T10:05:00.000Z"),
    );
    const created = await service.createSession({ packetId, agentId });
    expect(created.token).toMatch(/^mcp_[A-Za-z0-9_-]{43}$/);
    expect(savedDigest()).toBe(localMcpTokenDigest(created.token));
    expect(JSON.stringify(await service.getById(created.id))).not.toContain(
      created.token,
    );
    const read = await service.read(created.token, {
      operation: "work.read",
      projectId,
      workItemId,
      reason: "Bearer sk_example",
    });
    expect(read.source).toMatchObject({
      kind: "work_item",
      id: workItemId,
      title: work.title,
      evidence: [{ id: workItemId, isSynthetic: false }],
    });
    expect(port.getWorkItem).toHaveBeenCalledWith(workItemId, projectId);
    expect(port.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: created.id,
        operation: "work.read",
        decision: "allowed",
        code: "CONTEXT_READ_ALLOWED",
      }),
    );
    expect(
      JSON.stringify(vi.mocked(port.recordAudit).mock.calls),
    ).not.toContain("sk_example");
  });

  it("rejects unassigned agents, wrong scope, expiry and revocation", async () => {
    const { port } = fixture();
    vi.mocked(port.isAssigned).mockResolvedValueOnce(false);
    const service = createLocalMcpService(
      port,
      1800,
      () => new Date("2026-09-26T10:05:00.000Z"),
    );
    await expect(
      service.createSession({ packetId, agentId }),
    ).rejects.toMatchObject({
      code: "AGENT_NOT_ASSIGNED",
    });
    const created = await service.createSession({ packetId, agentId });
    await expect(
      service.read(created.token, {
        operation: "work.read",
        projectId,
        workItemId: crypto.randomUUID(),
        reason: "wrong work",
      }),
    ).rejects.toMatchObject({ code: "WORK_SCOPE_DENIED" });
    await expect(
      service.read(created.token, {
        operation: "project.brief.read",
        projectId: crypto.randomUUID(),
        reason: "wrong project",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_SCOPE_DENIED" });
    expect(port.getWorkItem).not.toHaveBeenCalled();
    expect(port.recordAudit).toHaveBeenCalledTimes(2);
    const expiredService = createLocalMcpService(
      port,
      1800,
      () => new Date("2026-09-26T10:30:00.000Z"),
    );
    await expect(
      expiredService.authenticate(created.token),
    ).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
    await expect(
      expiredService.read(created.token, {
        operation: "work.read",
        projectId,
        workItemId,
        reason: "expired",
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    await service.revoke(created.id);
    await expect(service.authenticate(created.token)).rejects.toMatchObject({
      code: "SESSION_REVOKED",
    });
    expect(port.recordAudit).toHaveBeenCalledTimes(3);
  });
});
