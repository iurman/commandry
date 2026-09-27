import { describe, expect, it, vi } from "vitest";
import type {
  AgentContextReadResponse,
  LocalAgentRun,
} from "@commandry/contracts";
import {
  buildFakeLocalAgentRunResult,
  createLocalAgentRunControlService,
  createLocalAgentRunProcessor,
  createLocalAgentRunService,
  prepareLocalAgentRun,
  type LocalAgentRunProcessingPort,
  type LocalAgentRunSubmissionPort,
} from "./local-agent-runs";

const agentId = "fb9dbb61-f302-4cb5-9319-3dca31c0cf2e";
const packetId = "74b24060-76b8-4bb6-806b-664a04147952";
const projectId = "239d4964-47e3-47bd-878c-47c54dd0e2c4";
const workItemId = "488ea0f0-f1e2-4457-8445-ce469f930a54";
const runId = "74762b1b-96b9-4f12-92c5-380e9509e99b";
const occurredAt = "2026-09-26T10:00:00.000Z";
const packet = {
  id: packetId,
  packetVersion: 2,
  contentDigest: "a".repeat(64),
  workItemId,
  projectId,
};
const profile = {
  id: agentId,
  name: "Local reviewer",
  role: null,
  runtime: "local-fake-v1" as const,
  sourceLabel: "Synthetic local agent" as const,
  isSynthetic: true as const,
  createdAt: occurredAt,
};
const run: LocalAgentRun = {
  id: runId,
  occurrenceId: "once",
  agentId,
  packetId,
  packetVersion: 2,
  packetDigest: packet.contentDigest,
  workItemId,
  projectId,
  state: "queued",
  attempts: 0,
  attemptHistory: [],
  grant: {
    projectId,
    operations: ["project.brief.read", "work.read"],
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  },
  result: null,
  error: null,
  verificationStatus: "unverified",
  runtime: "local-fake-v1",
  sourceLabel: "Synthetic local agent",
  isSynthetic: true,
  externalActions: [],
  createdAt: occurredAt,
  startedAt: null,
  completedAt: null,
};
const projectEvidence = {
  kind: "project" as const,
  id: projectId,
  href: `/api/v1/projects/${projectId}`,
  recordedAt: occurredAt,
  occurredAt: null,
  sourceLabel: "Project record",
  isSynthetic: false,
};
const workEvidence = {
  kind: "work_item" as const,
  id: workItemId,
  href: `/api/v1/work-items/${workItemId}`,
  recordedAt: occurredAt,
  occurredAt: null,
  sourceLabel: "Manual local capture",
  isSynthetic: false,
};
function read(
  operation: "project.brief.read" | "work.read",
): AgentContextReadResponse {
  const brief = operation === "project.brief.read";
  return {
    runId,
    projectId,
    operation,
    readAt: occurredAt,
    sensitivity: "unclassified-local-data",
    isSynthetic: true,
    auditId: crypto.randomUUID(),
    source: {
      kind: brief ? "project_brief" : "work_item",
      id: brief ? projectId : workItemId,
      title: brief ? "Project Alpha" : "Authorization: Bearer sk_example",
      summary: "Local context",
      href: brief
        ? `/api/v1/projects/${projectId}/brief`
        : `/api/v1/work-items/${workItemId}`,
      recordedAt: occurredAt,
      sourceLabel: brief
        ? "Deterministic local project brief"
        : "Manual local capture",
      isSynthetic: false,
      brief: null,
      evidence: [brief ? projectEvidence : workEvidence],
    },
  };
}

describe("packet-bound local fake runs", () => {
  it("prepares a stable packet and agent fingerprint without mutating the packet", () => {
    const first = prepareLocalAgentRun(packet, {
      agentId,
      occurrenceId: "once",
    });
    const second = prepareLocalAgentRun(packet, {
      agentId,
      occurrenceId: "another",
    });
    expect(first.requestFingerprint).toBe(second.requestFingerprint);
    expect(first).toMatchObject({
      packetId,
      packetDigest: packet.contentDigest,
      projectId,
      grantTtlSeconds: 1800,
    });
    expect(first.grantOperations).toEqual(["project.brief.read", "work.read"]);
    expect(packet).toEqual({
      id: packetId,
      packetVersion: 2,
      contentDigest: "a".repeat(64),
      workItemId,
      projectId,
    });
  });

  it("requires project assignment before queue submission", async () => {
    const port: LocalAgentRunSubmissionPort = {
      getPacketById: vi.fn(async () => packet),
      getAgentById: vi.fn(async () => profile),
      isAssigned: vi.fn(async () => false),
      submitOnce: vi.fn(async () => run),
      getById: vi.fn(async () => run),
    };
    const service = createLocalAgentRunService(port);
    await expect(
      service.submit(packetId, { agentId, occurrenceId: "once" }),
    ).rejects.toMatchObject({ code: "AGENT_NOT_ASSIGNED" });
    expect(port.submitOnce).not.toHaveBeenCalled();
    port.isAssigned = vi.fn(async () => true);
    expect(
      await service.submit(packetId, { agentId, occurrenceId: "once" }),
    ).toEqual(run);
  });

  it("builds an explicitly unverified result with exact evidence and zero actions", () => {
    const result = buildFakeLocalAgentRunResult(
      read("project.brief.read"),
      read("work.read"),
    );
    expect(result).toMatchObject({
      runtime: "local-fake-v1",
      isSynthetic: true,
      verificationStatus: "unverified",
      externalActions: [],
    });
    expect(result.evidence.map((item) => item.href)).toEqual([
      projectEvidence.href,
      workEvidence.href,
    ]);
    expect(result.summary).toContain("No task was executed or verified");
    expect(result.summary).not.toContain("sk_example");
  });

  it("uses audited scoped reads during processing and returns success on redelivery", async () => {
    const context = {
      read: vi.fn(async (_runId: string, request: { operation: string }) =>
        read(request.operation as "project.brief.read" | "work.read"),
      ),
    };
    const port: LocalAgentRunProcessingPort = {
      getById: vi.fn(async () => run),
      beginAttempt: vi.fn(async () => crypto.randomUUID()),
      complete: vi.fn(async (_runId, _attemptId, result) => ({
        ...run,
        state: "succeeded" as const,
        result,
      })),
      failAttempt: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => true),
    };
    const process = createLocalAgentRunProcessor(port, context);
    const succeeded = await process({
      version: 1,
      runId,
      occurrenceId: "once",
    });
    expect(succeeded.result?.contextReadIds).toHaveLength(2);
    expect(context.read).toHaveBeenCalledTimes(2);
    expect(port.reportProgress).toHaveBeenCalledTimes(3);
    expect(port.failAttempt).not.toHaveBeenCalled();
    port.getById = vi.fn(async () => succeeded);
    expect(await process({ version: 1, runId, occurrenceId: "once" })).toEqual(
      succeeded,
    );
    expect(port.beginAttempt).toHaveBeenCalledTimes(1);
  });

  it("records a failed attempt when a scoped source read fails", async () => {
    const failure = new Error("Scoped brief unavailable");
    const context = {
      read: vi.fn(async () => {
        throw failure;
      }),
    };
    const port: LocalAgentRunProcessingPort = {
      getById: vi.fn(async () => run),
      beginAttempt: vi.fn(async () => "5de9b241-27b3-4d57-bda1-26c774a498a5"),
      complete: vi.fn(async () => run),
      failAttempt: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => true),
    };
    const process = createLocalAgentRunProcessor(port, context);
    await expect(
      process({ version: 1, runId, occurrenceId: "once" }),
    ).rejects.toThrow("Scoped brief unavailable");
    expect(port.failAttempt).toHaveBeenCalledWith(
      runId,
      "5de9b241-27b3-4d57-bda1-26c774a498a5",
      "Scoped brief unavailable",
    );
    expect(port.complete).not.toHaveBeenCalled();
  });

  it("returns the recorded state from a local cancel callback", async () => {
    const cancel = vi.fn(async () => ({ ...run, state: "canceled" as const }));
    const control = createLocalAgentRunControlService({
      getById: vi.fn(async () => run),
      cancel,
    });
    expect((await control.cancel(runId)).state).toBe("canceled");
    expect(cancel).toHaveBeenCalledWith(runId);
  });
});
