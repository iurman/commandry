import { describe, expect, it, vi } from "vitest";
import type {
  ExecutionPacket,
  LocalAgentRun,
  SimulatedApproval,
} from "@commandry/contracts";
import { buildExecutionPacketContents } from "./execution-packets";
import {
  createSimulatedApprovalProcessor,
  createSimulatedApprovalService,
  digestSimulatedApprovalDescriptor,
  fingerprintSimulatedActionRequest,
  prepareSimulatedApproval,
  type SimulatedApprovalPort,
  type SimulatedApprovalProcessingPort,
  type SimulatedApprovalTargetLink,
} from "./simulated-approvals";

const now = "2026-09-26T10:00:00.000Z";
const projectId = "0fd926eb-4938-4f04-bada-498b1aeff8a9";
const resourceId = "33704fe1-9ca5-4f5c-98a0-690d7b9dd1f6";
const linkId = "41003539-e402-4fd0-8a35-870071aa199e";
const runId = "0742e96c-120f-492d-b139-878a62e04cb3";
const agentId = "5655f5d2-4ab4-4924-a812-056596788da8";
const packetId = "b428d5b3-74cf-4c74-a447-65c9cc7f859c";
const workItemId = "cd3b26a9-c01e-4a71-8afb-e23c5c3460a9";
const captureId = "ca40c967-3c0b-4e1a-a22a-3e12898053df";
const approvalId = "e5f59705-01cc-4a2d-8174-a755c9af9a8b";

const built = buildExecutionPacketContents({
  id: packetId,
  packetVersion: 2,
  generatedAt: now,
  project: {
    id: projectId,
    name: "Local lab",
    summary: null,
    type: "general",
    lifecycle: "active",
    createdAt: now,
    updatedAt: now,
  },
  workItem: {
    id: workItemId,
    projectId,
    sourceCaptureId: captureId,
    title: "Inspect lab service",
    description: "Inspect only",
    status: "open",
    createdAt: now,
    updatedAt: now,
  },
  sourceCapture: {
    id: captureId,
    inputType: "text",
    source: "manual-local",
    createdAt: now,
  },
  knowledge: [],
  resources: [{ resourceId, linkId, linkType: "supports", linkedAt: now }],
});

const packet: ExecutionPacket = {
  id: packetId,
  schemaVersion: "execution-packet/v1",
  packetVersion: 2,
  workItemId,
  projectId,
  sourceCaptureId: captureId,
  generatedAt: now,
  contentDigest: built.contentDigest,
  snapshot: built.snapshot,
};

const run: LocalAgentRun = {
  id: runId,
  occurrenceId: "fake-run-once",
  agentId,
  packetId,
  packetVersion: 2,
  packetDigest: packet.contentDigest,
  workItemId,
  projectId,
  state: "succeeded",
  attempts: 1,
  attemptHistory: [
    {
      id: "823cd972-c842-49db-aa08-7a70bd81643c",
      number: 1,
      state: "succeeded",
      error: null,
      startedAt: now,
      completedAt: now,
    },
  ],
  grant: {
    projectId,
    operations: ["project.brief.read", "work.read"],
    expiresAt: "2026-09-26T10:30:00.000Z",
  },
  result: {
    summary: "Synthetic local fake run inspected context only.",
    contextReadIds: ["d3e88e8a-2b31-4c82-9dbb-57c34518a008"],
    evidence: [packet.snapshot.projectContext.evidence],
    runtime: "local-fake-v1",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  },
  error: null,
  verificationStatus: "unverified",
  runtime: "local-fake-v1",
  sourceLabel: "Synthetic local agent",
  isSynthetic: true,
  externalActions: [],
  createdAt: now,
  startedAt: now,
  completedAt: now,
};

const target: SimulatedApprovalTargetLink = {
  id: linkId,
  projectId,
  resourceId,
  lifecycle: "active",
  resourceExists: true,
};
const request = {
  projectResourceLinkId: linkId,
  mode: "graceful" as const,
  occurrenceId: "proposal-once",
};
const options = {
  localApprovalAutoCeiling: "reversible" as const,
  localApprovalTtlSeconds: 3600,
};

function approval(): SimulatedApproval {
  const prepared = prepareSimulatedApproval(
    run,
    packet,
    target,
    request,
    options,
    new Date(now),
  );
  return {
    id: approvalId,
    occurrenceId: request.occurrenceId,
    requestFingerprint: prepared.requestFingerprint,
    descriptorDigest: prepared.descriptorDigest,
    descriptor: prepared.descriptor,
    state: "pending",
    decision: null,
    outcome: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("simulated local approval application", () => {
  it("binds a successful fake run to the exact active packet-selected link", async () => {
    const proposeOnce = vi.fn(async (prepared) => ({
      ...approval(),
      requestFingerprint: prepared.requestFingerprint,
      descriptorDigest: prepared.descriptorDigest,
      descriptor: prepared.descriptor,
    }));
    const port = {
      getRun: vi.fn(async () => run),
      getPacket: vi.fn(async () => packet),
      getTargetLink: vi.fn(async () => target),
      proposeOnce,
      getById: vi.fn(async () => null),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      decideOnce: vi.fn(async () => approval()),
      listAudit: vi.fn(async () => ({ items: [], nextCursor: null })),
    } satisfies SimulatedApprovalPort;
    const result = await createSimulatedApprovalService(port, {
      ...options,
      clock: () => new Date(now),
    }).propose(runId, request);
    expect(result.descriptor).toMatchObject({
      intendedActor: { agentId, runId },
      packet: { id: packetId, version: 2, digest: packet.contentDigest },
      target: { projectId, resourceId, projectResourceLinkId: linkId },
      policy: { approvalRequired: true, grantScope: "simulation_only" },
      risk: "sensitive",
      requiredCapability: "infrastructure.restart",
      isSynthetic: true,
      externalActions: [],
    });
    expect(result.descriptor.expiresAt).toBe("2026-09-26T11:00:00.000Z");
    expect(result.descriptorDigest).toBe(
      digestSimulatedApprovalDescriptor(result.descriptor),
    );
    expect(JSON.stringify(result)).not.toContain("Authorization: Bearer");
    expect(proposeOnce).toHaveBeenCalledOnce();
  });

  it("changes digest and fingerprint when the exact target changes, and rejects unselected links", () => {
    const original = prepareSimulatedApproval(
      run,
      packet,
      target,
      request,
      options,
      new Date(now),
    );
    const changedDescriptor = {
      ...original.descriptor,
      target: {
        ...original.descriptor.target,
        resourceId: crypto.randomUUID(),
      },
    };
    expect(digestSimulatedApprovalDescriptor(changedDescriptor)).not.toBe(
      original.descriptorDigest,
    );
    expect(
      fingerprintSimulatedActionRequest(runId, {
        ...request,
        projectResourceLinkId: crypto.randomUUID(),
      }),
    ).not.toBe(original.requestFingerprint);
    const unselectedLinkId = crypto.randomUUID();
    expect(() =>
      prepareSimulatedApproval(
        run,
        packet,
        { ...target, id: unselectedLinkId },
        { ...request, projectResourceLinkId: unselectedLinkId },
        options,
        new Date(now),
      ),
    ).toThrowError(/not selected/);
    expect(() =>
      prepareSimulatedApproval(
        run,
        packet,
        { ...target, projectId: crypto.randomUUID() },
        request,
        options,
        new Date(now),
      ),
    ).toThrowError(/different project/);
    expect(() =>
      prepareSimulatedApproval(
        run,
        packet,
        { ...target, lifecycle: "archived" },
        request,
        options,
        new Date(now),
      ),
    ).toThrowError(/not active/);
  });

  it("never creates a proposal from an unfinished run or a mutated packet", () => {
    expect(() =>
      prepareSimulatedApproval(
        { ...run, state: "running" },
        packet,
        target,
        request,
        options,
        new Date(now),
      ),
    ).toThrowError(/must succeed/);
    expect(() =>
      prepareSimulatedApproval(
        run,
        { ...packet, contentDigest: "f".repeat(64) },
        target,
        request,
        options,
        new Date(now),
      ),
    ).toThrowError(/do not match/);
  });

  it("passes only the exact digest and idempotent decision to the locked persistence boundary", async () => {
    const current = approval();
    const decideOnce = vi.fn(async (prepared) => ({
      ...current,
      state: "approved" as const,
      decision: {
        kind: prepared.decision,
        actor: "local-reviewer:unattributed" as const,
        occurrenceId: prepared.occurrenceId,
        decidedAt: prepared.decidedAt,
      },
    }));
    const port = {
      getRun: vi.fn(async () => run),
      getPacket: vi.fn(async () => packet),
      getTargetLink: vi.fn(async () => target),
      proposeOnce: vi.fn(async () => current),
      getById: vi.fn(async () => current),
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      decideOnce,
      listAudit: vi.fn(async () => ({ items: [], nextCursor: null })),
    } satisfies SimulatedApprovalPort;
    const service = createSimulatedApprovalService(port, {
      ...options,
      clock: () => new Date(now),
    });
    await expect(
      service.decide(approvalId, {
        decision: "approve",
        expectedDigest: "f".repeat(64),
        occurrenceId: "decision-once",
      }),
    ).rejects.toMatchObject({ code: "DIGEST_MISMATCH" });
    expect(decideOnce).not.toHaveBeenCalled();
    const approved = await service.decide(approvalId, {
      decision: "approve",
      expectedDigest: current.descriptorDigest,
      occurrenceId: "decision-once",
    });
    expect(approved.state).toBe("approved");
    expect(approved.decision?.kind).toBe("approve");
    expect(decideOnce).toHaveBeenCalledWith({
      id: approvalId,
      decision: "approve",
      expectedDigest: current.descriptorDigest,
      occurrenceId: "decision-once",
      decidedAt: now,
    });
  });

  it("records only a no-effect unverified outcome and returns it on redelivery", async () => {
    let stored = {
      ...approval(),
      state: "approved" as const,
      decision: {
        kind: "approve" as const,
        actor: "local-reviewer:unattributed" as const,
        occurrenceId: "decision-once",
        decidedAt: now,
      },
    };
    const recordSimulatedOutcome = vi.fn(async () => {
      stored = {
        ...stored,
        outcome: {
          kind: "simulated_only" as const,
          verificationStatus: "unverified" as const,
          externalActions: [],
          resourceStateChanged: false as const,
          recordedAt: now,
          summary:
            "Synthetic local restart simulation recorded. No external action occurred and resource state did not change." as const,
        },
      };
      return stored;
    });
    const port = {
      getById: vi.fn(async () => stored),
      recordSimulatedOutcome,
    } satisfies SimulatedApprovalProcessingPort;
    const process = createSimulatedApprovalProcessor(port, () => new Date(now));
    const job = {
      version: 1 as const,
      approvalId,
      descriptorDigest: stored.descriptorDigest,
    };
    const first = await process(job);
    const replay = await process(job);
    expect(first.outcome).toMatchObject({
      kind: "simulated_only",
      resourceStateChanged: false,
      verificationStatus: "unverified",
      externalActions: [],
    });
    expect(replay.outcome).toEqual(first.outcome);
    expect(recordSimulatedOutcome).toHaveBeenCalledOnce();
    await expect(
      process({ ...job, descriptorDigest: "f".repeat(64) }),
    ).rejects.toMatchObject({ code: "DIGEST_MISMATCH" });
  });
});
