import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AgentRunAuditEvent } from "@commandry/contracts";
import {
  sanitizeLocalAgentAuditReason,
  type LocalAgentProgressStage,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  auditEvent,
  localAgentRun,
  localAgentRunAttempt,
  localAgentRunGrant,
  workItem,
} from "./schema";

function workRecord(row: typeof workItem.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceCaptureId: row.sourceCaptureId,
    title: row.title,
    description: row.description,
    workType: row.workType,
    generatedFromWorkItemId: row.generatedFromWorkItemId,
    assigneeKind: row.assigneeKind,
    assigneeAgentId: row.assigneeAgentId,
    assigneeLabel: row.assigneeLabel,
    status: row.status,
    priority: row.priority,
    dueOn: row.dueOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function auditRecord(row: typeof auditEvent.$inferSelect): AgentRunAuditEvent {
  const details = row.details;
  const decision: "allowed" | "denied" | null =
    details.decision === "allowed" || details.decision === "denied"
      ? details.decision
      : null;
  return {
    id: row.id,
    runId: row.targetAgentRunId!,
    actor: row.actor,
    operation: row.operation,
    decision,
    code: typeof details.code === "string" ? details.code : null,
    reason: typeof details.reason === "string" ? details.reason : null,
    stage:
      details.stage === "brief_read" ||
      details.stage === "work_read" ||
      details.stage === "result_prepared"
        ? details.stage
        : null,
    attemptId: typeof details.attemptId === "string" ? details.attemptId : null,
    projectId: typeof details.projectId === "string" ? details.projectId : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Audit page limit must be between 1 and 100");
  }
  return limit;
}

export function createLocalAgentRunRepository(db: CommandryDatabase) {
  async function getById(id: string) {
    const [row] = await db
      .select()
      .from(localAgentRun)
      .where(eq(localAgentRun.id, id))
      .limit(1);
    if (!row) return null;
    const grants = await db
      .select()
      .from(localAgentRunGrant)
      .where(eq(localAgentRunGrant.runId, id))
      .orderBy(asc(localAgentRunGrant.operation));
    const attempts = await db
      .select()
      .from(localAgentRunAttempt)
      .where(eq(localAgentRunAttempt.runId, id))
      .orderBy(asc(localAgentRunAttempt.number));
    if (grants.length === 0) {
      throw new Error("Local agent run has no read grants");
    }
    const grantExpiry = grants[0]!.expiresAt.toISOString();
    if (
      grants.some(
        (grant) =>
          grant.projectId !== row.projectId ||
          grant.expiresAt.toISOString() !== grantExpiry,
      )
    ) {
      throw new Error("Local agent run grants have inconsistent scope");
    }
    return {
      id: row.id,
      occurrenceId: row.occurrenceId,
      agentId: row.agentId,
      packetId: row.packetId,
      packetVersion: row.packetVersion,
      packetDigest: row.packetDigest,
      workItemId: row.workItemId,
      projectId: row.projectId,
      state: row.state,
      attempts: row.attempts,
      attemptHistory: attempts.map((attempt) => ({
        id: attempt.id,
        number: attempt.number,
        state: attempt.state,
        error: attempt.error,
        startedAt: attempt.startedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() ?? null,
      })),
      grant: {
        projectId: row.projectId,
        operations: grants.map((grant) => grant.operation),
        expiresAt: grantExpiry,
      },
      result: row.result as unknown,
      error: row.error,
      verificationStatus: "unverified" as const,
      runtime: "local-fake-v1" as const,
      sourceLabel: "Synthetic local agent" as const,
      isSynthetic: true as const,
      externalActions: [] as [],
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }

  return {
    getById,
    async cancel(runId: string) {
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(localAgentRun)
          .where(eq(localAgentRun.id, runId))
          .for("update")
          .limit(1);
        if (!run) return;
        if (run.state !== "queued" && run.state !== "running") return;
        const now = new Date();
        await tx
          .update(localAgentRunAttempt)
          .set({ state: "canceled", completedAt: now })
          .where(
            and(
              eq(localAgentRunAttempt.runId, runId),
              eq(localAgentRunAttempt.state, "running"),
            ),
          );
        await tx
          .update(localAgentRun)
          .set({ state: "canceled", completedAt: now })
          .where(eq(localAgentRun.id, runId));
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-reviewer:unattributed",
          operation: "local_agent_run.canceled",
          targetAgentRunId: runId,
          details: { projectId: run.projectId },
        });
      });
      return getById(runId);
    },
    async reportProgress(
      runId: string,
      attemptId: string,
      stage: LocalAgentProgressStage,
    ) {
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select({
            state: localAgentRun.state,
            projectId: localAgentRun.projectId,
          })
          .from(localAgentRun)
          .where(eq(localAgentRun.id, runId))
          .for("update")
          .limit(1);
        if (run?.state !== "running") return false;
        const [attempt] = await tx
          .select({ state: localAgentRunAttempt.state })
          .from(localAgentRunAttempt)
          .where(
            and(
              eq(localAgentRunAttempt.id, attemptId),
              eq(localAgentRunAttempt.runId, runId),
            ),
          )
          .limit(1);
        if (attempt?.state !== "running") return false;
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:local-agent-worker",
          operation: "local_agent_run.progress",
          targetAgentRunId: runId,
          details: { projectId: run.projectId, attemptId, stage },
        });
        return true;
      });
    },
    async getAuthorization(runId: string) {
      const [row] = await db
        .select()
        .from(localAgentRun)
        .where(eq(localAgentRun.id, runId))
        .limit(1);
      if (!row) return null;
      const grants = await db
        .select()
        .from(localAgentRunGrant)
        .where(eq(localAgentRunGrant.runId, runId));
      return {
        runId: row.id,
        agentId: row.agentId,
        packetId: row.packetId,
        workItemId: row.workItemId,
        projectId: row.projectId,
        state: row.state,
        grants: grants.map((grant) => ({
          projectId: grant.projectId,
          operation: grant.operation,
          expiresAt: grant.expiresAt.toISOString(),
        })),
      };
    },
    async getWorkItem(workItemId: string, projectId: string) {
      const [row] = await db
        .select()
        .from(workItem)
        .where(
          and(eq(workItem.id, workItemId), eq(workItem.projectId, projectId)),
        )
        .limit(1);
      return row ? workRecord(row) : null;
    },
    async recordAudit(input: {
      runId: string;
      agentId: string;
      projectId: string;
      operation: string;
      decision: "allowed" | "denied";
      code: string;
      reason: string;
      createdAt: string;
      origin: "worker-agent" | "manual-local-reviewer";
    }) {
      const [row] = await db
        .insert(auditEvent)
        .values({
          id: crypto.randomUUID(),
          actor:
            input.origin === "manual-local-reviewer"
              ? "local-reviewer:unattributed"
              : `synthetic-agent:${input.agentId}`,
          operation: input.operation,
          targetAgentRunId: input.runId,
          details: {
            decision: input.decision,
            code: input.code,
            reason: sanitizeLocalAgentAuditReason(input.reason),
            projectId: input.projectId,
            origin: input.origin,
          },
          createdAt: new Date(input.createdAt),
        })
        .returning();
      if (!row) throw new Error("Agent read audit was not inserted");
      return auditRecord(row);
    },
    async listAudit(
      runId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const rows = await db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.targetAgentRunId, runId),
            query.cursor
              ? sql`(${auditEvent.createdAt}, ${auditEvent.id}) < (select "created_at", "id" from "audit_event" where "id" = ${query.cursor}::uuid and "target_agent_run_id" = ${runId}::uuid)`
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
    async beginAttempt(runId: string) {
      return db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(localAgentRun)
          .where(eq(localAgentRun.id, runId))
          .for("update")
          .limit(1);
        if (!run) throw new Error("Local agent run not found");
        if (run.state === "succeeded" || run.state === "canceled") return null;
        const now = new Date();
        await tx
          .update(localAgentRunAttempt)
          .set({
            state: "failed",
            error: "Superseded by local worker redelivery",
            completedAt: now,
          })
          .where(
            and(
              eq(localAgentRunAttempt.runId, runId),
              eq(localAgentRunAttempt.state, "running"),
            ),
          );
        const number = run.attempts + 1;
        const attemptId = crypto.randomUUID();
        await tx
          .update(localAgentRun)
          .set({
            state: "running",
            attempts: number,
            error: null,
            startedAt: run.startedAt ?? now,
            completedAt: null,
          })
          .where(eq(localAgentRun.id, runId));
        await tx.insert(localAgentRunAttempt).values({
          id: attemptId,
          runId,
          number,
          state: "running",
          startedAt: now,
        });
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:local-agent-worker",
          operation: "local_agent_run.attempt.started",
          targetAgentRunId: runId,
          details: { projectId: run.projectId, attemptId, number },
        });
        return attemptId;
      });
    },
    async complete(
      runId: string,
      attemptId: string,
      result: Record<string, unknown>,
    ) {
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(localAgentRun)
          .where(eq(localAgentRun.id, runId))
          .for("update")
          .limit(1);
        if (!run) throw new Error("Local agent run not found");
        if (run.state === "succeeded" || run.state === "canceled") return;
        const [attempt] = await tx
          .select()
          .from(localAgentRunAttempt)
          .where(
            and(
              eq(localAgentRunAttempt.id, attemptId),
              eq(localAgentRunAttempt.runId, runId),
            ),
          )
          .limit(1);
        if (!attempt || attempt.state !== "running") {
          throw new Error("Local agent attempt was superseded");
        }
        const now = new Date();
        await tx
          .update(localAgentRunAttempt)
          .set({ state: "succeeded", completedAt: now })
          .where(eq(localAgentRunAttempt.id, attemptId));
        await tx
          .update(localAgentRun)
          .set({
            state: "succeeded",
            result,
            error: null,
            completedAt: now,
          })
          .where(eq(localAgentRun.id, runId));
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:local-agent-worker",
          operation: "local_agent_run.succeeded",
          targetAgentRunId: runId,
          details: { projectId: run.projectId, attemptId },
        });
      });
      const record = await getById(runId);
      if (!record) throw new Error("Completed local agent run disappeared");
      return record;
    },
    async failAttempt(runId: string, attemptId: string, error: string) {
      await db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(localAgentRun)
          .where(eq(localAgentRun.id, runId))
          .for("update")
          .limit(1);
        if (!run) throw new Error("Local agent run not found");
        const [attempt] = await tx
          .select()
          .from(localAgentRunAttempt)
          .where(
            and(
              eq(localAgentRunAttempt.id, attemptId),
              eq(localAgentRunAttempt.runId, runId),
            ),
          )
          .limit(1);
        if (!attempt || attempt.state !== "running") return;
        const now = new Date();
        const safeError = sanitizeLocalAgentAuditReason(error);
        await tx
          .update(localAgentRunAttempt)
          .set({ state: "failed", error: safeError, completedAt: now })
          .where(eq(localAgentRunAttempt.id, attemptId));
        if (run.state !== "succeeded" && run.attempts === attempt.number) {
          await tx
            .update(localAgentRun)
            .set({ state: "failed", error: safeError, completedAt: now })
            .where(eq(localAgentRun.id, runId));
        }
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:local-agent-worker",
          operation: "local_agent_run.attempt.failed",
          targetAgentRunId: runId,
          details: { projectId: run.projectId, attemptId, error: safeError },
        });
      });
    },
  };
}
