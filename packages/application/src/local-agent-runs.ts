import { createHash } from "node:crypto";
import {
  fakeLocalAgentRunResultSchema,
  localAgentRunJobV1Schema,
  localAgentRunSchema,
  type AgentContextReadRequest,
  type AgentContextReadResponse,
  type CreateLocalAgentRunRequest,
  type ExecutionPacket,
  type FakeLocalAgentRunResult,
  type LocalAgentProfile,
  type LocalAgentRun,
  type LocalAgentRunJobV1,
} from "@commandry/contracts";
import {
  LOCAL_AGENT_GRANT_TTL_SECONDS,
  LOCAL_AGENT_READ_OPERATIONS,
  LocalAgentError,
} from "@commandry/domain";

export type LocalAgentRunPacket = Pick<
  ExecutionPacket,
  "id" | "packetVersion" | "contentDigest" | "workItemId" | "projectId"
>;

export type PreparedLocalAgentRun = {
  packetId: string;
  packetVersion: number;
  packetDigest: string;
  workItemId: string;
  projectId: string;
  agentId: string;
  occurrenceId: string;
  requestFingerprint: string;
  grantOperations: typeof LOCAL_AGENT_READ_OPERATIONS;
  grantTtlSeconds: number;
};

export type StoredLocalAgentRun = Omit<LocalAgentRun, "result"> & {
  result: unknown;
};

export interface LocalAgentRunSubmissionPort {
  getPacketById(id: string): Promise<LocalAgentRunPacket | null>;
  getAgentById(id: string): Promise<LocalAgentProfile | null>;
  isAssigned(agentId: string, projectId: string): Promise<boolean>;
  submitOnce(prepared: PreparedLocalAgentRun): Promise<StoredLocalAgentRun>;
  getById(id: string): Promise<StoredLocalAgentRun | null>;
}

export function prepareLocalAgentRun(
  packet: LocalAgentRunPacket,
  input: CreateLocalAgentRunRequest,
): PreparedLocalAgentRun {
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        packetId: packet.id,
        packetDigest: packet.contentDigest,
        agentId: input.agentId,
      }),
    )
    .digest("hex");
  return {
    packetId: packet.id,
    packetVersion: packet.packetVersion,
    packetDigest: packet.contentDigest,
    workItemId: packet.workItemId,
    projectId: packet.projectId,
    agentId: input.agentId,
    occurrenceId: input.occurrenceId,
    requestFingerprint,
    grantOperations: LOCAL_AGENT_READ_OPERATIONS,
    grantTtlSeconds: LOCAL_AGENT_GRANT_TTL_SECONDS,
  };
}

export function createLocalAgentRunService(port: LocalAgentRunSubmissionPort) {
  return {
    async submit(
      packetId: string,
      input: CreateLocalAgentRunRequest,
    ): Promise<LocalAgentRun> {
      const packet = await port.getPacketById(packetId);
      if (!packet)
        throw new LocalAgentError(
          "PACKET_NOT_FOUND",
          "Execution packet not found",
        );
      const agent = await port.getAgentById(input.agentId);
      if (!agent)
        throw new LocalAgentError("AGENT_NOT_FOUND", "Local agent not found");
      if (!(await port.isAssigned(input.agentId, packet.projectId))) {
        throw new LocalAgentError(
          "AGENT_NOT_ASSIGNED",
          "Local agent is not assigned to the packet project",
        );
      }
      return localAgentRunSchema.parse(
        await port.submitOnce(prepareLocalAgentRun(packet, input)),
      );
    },
    async getById(id: string): Promise<LocalAgentRun | null> {
      const run = await port.getById(id);
      return run ? localAgentRunSchema.parse(run) : null;
    },
  };
}

export interface LocalAgentRunProcessingPort {
  getById(id: string): Promise<StoredLocalAgentRun | null>;
  beginAttempt(runId: string): Promise<string | null>;
  complete(
    runId: string,
    attemptId: string,
    result: FakeLocalAgentRunResult,
  ): Promise<StoredLocalAgentRun>;
  failAttempt(runId: string, attemptId: string, error: string): Promise<void>;
}

export type AgentContextReader = {
  read(
    runId: string,
    request: AgentContextReadRequest,
  ): Promise<AgentContextReadResponse>;
};

export function buildFakeLocalAgentRunResult(
  brief: AgentContextReadResponse,
  work: AgentContextReadResponse,
): FakeLocalAgentRunResult {
  const evidence = [...brief.source.evidence, ...work.source.evidence];
  const distinctEvidence = Array.from(
    new Map(evidence.map((item) => [`${item.kind}:${item.id}`, item])).values(),
  );
  return fakeLocalAgentRunResultSchema.parse({
    summary:
      "Synthetic local fake run inspected the project brief and selected work item. No task was executed or verified.",
    contextReadIds: [brief.auditId, work.auditId],
    evidence: distinctEvidence,
    runtime: "local-fake-v1",
    isSynthetic: true,
    verificationStatus: "unverified",
    externalActions: [],
  });
}

export function createLocalAgentRunProcessor(
  port: LocalAgentRunProcessingPort,
  context: AgentContextReader,
  options: { beforeContextReads?: () => Promise<void> } = {},
) {
  return async (job: LocalAgentRunJobV1): Promise<LocalAgentRun> => {
    const parsedJob = localAgentRunJobV1Schema.parse(job);
    const existing = await port.getById(parsedJob.runId);
    if (!existing)
      throw new LocalAgentError("RUN_NOT_FOUND", "Local agent run not found");
    if (existing.occurrenceId !== parsedJob.occurrenceId) {
      throw new LocalAgentError(
        "OCCURRENCE_CONFLICT",
        "Run occurrence does not match its queued job",
      );
    }
    if (existing.state === "succeeded")
      return localAgentRunSchema.parse(existing);
    const attemptId = await port.beginAttempt(existing.id);
    if (!attemptId) {
      const current = await port.getById(existing.id);
      if (!current)
        throw new LocalAgentError("RUN_NOT_FOUND", "Local agent run not found");
      return localAgentRunSchema.parse(current);
    }
    try {
      await options.beforeContextReads?.();
      const brief = await context.read(existing.id, {
        projectId: existing.projectId,
        operation: "project.brief.read",
        reason: "Synthetic local run needs project state and evidence",
      });
      const work = await context.read(existing.id, {
        projectId: existing.projectId,
        operation: "work.read",
        reason: "Synthetic local run needs the selected work item",
      });
      const result = buildFakeLocalAgentRunResult(brief, work);
      return localAgentRunSchema.parse(
        await port.complete(existing.id, attemptId, result),
      );
    } catch (error) {
      await port.failAttempt(
        existing.id,
        attemptId,
        error instanceof Error ? error.message : "Fake run failed",
      );
      throw error;
    }
  };
}
