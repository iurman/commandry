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
  type LocalAgentCallbackEvent,
  type LocalAgentCallbackRequest,
} from "@commandry/contracts";
import {
  LOCAL_AGENT_GRANT_TTL_SECONDS,
  LOCAL_AGENT_READ_OPERATIONS,
  LocalAgentError,
  type LocalAgentProgressStage,
} from "@commandry/domain";
import {
  buildSyntheticRunnerReport,
  createLocalRunnerCallbackLease,
} from "./local-runner-callback";

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

export function createLocalAgentRunControlService(port: {
  getById(id: string): Promise<StoredLocalAgentRun | null>;
  cancel(id: string): Promise<StoredLocalAgentRun | null>;
}) {
  return {
    async cancel(id: string): Promise<LocalAgentRun> {
      const run = await port.cancel(id);
      if (!run)
        throw new LocalAgentError("RUN_NOT_FOUND", "Local agent run not found");
      return localAgentRunSchema.parse(run);
    },
  };
}

export interface LocalAgentRunProcessingPort {
  getById(id: string): Promise<StoredLocalAgentRun | null>;
  beginAttempt(
    runId: string,
    callbackLease?: { tokenDigest: string; expiresAt: Date },
  ): Promise<string | null>;
  reportCallback?(input: {
    runId: string;
    tokenDigest: string;
    callback: LocalAgentCallbackRequest;
  }): Promise<LocalAgentCallbackEvent>;
  complete(
    runId: string,
    attemptId: string,
    result: FakeLocalAgentRunResult,
  ): Promise<StoredLocalAgentRun>;
  failAttempt(runId: string, attemptId: string, error: string): Promise<void>;
  reportProgress(
    runId: string,
    attemptId: string,
    stage: LocalAgentProgressStage,
  ): Promise<boolean>;
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
    if (existing.state === "succeeded" || existing.state === "canceled")
      return localAgentRunSchema.parse(existing);
    const lease = createLocalRunnerCallbackLease(existing.grant.expiresAt);
    const attemptId = await port.beginAttempt(existing.id, {
      tokenDigest: lease.tokenDigest,
      expiresAt: lease.expiresAt,
    });
    if (!attemptId) {
      const current = await port.getById(existing.id);
      if (!current)
        throw new LocalAgentError("RUN_NOT_FOUND", "Local agent run not found");
      return localAgentRunSchema.parse(current);
    }
    let callbackSequence = 0;
    async function callback(
      item:
        | {
            kind: "heartbeat";
            stage: "started" | "brief_read" | "work_read" | "result_prepared";
          }
        | { kind: "artifact"; artifactContent: string },
    ) {
      if (!port.reportCallback) return;
      callbackSequence += 1;
      await port.reportCallback({
        runId: existing!.id,
        tokenDigest: lease.tokenDigest,
        callback:
          item.kind === "heartbeat"
            ? {
                version: 1,
                attemptId: attemptId!,
                sequence: callbackSequence,
                kind: "heartbeat",
                stage: item.stage,
              }
            : {
                version: 1,
                attemptId: attemptId!,
                sequence: callbackSequence,
                kind: "artifact",
                artifactName: "synthetic-run-report.json",
                artifactMimeType: "application/json",
                artifactContent: item.artifactContent,
              },
      });
    }
    try {
      await callback({ kind: "heartbeat", stage: "started" });
      await options.beforeContextReads?.();
      const currentBeforeRead = await port.getById(existing.id);
      if (currentBeforeRead?.state === "canceled")
        return localAgentRunSchema.parse(currentBeforeRead);
      const brief = await context.read(existing.id, {
        projectId: existing.projectId,
        operation: "project.brief.read",
        reason: "Synthetic local run needs project state and evidence",
      });
      if (!(await port.reportProgress(existing.id, attemptId, "brief_read"))) {
        const current = await port.getById(existing.id);
        if (!current)
          throw new LocalAgentError(
            "RUN_NOT_FOUND",
            "Local agent run not found",
          );
        return localAgentRunSchema.parse(current);
      }
      await callback({ kind: "heartbeat", stage: "brief_read" });
      const work = await context.read(existing.id, {
        projectId: existing.projectId,
        operation: "work.read",
        reason: "Synthetic local run needs the selected work item",
      });
      if (!(await port.reportProgress(existing.id, attemptId, "work_read"))) {
        const current = await port.getById(existing.id);
        if (!current)
          throw new LocalAgentError(
            "RUN_NOT_FOUND",
            "Local agent run not found",
          );
        return localAgentRunSchema.parse(current);
      }
      await callback({ kind: "heartbeat", stage: "work_read" });
      const result = buildFakeLocalAgentRunResult(brief, work);
      if (
        !(await port.reportProgress(existing.id, attemptId, "result_prepared"))
      ) {
        const current = await port.getById(existing.id);
        if (!current)
          throw new LocalAgentError(
            "RUN_NOT_FOUND",
            "Local agent run not found",
          );
        return localAgentRunSchema.parse(current);
      }
      await callback({ kind: "heartbeat", stage: "result_prepared" });
      await callback({
        kind: "artifact",
        artifactContent: buildSyntheticRunnerReport({
          runId: existing.id,
          attemptId,
          packetId: existing.packetId,
          packetDigest: existing.packetDigest,
          result,
        }),
      });
      return localAgentRunSchema.parse(
        await port.complete(existing.id, attemptId, result),
      );
    } catch (error) {
      const current = await port.getById(existing.id);
      if (current?.state === "canceled")
        return localAgentRunSchema.parse(current);
      await port.failAttempt(
        existing.id,
        attemptId,
        error instanceof Error ? error.message : "Fake run failed",
      );
      throw error;
    }
  };
}
