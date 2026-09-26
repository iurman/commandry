import { describe, expect, it, vi } from "vitest";
import type { ProjectBrief, WorkItem } from "@commandry/contracts";
import type { LocalAgentAuthorization } from "@commandry/domain";
import {
  createAgentContextService,
  type AgentContextPort,
} from "./agent-context";
import { assembleProjectBrief } from "./project-brief";

const runId = "378ac30c-b07b-4a87-a2f7-0ac7938d5e41";
const agentId = "92097f71-8fa3-452a-826f-b239c15e55cc";
const projectId = "b81f6938-e216-4e15-bc30-c2cb7d1f857d";
const workItemId = "2fa1320c-b68d-4796-9e75-a1e256590be2";
const recordedAt = "2026-09-26T09:00:00.000Z";
const auth: LocalAgentAuthorization = {
  runId,
  agentId,
  packetId: crypto.randomUUID(),
  workItemId,
  projectId,
  state: "running",
  grants: [
    {
      projectId,
      operation: "project.brief.read",
      expiresAt: "2026-09-26T11:00:00.000Z",
    },
    {
      projectId,
      operation: "work.read",
      expiresAt: "2026-09-26T11:00:00.000Z",
    },
  ],
};
const evidence = {
  kind: "project" as const,
  id: projectId,
  href: `/api/v1/projects/${projectId}`,
  recordedAt,
  occurredAt: null,
  sourceLabel: "Project record",
  isSynthetic: false,
};
const work = {
  id: workItemId,
  projectId,
  sourceCaptureId: crypto.randomUUID(),
  title: "Inspect logs",
  description: "Review local evidence",
  status: "open" as const,
  createdAt: recordedAt,
  updatedAt: recordedAt,
} satisfies WorkItem;
const knowledgeId = "93950ddc-a9f6-48a7-a92c-2ddd0593adae";
const brief: ProjectBrief = assembleProjectBrief(
  {
    asOf: "2026-09-26T09:30:00.000Z",
    project: {
      id: projectId,
      name: "Project Alpha",
      summary: "Local project",
      type: "software",
      lifecycle: "active",
      createdAt: recordedAt,
      updatedAt: recordedAt,
    },
    work: { items: [work], nextCursor: null },
    knowledge: {
      items: [
        {
          id: knowledgeId,
          projectId,
          sourceCaptureId: crypto.randomUUID(),
          kind: "note",
          title: "Review note",
          content: "Known context",
          createdAt: recordedAt,
          updatedAt: recordedAt,
        },
      ],
      nextCursor: null,
    },
    resources: { items: [], nextCursor: null },
    events: { items: [], nextCursor: null },
    attention: { items: [], nextCursor: null },
  },
  "2026-09-26T10:00:00.000Z",
);

function port(): AgentContextPort {
  return {
    getAuthorization: vi.fn(async () => auth),
    getProjectBrief: vi.fn(async () => brief),
    getWorkItem: vi.fn(async () => work),
    recordAudit: vi.fn(async (input) => ({
      id: crypto.randomUUID(),
      runId: input.runId,
      actor: "local-agent",
      operation: input.operation,
      projectId: input.projectId,
      decision: input.decision,
      code: input.code,
      reason: input.reason,
      createdAt: input.createdAt,
    })),
    listAudit: vi.fn(async () => ({ items: [], nextCursor: null })),
  };
}

describe("audited local agent context reads", () => {
  it("returns only scoped brief and work evidence with persisted source times", async () => {
    const adapter = port();
    const service = createAgentContextService(
      adapter,
      () => new Date("2026-09-26T10:00:00.000Z"),
    );
    const briefRead = await service.read(runId, {
      projectId,
      operation: "project.brief.read",
      reason: "Inspect context",
    });
    const workRead = await service.read(
      runId,
      {
        projectId,
        operation: "work.read",
        reason: "Authorization: Bearer sk_example",
      },
      "manual-local-reviewer",
    );
    expect(briefRead).toMatchObject({
      isSynthetic: true,
      source: { kind: "project_brief", recordedAt },
    });
    expect(briefRead.source.evidence).toContainEqual(evidence);
    expect(briefRead.source.brief?.sections.work.items).toHaveLength(1);
    expect(briefRead.source.brief?.sections.knowledge.items).toHaveLength(1);
    expect(briefRead.source.evidence.map((item) => item.href)).toContain(
      `/api/v1/knowledge-items/${knowledgeId}`,
    );
    expect(workRead.source).toMatchObject({
      kind: "work_item",
      id: workItemId,
      recordedAt,
      summary: "Review local evidence",
    });
    expect(adapter.getWorkItem).toHaveBeenCalledWith(workItemId, projectId);
    expect(adapter.recordAudit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(adapter.recordAudit).mock.calls[0]?.[0]).toMatchObject({
      decision: "allowed",
      code: "CONTEXT_READ_ALLOWED",
      origin: "worker-agent",
    });
    expect(vi.mocked(adapter.recordAudit).mock.calls[1]?.[0]).toMatchObject({
      origin: "manual-local-reviewer",
      reason: "Manual local context read; supplied reason withheld",
    });
  });

  it("audits wrong project, arbitrary operation, terminal state and expiry", async () => {
    const adapter = port();
    const service = createAgentContextService(
      adapter,
      () => new Date("2026-09-26T10:00:00.000Z"),
    );
    await expect(
      service.read(runId, {
        projectId: crypto.randomUUID(),
        operation: "work.read",
        reason: "token=SECRET",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_SCOPE_DENIED" });
    await expect(
      service.read(runId, {
        projectId,
        operation: "Authorization: Bearer sk_example",
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "OPERATION_DENIED" });
    vi.mocked(adapter.getAuthorization).mockResolvedValueOnce({
      ...auth,
      state: "succeeded",
    });
    await expect(
      service.read(runId, {
        projectId,
        operation: "work.read",
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "RUN_NOT_ACTIVE" });
    vi.mocked(adapter.getAuthorization).mockResolvedValueOnce({
      ...auth,
      grants: auth.grants.map((grant) => ({
        ...grant,
        expiresAt: "2026-09-26T10:00:00.000Z",
      })),
    });
    await expect(
      service.read(runId, {
        projectId,
        operation: "work.read",
        reason: "Test",
      }),
    ).rejects.toMatchObject({ code: "GRANT_EXPIRED" });
    expect(adapter.recordAudit).toHaveBeenCalledTimes(4);
    expect(
      vi.mocked(adapter.recordAudit).mock.calls[0]?.[0].reason,
    ).not.toContain("SECRET");
    expect(vi.mocked(adapter.recordAudit).mock.calls[1]?.[0].operation).toBe(
      "unrecognized.operation",
    );
    expect(adapter.getWorkItem).not.toHaveBeenCalled();
  });
});
