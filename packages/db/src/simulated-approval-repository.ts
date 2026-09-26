import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  executionPacketSchema,
  localAgentRunSchema,
  simulatedApprovalAuditEventSchema,
  simulatedApprovalDescriptorSchema,
} from "@commandry/contracts";
import {
  assertSimulatedOutcomeAllowed,
  canonicalPacketJson,
  canonicalSimulatedApprovalJson,
  SIMULATED_ACTION_OUTCOME_SUMMARY,
  SimulatedApprovalError,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createLocalAgentRunRepository } from "./local-agent-run-repository";
import {
  auditEvent,
  executionPacket,
  localAgentRun,
  projectResourceLink,
  resource,
  simulatedActionProposal,
  simulatedApprovalAttempt,
  simulatedApprovalDecision,
  simulatedApprovalOutcome,
  simulatedApprovalState,
} from "./schema";

export type PreparedSimulatedApprovalPersistence = {
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
  descriptor: unknown;
};

const digest = (value: unknown) =>
  createHash("sha256")
    .update(canonicalSimulatedApprovalJson(value))
    .digest("hex");

function pageLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Approval page limit must be between 1 and 100");
  }
  return limit;
}

function auditRecord(row: typeof auditEvent.$inferSelect) {
  const eventType = row.details.eventType;
  if (
    eventType !== "proposed" &&
    eventType !== "approved" &&
    eventType !== "rejected" &&
    eventType !== "cancelled" &&
    eventType !== "expired" &&
    eventType !== "simulation_recorded"
  ) {
    throw new Error("Unknown simulated approval audit event type");
  }
  return simulatedApprovalAuditEventSchema.parse({
    id: row.id,
    approvalId: row.targetApprovalId!,
    eventType,
    actor: row.actor as "local-reviewer:unattributed" | "local-worker",
    occurrenceId:
      typeof row.details.occurrenceId === "string"
        ? row.details.occurrenceId
        : null,
    detail: String(row.details.detail),
    createdAt: row.createdAt.toISOString(),
  });
}

async function insertAudit(
  tx: Parameters<Parameters<CommandryDatabase["transaction"]>[0]>[0],
  input: {
    proposalId: string;
    eventType:
      | "proposed"
      | "approved"
      | "rejected"
      | "cancelled"
      | "expired"
      | "simulation_recorded";
    actor: "local-reviewer:unattributed" | "local-worker";
    occurrenceId?: string | null;
    detail: string;
    createdAt?: Date;
  },
) {
  await tx.insert(auditEvent).values({
    id: crypto.randomUUID(),
    targetApprovalId: input.proposalId,
    actor: input.actor,
    operation: `simulated_approval.${input.eventType}`,
    details: {
      eventType: input.eventType,
      occurrenceId: input.occurrenceId ?? null,
      detail: input.detail,
    },
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  });
}

/** Repository for exact, local-only proposal snapshots and audit history. */
export function createSimulatedApprovalRepository(db: CommandryDatabase) {
  const runs = createLocalAgentRunRepository(db);
  const packets = createExecutionPacketRepository(db);

  async function getById(id: string) {
    const [row] = await db
      .select({
        proposal: simulatedActionProposal,
        state: simulatedApprovalState,
        decision: simulatedApprovalDecision,
        outcome: simulatedApprovalOutcome,
      })
      .from(simulatedActionProposal)
      .innerJoin(
        simulatedApprovalState,
        eq(simulatedApprovalState.proposalId, simulatedActionProposal.id),
      )
      .leftJoin(
        simulatedApprovalDecision,
        eq(simulatedApprovalDecision.proposalId, simulatedActionProposal.id),
      )
      .leftJoin(
        simulatedApprovalOutcome,
        eq(simulatedApprovalOutcome.proposalId, simulatedActionProposal.id),
      )
      .where(eq(simulatedActionProposal.id, id))
      .limit(1);
    if (!row) return null;
    const decisionKind = row.decision?.decision;
    return {
      id: row.proposal.id,
      occurrenceId: row.proposal.occurrenceId,
      requestFingerprint: row.proposal.requestFingerprint,
      descriptorDigest: row.proposal.descriptorDigest,
      descriptor: row.proposal.descriptor,
      state: row.state.state,
      decision:
        row.decision && decisionKind !== "expired"
          ? {
              kind: {
                approved: "approve" as const,
                rejected: "reject" as const,
                cancelled: "cancel" as const,
              }[decisionKind!],
              actor: "local-reviewer:unattributed" as const,
              occurrenceId: row.decision.occurrenceId,
              decidedAt: row.decision.createdAt.toISOString(),
            }
          : null,
      outcome: row.outcome
        ? {
            kind: "simulated_only" as const,
            verificationStatus: "unverified" as const,
            externalActions: [] as [],
            resourceStateChanged: false as const,
            recordedAt: row.outcome.recordedAt.toISOString(),
            summary: SIMULATED_ACTION_OUTCOME_SUMMARY,
          }
        : null,
      createdAt: row.proposal.createdAt.toISOString(),
      updatedAt: row.state.updatedAt.toISOString(),
    };
  }

  async function reconcileExpired(approvalId?: string) {
    const now = new Date();
    return db.transaction(async (tx) => {
      const result = await tx.execute<{
        proposal_id: string;
        state: "pending" | "approved";
        descriptor_digest: string;
      }>(sql`
        select s.proposal_id, s.state, p.descriptor_digest
        from simulated_approval_state s
        join simulated_action_proposal p on p.id = s.proposal_id
        where s.state in ('pending', 'approved')
          and p.expires_at <= ${now}
          and ${approvalId ? sql`s.proposal_id = ${approvalId}::uuid` : sql`true`}
          and not exists (
            select 1 from simulated_approval_outcome o
            where o.proposal_id = s.proposal_id
          )
        for update of s skip locked
      `);
      for (const item of result.rows) {
        await tx
          .update(simulatedApprovalState)
          .set({
            state: "expired",
            ...(item.state === "pending" ? { decidedAt: now } : {}),
            updatedAt: now,
          })
          .where(eq(simulatedApprovalState.proposalId, item.proposal_id));
        if (item.state === "pending") {
          await tx.insert(simulatedApprovalDecision).values({
            id: crypto.randomUUID(),
            proposalId: item.proposal_id,
            occurrenceId: `expiry:${item.proposal_id}`,
            decision: "expired",
            expectedDigest: item.descriptor_digest,
            actor: "local-worker",
            createdAt: now,
          });
        }
        await insertAudit(tx, {
          proposalId: item.proposal_id,
          eventType: "expired",
          actor: "local-worker",
          detail:
            item.state === "pending"
              ? "Pending local simulation proposal expired without an external action."
              : "Approved local simulation authorization expired before a no-effect outcome was recorded.",
          createdAt: now,
        });
      }
      return result.rows.length;
    });
  }

  return {
    async getRun(id: string) {
      const run = await runs.getById(id);
      return run ? localAgentRunSchema.parse(run) : null;
    },
    async getPacket(id: string) {
      const packet = await packets.getById(id);
      return packet ? executionPacketSchema.parse(packet) : null;
    },
    async getTargetLink(linkId: string) {
      const [row] = await db
        .select({
          id: projectResourceLink.id,
          projectId: projectResourceLink.projectId,
          resourceId: projectResourceLink.resourceId,
          lifecycle: projectResourceLink.lifecycle,
          resourceIdFound: resource.id,
        })
        .from(projectResourceLink)
        .leftJoin(resource, eq(projectResourceLink.resourceId, resource.id))
        .where(eq(projectResourceLink.id, linkId))
        .limit(1);
      return row
        ? {
            id: row.id,
            projectId: row.projectId,
            resourceId: row.resourceId,
            lifecycle: row.lifecycle,
            resourceExists: row.resourceIdFound !== null,
          }
        : null;
    },
    async proposeOnce(input: PreparedSimulatedApprovalPersistence) {
      const descriptor = simulatedApprovalDescriptorSchema.parse(
        input.descriptor,
      );
      if (
        digest(descriptor) !== input.descriptorDigest ||
        digest({
          runId: input.runId,
          projectResourceLinkId: input.projectResourceLinkId,
          mode: descriptor.parameters.mode,
        }) !== input.requestFingerprint ||
        descriptor.intendedActor.runId !== input.runId ||
        descriptor.intendedActor.agentId !== input.agentId ||
        descriptor.packet.id !== input.packetId ||
        descriptor.packet.version !== input.packetVersion ||
        descriptor.packet.digest !== input.packetDigest ||
        descriptor.target.projectId !== input.projectId ||
        descriptor.target.resourceId !== input.resourceId ||
        descriptor.target.projectResourceLinkId !== input.projectResourceLinkId
      ) {
        throw new SimulatedApprovalError(
          "DIGEST_MISMATCH",
          "Prepared action does not match its exact descriptor",
        );
      }
      const id = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({
            id: simulatedActionProposal.id,
            requestFingerprint: simulatedActionProposal.requestFingerprint,
          })
          .from(simulatedActionProposal)
          .where(eq(simulatedActionProposal.occurrenceId, input.occurrenceId))
          .limit(1);
        if (existing) {
          if (existing.requestFingerprint !== input.requestFingerprint) {
            throw new SimulatedApprovalError(
              "OCCURRENCE_CONFLICT",
              "Occurrence ID was already used for a different action",
            );
          }
          return existing.id;
        }
        const [run] = await tx
          .select()
          .from(localAgentRun)
          .where(eq(localAgentRun.id, input.runId))
          .limit(1);
        if (!run) {
          throw new SimulatedApprovalError(
            "RUN_NOT_FOUND",
            "Local run was not found",
          );
        }
        if (run.state !== "succeeded" || run.result === null) {
          throw new SimulatedApprovalError(
            "RUN_NOT_SUCCEEDED",
            "Local run has not succeeded",
          );
        }
        const [packet] = await tx
          .select()
          .from(executionPacket)
          .where(eq(executionPacket.id, input.packetId))
          .limit(1);
        if (!packet) {
          throw new SimulatedApprovalError(
            "PACKET_NOT_FOUND",
            "Packet was not found",
          );
        }
        if (
          run.agentId !== input.agentId ||
          run.packetId !== packet.id ||
          run.packetVersion !== packet.packetVersion ||
          run.packetDigest !== packet.contentDigest ||
          run.projectId !== packet.projectId ||
          run.workItemId !== packet.workItemId ||
          packet.id !== input.packetId ||
          packet.packetVersion !== input.packetVersion ||
          packet.contentDigest !== input.packetDigest ||
          packet.projectId !== input.projectId ||
          createHash("sha256")
            .update(canonicalPacketJson(packet.snapshot))
            .digest("hex") !== packet.contentDigest
        ) {
          throw new SimulatedApprovalError(
            "PACKET_MISMATCH",
            "Run, packet, and prepared proposal do not match",
          );
        }
        const [link] = await tx
          .select()
          .from(projectResourceLink)
          .where(eq(projectResourceLink.id, input.projectResourceLinkId))
          .for("share")
          .limit(1);
        if (!link) {
          throw new SimulatedApprovalError(
            "LINK_NOT_FOUND",
            "Target link was not found",
          );
        }
        if (link.lifecycle !== "active") {
          throw new SimulatedApprovalError(
            "LINK_NOT_ACTIVE",
            "Target link is archived",
          );
        }
        if (
          link.projectId !== run.projectId ||
          link.projectId !== input.projectId
        ) {
          throw new SimulatedApprovalError(
            "PROJECT_SCOPE_DENIED",
            "Target link belongs to a different project",
          );
        }
        if (link.resourceId !== input.resourceId) {
          throw new SimulatedApprovalError(
            "LINK_NOT_FOUND",
            "Target resource does not match its link",
          );
        }
        const [targetResource] = await tx
          .select({ id: resource.id })
          .from(resource)
          .where(eq(resource.id, link.resourceId))
          .limit(1);
        if (!targetResource) {
          throw new SimulatedApprovalError(
            "LINK_NOT_FOUND",
            "Target resource was not found",
          );
        }
        const selectedResources = packet.snapshot.selectedResources;
        if (
          !Array.isArray(selectedResources) ||
          !selectedResources.some(
            (selected) =>
              selected !== null &&
              typeof selected === "object" &&
              (selected as { id?: unknown }).id === link.resourceId &&
              (selected as { linkId?: unknown }).linkId === link.id,
          )
        ) {
          throw new SimulatedApprovalError(
            "TARGET_NOT_SELECTED",
            "Target link was not selected in the immutable packet",
          );
        }
        const now = new Date();
        const expiresAt = new Date(descriptor.expiresAt);
        if (expiresAt <= now) {
          throw new SimulatedApprovalError(
            "APPROVAL_EXPIRED",
            "Proposal already expired",
          );
        }
        const [inserted] = await tx
          .insert(simulatedActionProposal)
          .values({
            id: crypto.randomUUID(),
            runId: input.runId,
            agentId: input.agentId,
            packetId: input.packetId,
            projectId: input.projectId,
            resourceId: input.resourceId,
            linkId: input.projectResourceLinkId,
            schemaVersion: descriptor.schemaVersion,
            descriptor,
            descriptorDigest: input.descriptorDigest,
            occurrenceId: input.occurrenceId,
            requestFingerprint: input.requestFingerprint,
            expiresAt,
            createdAt: now,
          })
          .onConflictDoNothing({ target: simulatedActionProposal.occurrenceId })
          .returning({ id: simulatedActionProposal.id });
        if (!inserted) {
          const [raced] = await tx
            .select({
              id: simulatedActionProposal.id,
              requestFingerprint: simulatedActionProposal.requestFingerprint,
            })
            .from(simulatedActionProposal)
            .where(eq(simulatedActionProposal.occurrenceId, input.occurrenceId))
            .limit(1);
          if (!raced)
            throw new Error("Proposal occurrence conflict disappeared");
          if (raced.requestFingerprint !== input.requestFingerprint) {
            throw new SimulatedApprovalError(
              "OCCURRENCE_CONFLICT",
              "Occurrence ID was already used for a different action",
            );
          }
          return raced.id;
        }
        await tx.insert(simulatedApprovalState).values({
          proposalId: inserted.id,
          state: "pending",
          updatedAt: now,
        });
        await insertAudit(tx, {
          proposalId: inserted.id,
          eventType: "proposed",
          actor: "local-reviewer:unattributed",
          occurrenceId: input.occurrenceId,
          detail:
            "Synthetic local action proposed for exact packet-selected resource link.",
          createdAt: now,
        });
        return inserted.id;
      });
      const record = await getById(id);
      if (!record) throw new Error("Persisted proposal disappeared");
      return record;
    },
    getById,
    async list(query: {
      limit: number;
      cursor?: string | undefined;
      state?:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "expired"
        | undefined;
    }) {
      const limit = pageLimit(query.limit);
      const rows = await db
        .select({ id: simulatedActionProposal.id })
        .from(simulatedActionProposal)
        .innerJoin(
          simulatedApprovalState,
          eq(simulatedApprovalState.proposalId, simulatedActionProposal.id),
        )
        .where(
          and(
            query.state
              ? eq(simulatedApprovalState.state, query.state)
              : undefined,
            query.cursor
              ? sql`(${simulatedActionProposal.createdAt}, ${simulatedActionProposal.id}) < (
                select created_at, id from simulated_action_proposal where id = ${query.cursor}::uuid
              )`
              : undefined,
          ),
        )
        .orderBy(
          desc(simulatedActionProposal.createdAt),
          desc(simulatedActionProposal.id),
        )
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      const items = await Promise.all(visible.map((row) => getById(row.id)));
      if (items.some((item) => item === null)) {
        throw new Error("Listed approval disappeared");
      }
      return {
        items: items.filter((item) => item !== null),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async listAudit(
      approvalId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = pageLimit(query.limit);
      const rows = await db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.targetApprovalId, approvalId),
            query.cursor
              ? sql`(${auditEvent.createdAt}, ${auditEvent.id}) < (
                select created_at, id from audit_event where id = ${query.cursor}::uuid
              )`
              : undefined,
          ),
        )
        .orderBy(desc(auditEvent.createdAt), desc(auditEvent.id))
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(auditRecord),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    reconcileExpired,
    async recordSimulatedOutcome(input: {
      approvalId: string;
      descriptorDigest: string;
      recordedAt: string;
    }) {
      const recordedAt = new Date(input.recordedAt);
      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [state] = await tx
          .select()
          .from(simulatedApprovalState)
          .where(eq(simulatedApprovalState.proposalId, input.approvalId))
          .for("update")
          .limit(1);
        if (!state) {
          throw new SimulatedApprovalError(
            "APPROVAL_NOT_FOUND",
            "Approval not found",
          );
        }
        const [proposal] = await tx
          .select()
          .from(simulatedActionProposal)
          .where(eq(simulatedActionProposal.id, input.approvalId))
          .limit(1);
        if (!proposal) throw new Error("Approval state has no proposal");
        if (
          proposal.descriptorDigest !== input.descriptorDigest ||
          digest(
            simulatedApprovalDescriptorSchema.parse(proposal.descriptor),
          ) !== proposal.descriptorDigest
        ) {
          throw new SimulatedApprovalError(
            "DIGEST_MISMATCH",
            "Simulation job does not match the immutable descriptor",
          );
        }
        const [existing] = await tx
          .select()
          .from(simulatedApprovalOutcome)
          .where(eq(simulatedApprovalOutcome.proposalId, input.approvalId))
          .limit(1);
        if (existing) return { approvalId: input.approvalId, error: null };
        const numberRows = await tx
          .select({ number: simulatedApprovalAttempt.number })
          .from(simulatedApprovalAttempt)
          .where(eq(simulatedApprovalAttempt.proposalId, input.approvalId))
          .orderBy(desc(simulatedApprovalAttempt.number))
          .limit(1);
        const number = (numberRows[0]?.number ?? 0) + 1;
        const attemptId = crypto.randomUUID();
        let failure: SimulatedApprovalError | null = null;
        try {
          assertSimulatedOutcomeAllowed({
            state: state.state,
            expiresAt: proposal.expiresAt.toISOString(),
            descriptorDigest: proposal.descriptorDigest,
            expectedDigest: input.descriptorDigest,
            now,
          });
          const [run] = await tx
            .select({
              state: localAgentRun.state,
              projectId: localAgentRun.projectId,
            })
            .from(localAgentRun)
            .where(eq(localAgentRun.id, proposal.runId))
            .limit(1);
          const [link] = await tx
            .select()
            .from(projectResourceLink)
            .where(eq(projectResourceLink.id, proposal.linkId))
            .for("share")
            .limit(1);
          const [target] = await tx
            .select({ id: resource.id })
            .from(resource)
            .where(eq(resource.id, proposal.resourceId))
            .limit(1);
          if (!run || run.state !== "succeeded") {
            failure = new SimulatedApprovalError(
              "RUN_NOT_SUCCEEDED",
              "Original local run is no longer successful",
            );
          } else if (
            !link ||
            link.lifecycle !== "active" ||
            !target ||
            link.resourceId !== proposal.resourceId ||
            link.projectId !== proposal.projectId ||
            run.projectId !== proposal.projectId
          ) {
            failure = new SimulatedApprovalError(
              "LINK_NOT_ACTIVE",
              "Target link or resource is no longer active",
            );
          }
        } catch (error) {
          if (error instanceof SimulatedApprovalError) failure = error;
          else throw error;
        }
        await tx.insert(simulatedApprovalAttempt).values({
          id: attemptId,
          proposalId: input.approvalId,
          number,
          state: failure ? "failed" : "succeeded",
          error: failure?.code ?? null,
          startedAt: now,
          completedAt: now,
        });
        if (failure) {
          return { approvalId: input.approvalId, error: failure };
        }
        await tx.insert(simulatedApprovalOutcome).values({
          proposalId: input.approvalId,
          kind: "simulated_only",
          verificationStatus: "unverified",
          externalActions: [],
          resourceStateChanged: false,
          summary: SIMULATED_ACTION_OUTCOME_SUMMARY,
          recordedAt,
        });
        await insertAudit(tx, {
          proposalId: input.approvalId,
          eventType: "simulation_recorded",
          actor: "local-worker",
          detail:
            "A no-effect local simulation was recorded; no external action occurred.",
          createdAt: now,
        });
        return { approvalId: input.approvalId, error: null };
      });
      if (result.error) throw result.error;
      const record = await getById(result.approvalId);
      if (!record) throw new Error("Completed simulated approval disappeared");
      return record;
    },
  };
}
