import { createHash } from "node:crypto";
import {
  simulatedApprovalAuditEventSchema,
  simulatedApprovalDescriptorSchema,
  simulatedApprovalJobV1Schema,
  simulatedApprovalSchema,
  executionPacketSchema,
  localAgentRunSchema,
  type CreateSimulatedActionRequest,
  type ExecutionPacket,
  type LocalAgentRun,
  type SimulatedApproval,
  type SimulatedApprovalAuditEvent,
  type SimulatedApprovalAutomaticCeiling,
  type SimulatedApprovalDecisionRequest,
  type SimulatedApprovalDescriptor,
  type SimulatedApprovalJobV1,
  type SimulatedApprovalState,
} from "@commandry/contracts";
import {
  assertSimulatedOutcomeAllowed,
  canonicalPacketJson,
  canonicalSimulatedApprovalJson,
  decideSimulatedApproval,
  evaluateSimulatedActionPolicy,
  isSimulatedApprovalExpired,
  SIMULATED_ACTION_EXPECTED_RESULT,
  SIMULATED_ACTION_OUTCOME_SUMMARY,
  SIMULATED_ACTION_REASON,
  SIMULATED_ACTION_ROLLBACK_TRUTH,
  SIMULATED_ACTION_SCHEMA_VERSION,
  SIMULATED_ACTION_SOURCE_LABEL,
  SIMULATED_ACTION_TYPE,
  SimulatedApprovalError,
} from "@commandry/domain";

export type SimulatedApprovalPage<T> = {
  items: T[];
  nextCursor: string | null;
};
export type SimulatedApprovalPageQuery = {
  limit: number;
  cursor?: string | undefined;
};
export type SimulatedApprovalListQuery = SimulatedApprovalPageQuery & {
  state?: SimulatedApprovalState | undefined;
};

export type SimulatedApprovalTargetLink = {
  id: string;
  projectId: string;
  resourceId: string;
  lifecycle: "active" | "archived";
  resourceExists: boolean;
};

export type PreparedSimulatedApproval = {
  runId: string;
  agentId: string;
  packetId: string;
  packetVersion: number;
  packetDigest: string;
  projectId: string;
  resourceId: string;
  projectResourceLinkId: string;
  occurrenceId: string;
  requestFingerprint: string;
  descriptorDigest: string;
  descriptor: SimulatedApprovalDescriptor;
};

export type StoredSimulatedApproval = Omit<
  SimulatedApproval,
  "descriptor" | "outcome"
> & {
  descriptor: unknown;
  outcome: unknown;
};

export type PreparedSimulatedApprovalDecision = {
  id: string;
  decision: SimulatedApprovalDecisionRequest["decision"];
  expectedDigest: string;
  occurrenceId: string;
  decidedAt: string;
};

export interface SimulatedApprovalPort {
  getRun(runId: string): Promise<LocalAgentRun | null>;
  getPacket(packetId: string): Promise<ExecutionPacket | null>;
  getTargetLink(linkId: string): Promise<SimulatedApprovalTargetLink | null>;
  proposeOnce(
    prepared: PreparedSimulatedApproval,
  ): Promise<StoredSimulatedApproval>;
  getById(id: string): Promise<StoredSimulatedApproval | null>;
  list(
    query: SimulatedApprovalListQuery,
  ): Promise<SimulatedApprovalPage<StoredSimulatedApproval>>;
  decideOnce(
    prepared: PreparedSimulatedApprovalDecision,
  ): Promise<StoredSimulatedApproval>;
  listAudit(
    approvalId: string,
    query: SimulatedApprovalPageQuery,
  ): Promise<SimulatedApprovalPage<SimulatedApprovalAuditEvent>>;
}

export interface SimulatedApprovalProcessingPort {
  getById(id: string): Promise<StoredSimulatedApproval | null>;
  recordSimulatedOutcome(input: {
    approvalId: string;
    descriptorDigest: string;
    recordedAt: string;
  }): Promise<StoredSimulatedApproval>;
}

export type SimulatedApprovalServiceOptions = {
  localApprovalAutoCeiling?: SimulatedApprovalAutomaticCeiling;
  localApprovalTtlSeconds?: number;
  clock?: () => Date;
};

function digest(value: unknown): string {
  return createHash("sha256")
    .update(canonicalSimulatedApprovalJson(value))
    .digest("hex");
}

export function digestSimulatedApprovalDescriptor(
  descriptor: SimulatedApprovalDescriptor,
): string {
  return digest(simulatedApprovalDescriptorSchema.parse(descriptor));
}

export function fingerprintSimulatedActionRequest(
  runId: string,
  input: CreateSimulatedActionRequest,
): string {
  return digest({
    runId,
    projectResourceLinkId: input.projectResourceLinkId,
    mode: input.mode,
  });
}

function parseStoredApproval(
  stored: StoredSimulatedApproval,
): SimulatedApproval {
  const approval = simulatedApprovalSchema.parse(stored);
  if (
    digestSimulatedApprovalDescriptor(approval.descriptor) !==
    approval.descriptorDigest
  ) {
    throw new SimulatedApprovalError(
      "DIGEST_MISMATCH",
      "Stored descriptor digest does not match the action descriptor",
    );
  }
  if (
    approval.outcome &&
    (approval.state !== "approved" || approval.decision?.kind !== "approve")
  ) {
    throw new SimulatedApprovalError(
      "SIMULATION_NOT_APPROVED",
      "No-effect simulation outcome has no valid approval",
    );
  }
  return approval;
}

export function prepareSimulatedApproval(
  run: LocalAgentRun,
  packet: ExecutionPacket,
  target: SimulatedApprovalTargetLink,
  input: CreateSimulatedActionRequest,
  options: Required<
    Pick<
      SimulatedApprovalServiceOptions,
      "localApprovalAutoCeiling" | "localApprovalTtlSeconds"
    >
  >,
  now: Date,
): PreparedSimulatedApproval {
  if (run.state !== "succeeded" || run.result === null) {
    throw new SimulatedApprovalError(
      "RUN_NOT_SUCCEEDED",
      "A synthetic local run must succeed before proposing a simulated action",
    );
  }
  if (
    packet.id !== run.packetId ||
    packet.packetVersion !== run.packetVersion ||
    packet.contentDigest !== run.packetDigest ||
    packet.projectId !== run.projectId ||
    packet.workItemId !== run.workItemId ||
    createHash("sha256")
      .update(canonicalPacketJson(packet.snapshot))
      .digest("hex") !== packet.contentDigest
  ) {
    throw new SimulatedApprovalError(
      "PACKET_MISMATCH",
      "Run and immutable packet identity do not match",
    );
  }
  if (!target.resourceExists) {
    throw new SimulatedApprovalError(
      "LINK_NOT_FOUND",
      "Target resource not found",
    );
  }
  if (target.id !== input.projectResourceLinkId) {
    throw new SimulatedApprovalError(
      "LINK_NOT_FOUND",
      "Target link identity does not match request",
    );
  }
  if (target.lifecycle !== "active") {
    throw new SimulatedApprovalError(
      "LINK_NOT_ACTIVE",
      "Target project-resource link is not active",
    );
  }
  if (target.projectId !== run.projectId) {
    throw new SimulatedApprovalError(
      "PROJECT_SCOPE_DENIED",
      "Target link belongs to a different project",
    );
  }
  if (
    !packet.snapshot.selectedResources.some(
      (resource) =>
        resource.id === target.resourceId && resource.linkId === target.id,
    )
  ) {
    throw new SimulatedApprovalError(
      "TARGET_NOT_SELECTED",
      "Target link was not selected in the immutable execution packet",
    );
  }
  const policy = evaluateSimulatedActionPolicy(
    options.localApprovalAutoCeiling,
  );
  const descriptor = simulatedApprovalDescriptorSchema.parse({
    schemaVersion: SIMULATED_ACTION_SCHEMA_VERSION,
    actionType: SIMULATED_ACTION_TYPE,
    intendedActor: { agentId: run.agentId, runId: run.id },
    proposedBy: "local-reviewer:unattributed",
    packet: {
      id: packet.id,
      version: packet.packetVersion,
      digest: packet.contentDigest,
    },
    target: {
      projectId: run.projectId,
      resourceId: target.resourceId,
      projectResourceLinkId: target.id,
    },
    parameters: { mode: input.mode },
    reason: SIMULATED_ACTION_REASON,
    expectedResult: SIMULATED_ACTION_EXPECTED_RESULT,
    risk: policy.risk,
    requiredCapability: policy.requiredCapability,
    policy: {
      automaticCeiling: policy.automaticCeiling,
      approvalRequired: policy.approvalRequired,
      grantScope: policy.grantScope,
    },
    reversibility: {
      isApplicable: false,
      explanation: SIMULATED_ACTION_ROLLBACK_TRUTH,
    },
    expiresAt: new Date(
      now.getTime() + options.localApprovalTtlSeconds * 1000,
    ).toISOString(),
    sourceLabel: SIMULATED_ACTION_SOURCE_LABEL,
    isSynthetic: true,
    externalActions: [],
  });
  return {
    runId: run.id,
    agentId: run.agentId,
    packetId: packet.id,
    packetVersion: packet.packetVersion,
    packetDigest: packet.contentDigest,
    projectId: run.projectId,
    resourceId: target.resourceId,
    projectResourceLinkId: target.id,
    occurrenceId: input.occurrenceId,
    requestFingerprint: fingerprintSimulatedActionRequest(run.id, input),
    descriptorDigest: digestSimulatedApprovalDescriptor(descriptor),
    descriptor,
  };
}

export function createSimulatedApprovalService(
  port: SimulatedApprovalPort,
  options: SimulatedApprovalServiceOptions = {},
) {
  const automaticCeiling = options.localApprovalAutoCeiling ?? "reversible";
  const ttlSeconds = options.localApprovalTtlSeconds ?? 3600;
  const clock = options.clock ?? (() => new Date());
  if (
    (automaticCeiling !== "read_only" && automaticCeiling !== "reversible") ||
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 60 ||
    ttlSeconds > 86400
  ) {
    throw new RangeError("Invalid safe local simulated approval policy");
  }
  return {
    async propose(
      runId: string,
      input: CreateSimulatedActionRequest,
    ): Promise<SimulatedApproval> {
      const storedRun = await port.getRun(runId);
      if (!storedRun) {
        throw new SimulatedApprovalError(
          "RUN_NOT_FOUND",
          "Agent run not found",
        );
      }
      const run = localAgentRunSchema.parse(storedRun);
      if (run.id !== runId) {
        throw new SimulatedApprovalError(
          "RUN_NOT_FOUND",
          "Agent run identity does not match request",
        );
      }
      const storedPacket = await port.getPacket(run.packetId);
      if (!storedPacket) {
        throw new SimulatedApprovalError(
          "PACKET_NOT_FOUND",
          "Execution packet not found",
        );
      }
      const packet = executionPacketSchema.parse(storedPacket);
      const target = await port.getTargetLink(input.projectResourceLinkId);
      if (!target) {
        throw new SimulatedApprovalError(
          "LINK_NOT_FOUND",
          "Target link not found",
        );
      }
      const prepared = prepareSimulatedApproval(
        run,
        packet,
        target,
        input,
        {
          localApprovalAutoCeiling: automaticCeiling,
          localApprovalTtlSeconds: ttlSeconds,
        },
        clock(),
      );
      return parseStoredApproval(await port.proposeOnce(prepared));
    },
    async getById(id: string): Promise<SimulatedApproval | null> {
      const stored = await port.getById(id);
      return stored ? parseStoredApproval(stored) : null;
    },
    async list(
      query: SimulatedApprovalListQuery,
    ): Promise<SimulatedApprovalPage<SimulatedApproval>> {
      const page = await port.list(query);
      return {
        items: page.items.map(parseStoredApproval),
        nextCursor: page.nextCursor,
      };
    },
    async decide(
      id: string,
      input: SimulatedApprovalDecisionRequest,
    ): Promise<SimulatedApproval> {
      const stored = await port.getById(id);
      if (!stored) {
        throw new SimulatedApprovalError(
          "APPROVAL_NOT_FOUND",
          "Approval request not found",
        );
      }
      const current = parseStoredApproval(stored);
      if (
        current.state === "pending" &&
        !isSimulatedApprovalExpired(current.descriptor.expiresAt, clock())
      ) {
        decideSimulatedApproval({
          state: current.state,
          expiresAt: current.descriptor.expiresAt,
          descriptorDigest: current.descriptorDigest,
          expectedDigest: input.expectedDigest,
          decision: input.decision,
          now: clock(),
        });
      }
      // The repository locks and rechecks state, expiry, digest and occurrence.
      // A terminal replay may be valid even when the request is no longer pending.
      return parseStoredApproval(
        await port.decideOnce({
          id,
          decision: input.decision,
          expectedDigest: input.expectedDigest,
          occurrenceId: input.occurrenceId,
          decidedAt: clock().toISOString(),
        }),
      );
    },
    async listAudit(
      id: string,
      query: SimulatedApprovalPageQuery,
    ): Promise<SimulatedApprovalPage<SimulatedApprovalAuditEvent>> {
      if (!(await port.getById(id))) {
        throw new SimulatedApprovalError(
          "APPROVAL_NOT_FOUND",
          "Approval request not found",
        );
      }
      const page = await port.listAudit(id, query);
      return {
        items: page.items.map((item) =>
          simulatedApprovalAuditEventSchema.parse(item),
        ),
        nextCursor: page.nextCursor,
      };
    },
  };
}

export function createSimulatedApprovalProcessor(
  port: SimulatedApprovalProcessingPort,
  clock: () => Date = () => new Date(),
) {
  return async (input: SimulatedApprovalJobV1): Promise<SimulatedApproval> => {
    const job = simulatedApprovalJobV1Schema.parse(input);
    const stored = await port.getById(job.approvalId);
    if (!stored) {
      throw new SimulatedApprovalError(
        "APPROVAL_NOT_FOUND",
        "Approval request not found",
      );
    }
    const current = parseStoredApproval(stored);
    if (job.descriptorDigest !== current.descriptorDigest) {
      throw new SimulatedApprovalError(
        "DIGEST_MISMATCH",
        "Simulation job digest does not match the exact action descriptor",
      );
    }
    if (current.outcome) return current;
    assertSimulatedOutcomeAllowed({
      state: current.state,
      expiresAt: current.descriptor.expiresAt,
      descriptorDigest: current.descriptorDigest,
      expectedDigest: job.descriptorDigest,
      now: clock(),
    });
    return parseStoredApproval(
      await port.recordSimulatedOutcome({
        approvalId: job.approvalId,
        descriptorDigest: job.descriptorDigest,
        recordedAt: clock().toISOString(),
      }),
    );
  };
}

export { SIMULATED_ACTION_OUTCOME_SUMMARY };
