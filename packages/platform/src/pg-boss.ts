import { and, eq, sql } from "drizzle-orm";
import { PgBoss, fromDrizzle } from "pg-boss";
import { Pool } from "pg";
import type {
  PreparedSimulatedApprovalDecision,
  PreparedLocalAgentRun,
  PreparedSyntheticEventImport,
} from "@commandry/application";
import type { CommandryDatabase } from "@commandry/db";
import {
  createLocalAgentRunRepository,
  createSimulatedApprovalRepository,
  createSyntheticEventImportRepository,
  schema,
} from "@commandry/db";
import {
  LocalAgentError,
  SimulatedApprovalError,
  SyntheticEventImportConflictError,
  type SyntheticRun,
} from "@commandry/domain";

export const SYNTHETIC_QUEUE = "commandry-synthetic-v1";
export const SYNTHETIC_DEAD_LETTER_QUEUE = "commandry-synthetic-dlq";
export const SYNTHETIC_EVENT_IMPORT_QUEUE =
  "commandry-synthetic-event-import-v1";
export const SYNTHETIC_EVENT_IMPORT_DEAD_LETTER_QUEUE =
  "commandry-synthetic-event-import-dlq";
export const LOCAL_AGENT_RUN_QUEUE = "commandry-local-agent-run-v1";
export const LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE =
  "commandry-local-agent-run-dlq";
export const SIMULATED_APPROVAL_QUEUE = "commandry-simulated-approval-v1";
export const SIMULATED_APPROVAL_DEAD_LETTER_QUEUE =
  "commandry-simulated-approval-dlq";

function bossOptions(connectionString: string, max: number, migrate: boolean) {
  return {
    connectionString,
    max,
    migrate,
    supervise: true,
    schedule: false,
  } as const;
}

/** Runs in the one-shot DDL process, not in web or worker startup. */
export async function installPgBossSchema(options: {
  connectionString: string;
  runtimeRole: string;
}): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(options.runtimeRole)) {
    throw new Error("runtimeRole must be a simple PostgreSQL role name");
  }
  const boss = new PgBoss(bossOptions(options.connectionString, 1, true));
  await boss.start();
  try {
    await boss.createQueue(SYNTHETIC_DEAD_LETTER_QUEUE);
    await boss.createQueue(SYNTHETIC_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SYNTHETIC_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(SYNTHETIC_EVENT_IMPORT_DEAD_LETTER_QUEUE);
    await boss.createQueue(SYNTHETIC_EVENT_IMPORT_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SYNTHETIC_EVENT_IMPORT_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE);
    await boss.createQueue(LOCAL_AGENT_RUN_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE,
    });
    await boss.createQueue(SIMULATED_APPROVAL_DEAD_LETTER_QUEUE);
    await boss.createQueue(SIMULATED_APPROVAL_QUEUE, {
      retryLimit: 3,
      retryDelay: 1,
      retryBackoff: true,
      deadLetter: SIMULATED_APPROVAL_DEAD_LETTER_QUEUE,
    });
  } finally {
    await boss.stop();
  }

  const pool = new Pool({ connectionString: options.connectionString, max: 1 });
  const role = `"${options.runtimeRole}"`;
  try {
    await pool.query(`GRANT USAGE ON SCHEMA pgboss TO ${role}`);
    await pool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
    );
    await pool.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT EXECUTE ON FUNCTIONS TO ${role}`,
    );
  } finally {
    await pool.end();
  }
}

/** Producer startup has no schema mutation and uses a separate bounded pool. */
export async function createPgBossProducer(options: {
  connectionString: string;
  max?: number;
}) {
  const boss = new PgBoss(
    bossOptions(options.connectionString, options.max ?? 2, false),
  );
  await boss.start();
  return { boss, close: () => boss.stop() };
}

/** Application submission port: the product row and job commit or roll back together. */
export function createSyntheticRunSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  return {
    async submitOnce(occurrenceId: string): Promise<SyntheticRun> {
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.syntheticRun)
          .values({
            id: crypto.randomUUID(),
            occurrenceId,
            state: "queued",
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          const jobId = await boss.send(
            SYNTHETIC_QUEUE,
            {
              version: 1,
              runId: inserted.id,
              occurrenceId,
            },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Synthetic job was not enqueued");
          await tx.insert(schema.auditEvent).values({
            id: crypto.randomUUID(),
            actor: "system:api",
            operation: "synthetic_run.queued",
            targetRunId: inserted.id,
            details: { jobId },
          });
          return inserted;
        }

        const [existing] = await tx
          .select()
          .from(schema.syntheticRun)
          .where(eq(schema.syntheticRun.occurrenceId, occurrenceId))
          .limit(1);
        if (!existing)
          throw new Error("Synthetic occurrence was not found after conflict");
        return existing;
      });
    },
  };
}

/** Persist the original synthetic evidence, product run, queue job, and audit atomically. */
export function createSyntheticEventImportSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createSyntheticEventImportRepository(db);
  return {
    async submitOnce(input: PreparedSyntheticEventImport) {
      const importId = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.syntheticEventImport)
          .values({
            id: crypto.randomUUID(),
            occurrenceId: input.occurrenceId,
            requestFingerprint: input.requestFingerprint,
            scenarioId: input.scenarioId,
            projectId: input.projectId,
            resourceId: input.resourceId,
            state: "queued",
          })
          .onConflictDoNothing({
            target: schema.syntheticEventImport.occurrenceId,
          })
          .returning({ id: schema.syntheticEventImport.id });

        if (!inserted) {
          const [existing] = await tx
            .select({
              id: schema.syntheticEventImport.id,
              requestFingerprint:
                schema.syntheticEventImport.requestFingerprint,
            })
            .from(schema.syntheticEventImport)
            .where(
              eq(schema.syntheticEventImport.occurrenceId, input.occurrenceId),
            )
            .limit(1);
          if (!existing)
            throw new Error(
              "Synthetic event import was not found after conflict",
            );
          if (existing.requestFingerprint !== input.requestFingerprint)
            throw new SyntheticEventImportConflictError();
          return existing.id;
        }

        const envelopeId = crypto.randomUUID();
        await tx.insert(schema.sourceEnvelope).values({
          id: envelopeId,
          importId: inserted.id,
          sourceKind: input.sourceKind,
          sourceLabel: input.sourceLabel,
          sourceSchemaVersion: input.sourceSchemaVersion,
          sourceEventId: input.sourceEventId,
          rawPayload: input.rawPayload,
          occurredAt: input.occurredAt
            ? new Date(input.occurredAt)
            : new Date(),
          isSynthetic: true,
        });

        const jobId = await boss.send(
          SYNTHETIC_EVENT_IMPORT_QUEUE,
          {
            version: 1,
            runId: inserted.id,
            occurrenceId: input.occurrenceId,
          },
          { db: fromDrizzle(tx, sql) },
        );
        if (!jobId) throw new Error("Synthetic event import was not enqueued");

        await tx.insert(schema.auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:api",
          operation: "synthetic_event_import.queued",
          targetImportId: inserted.id,
          details: {
            jobId,
            envelopeId,
            scenarioId: input.scenarioId,
          },
        });
        return inserted.id;
      });

      const record = await repository.getById(importId);
      if (!record)
        throw new Error("Synthetic event import disappeared after submission");
      return record;
    },
  };
}

/** A packet-bound fake run, expiring grants, queue job, and audit commit together. */
export function createLocalAgentRunSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createLocalAgentRunRepository(db);
  return {
    async submitOnce(input: PreparedLocalAgentRun) {
      const runId = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(schema.localAgentRun)
          .values({
            id: crypto.randomUUID(),
            agentId: input.agentId,
            packetId: input.packetId,
            packetVersion: input.packetVersion,
            packetDigest: input.packetDigest,
            workItemId: input.workItemId,
            projectId: input.projectId,
            occurrenceId: input.occurrenceId,
            requestFingerprint: input.requestFingerprint,
            state: "queued",
          })
          .onConflictDoNothing({ target: schema.localAgentRun.occurrenceId })
          .returning({ id: schema.localAgentRun.id });

        if (!inserted) {
          const [existing] = await tx
            .select({
              id: schema.localAgentRun.id,
              requestFingerprint: schema.localAgentRun.requestFingerprint,
            })
            .from(schema.localAgentRun)
            .where(eq(schema.localAgentRun.occurrenceId, input.occurrenceId))
            .limit(1);
          if (!existing)
            throw new Error("Local agent run disappeared after conflict");
          if (existing.requestFingerprint !== input.requestFingerprint) {
            throw new LocalAgentError(
              "OCCURRENCE_CONFLICT",
              "Occurrence ID was already used for a different local agent run",
            );
          }
          return existing.id;
        }

        const [packet] = await tx
          .select({
            id: schema.executionPacket.id,
            packetVersion: schema.executionPacket.packetVersion,
            contentDigest: schema.executionPacket.contentDigest,
            workItemId: schema.executionPacket.workItemId,
            projectId: schema.executionPacket.projectId,
          })
          .from(schema.executionPacket)
          .where(eq(schema.executionPacket.id, input.packetId))
          .limit(1);
        if (
          !packet ||
          packet.packetVersion !== input.packetVersion ||
          packet.contentDigest !== input.packetDigest ||
          packet.workItemId !== input.workItemId ||
          packet.projectId !== input.projectId
        ) {
          throw new LocalAgentError(
            "PACKET_NOT_FOUND",
            "Prepared run does not match its immutable execution packet",
          );
        }
        const [assignment] = await tx
          .select({ id: schema.localAgentProjectAssignment.id })
          .from(schema.localAgentProjectAssignment)
          .where(
            and(
              eq(schema.localAgentProjectAssignment.agentId, input.agentId),
              eq(schema.localAgentProjectAssignment.projectId, input.projectId),
            ),
          )
          .limit(1);
        if (!assignment) {
          throw new LocalAgentError(
            "AGENT_NOT_ASSIGNED",
            "Local agent is not assigned to the packet project",
          );
        }
        if (
          !Number.isInteger(input.grantTtlSeconds) ||
          input.grantTtlSeconds < 1 ||
          input.grantTtlSeconds > 86_400 ||
          input.grantOperations.length !== 2 ||
          new Set(input.grantOperations).size !== 2 ||
          !input.grantOperations.includes("project.brief.read") ||
          !input.grantOperations.includes("work.read")
        ) {
          throw new Error("Prepared local agent grant is invalid");
        }
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + input.grantTtlSeconds * 1000,
        );
        await tx.insert(schema.localAgentRunGrant).values(
          input.grantOperations.map((operation) => ({
            id: crypto.randomUUID(),
            runId: inserted.id,
            projectId: input.projectId,
            operation,
            expiresAt,
            createdAt: now,
          })),
        );

        const jobId = await boss.send(
          LOCAL_AGENT_RUN_QUEUE,
          { version: 1, runId: inserted.id, occurrenceId: input.occurrenceId },
          { db: fromDrizzle(tx, sql) },
        );
        if (!jobId) throw new Error("Local agent run was not enqueued");
        await tx.insert(schema.auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:api",
          operation: "local_agent_run.queued",
          targetAgentRunId: inserted.id,
          details: {
            projectId: input.projectId,
            packetId: input.packetId,
            agentId: input.agentId,
            jobId,
            grantExpiresAt: expiresAt.toISOString(),
          },
        });
        return inserted.id;
      });
      const record = await repository.getById(runId);
      if (!record) throw new Error("Queued local agent run disappeared");
      return record;
    },
  };
}

/** A reviewer decision, immutable history, audit, and optional local job commit together. */
export function createSimulatedApprovalDecisionSubmission(
  db: CommandryDatabase,
  boss: PgBoss,
) {
  const repository = createSimulatedApprovalRepository(db);
  return {
    async decideOnce(input: PreparedSimulatedApprovalDecision) {
      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const [state] = await tx
          .select()
          .from(schema.simulatedApprovalState)
          .where(eq(schema.simulatedApprovalState.proposalId, input.id))
          .for("update")
          .limit(1);
        if (!state) {
          throw new SimulatedApprovalError(
            "APPROVAL_NOT_FOUND",
            "Approval was not found",
          );
        }
        const [proposal] = await tx
          .select()
          .from(schema.simulatedActionProposal)
          .where(eq(schema.simulatedActionProposal.id, input.id))
          .limit(1);
        if (!proposal) throw new Error("Approval state has no proposal");
        if (proposal.descriptorDigest !== input.expectedDigest) {
          throw new SimulatedApprovalError(
            "DIGEST_MISMATCH",
            "Decision digest does not match the exact action descriptor",
          );
        }
        const [existing] = await tx
          .select()
          .from(schema.simulatedApprovalDecision)
          .where(eq(schema.simulatedApprovalDecision.proposalId, input.id))
          .limit(1);
        const targetState = {
          approve: "approved" as const,
          reject: "rejected" as const,
          cancel: "cancelled" as const,
        }[input.decision];
        if (existing) {
          if (
            existing.occurrenceId === input.occurrenceId &&
            existing.decision === targetState
          ) {
            return { id: input.id, error: null };
          }
          if (existing.occurrenceId === input.occurrenceId) {
            throw new SimulatedApprovalError(
              "OCCURRENCE_CONFLICT",
              "Decision occurrence ID was already used for another outcome",
            );
          }
          throw new SimulatedApprovalError(
            state.state === "expired"
              ? "APPROVAL_EXPIRED"
              : "APPROVAL_NOT_PENDING",
            "Approval already has a final decision",
          );
        }
        if (state.state !== "pending") {
          throw new SimulatedApprovalError(
            state.state === "expired"
              ? "APPROVAL_EXPIRED"
              : "APPROVAL_NOT_PENDING",
            "Approval is no longer pending",
          );
        }
        if (proposal.expiresAt <= now) {
          await tx
            .update(schema.simulatedApprovalState)
            .set({ state: "expired", decidedAt: now, updatedAt: now })
            .where(eq(schema.simulatedApprovalState.proposalId, input.id));
          await tx.insert(schema.simulatedApprovalDecision).values({
            id: crypto.randomUUID(),
            proposalId: input.id,
            occurrenceId: `expiry:${input.id}`,
            decision: "expired",
            expectedDigest: proposal.descriptorDigest,
            actor: "local-worker",
            createdAt: now,
          });
          await tx.insert(schema.auditEvent).values({
            id: crypto.randomUUID(),
            targetApprovalId: input.id,
            actor: "local-worker",
            operation: "simulated_approval.expired",
            details: {
              eventType: "expired",
              occurrenceId: null,
              detail:
                "Pending local simulation proposal expired without an external action.",
            },
            createdAt: now,
          });
          return {
            id: input.id,
            error: new SimulatedApprovalError(
              "APPROVAL_EXPIRED",
              "Approval request expired",
            ),
          };
        }
        if (input.decision === "approve") {
          const [link] = await tx
            .select()
            .from(schema.projectResourceLink)
            .where(eq(schema.projectResourceLink.id, proposal.linkId))
            .for("share")
            .limit(1);
          const [target] = await tx
            .select({ id: schema.resource.id })
            .from(schema.resource)
            .where(eq(schema.resource.id, proposal.resourceId))
            .limit(1);
          if (
            !link ||
            link.lifecycle !== "active" ||
            link.resourceId !== proposal.resourceId ||
            link.projectId !== proposal.projectId ||
            !target
          ) {
            throw new SimulatedApprovalError(
              "LINK_NOT_ACTIVE",
              "Target link or resource is no longer active",
            );
          }
        }
        const [decision] = await tx
          .insert(schema.simulatedApprovalDecision)
          .values({
            id: crypto.randomUUID(),
            proposalId: input.id,
            occurrenceId: input.occurrenceId,
            decision: targetState,
            expectedDigest: input.expectedDigest,
            actor: "local-reviewer:unattributed",
            createdAt: now,
          })
          .onConflictDoNothing({
            target: schema.simulatedApprovalDecision.occurrenceId,
          })
          .returning({ id: schema.simulatedApprovalDecision.id });
        if (!decision) {
          throw new SimulatedApprovalError(
            "OCCURRENCE_CONFLICT",
            "Decision occurrence ID was already used",
          );
        }
        await tx
          .update(schema.simulatedApprovalState)
          .set({ state: targetState, decidedAt: now, updatedAt: now })
          .where(eq(schema.simulatedApprovalState.proposalId, input.id));
        let jobId: string | null = null;
        if (input.decision === "approve") {
          jobId = await boss.send(
            SIMULATED_APPROVAL_QUEUE,
            {
              version: 1,
              approvalId: input.id,
              descriptorDigest: proposal.descriptorDigest,
            },
            { db: fromDrizzle(tx, sql) },
          );
          if (!jobId) throw new Error("Local simulation job was not enqueued");
        }
        await tx.insert(schema.auditEvent).values({
          id: crypto.randomUUID(),
          targetApprovalId: input.id,
          actor: "local-reviewer:unattributed",
          operation: `simulated_approval.${targetState}`,
          details: {
            eventType: targetState,
            occurrenceId: input.occurrenceId,
            detail:
              input.decision === "approve"
                ? "Exact synthetic action approved for a local no-effect simulation only."
                : input.decision === "reject"
                  ? "Exact synthetic action rejected; no simulation was queued."
                  : "Exact synthetic action cancelled; no simulation was queued.",
            jobId,
          },
          createdAt: now,
        });
        return { id: input.id, error: null };
      });
      if (result.error) throw result.error;
      const approval = await repository.getById(result.id);
      if (!approval) throw new Error("Decided approval disappeared");
      return approval;
    },
  };
}
