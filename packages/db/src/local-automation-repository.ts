import { and, asc, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import {
  automationRunResultSchema,
  type AutomationRunResult,
} from "@commandry/contracts";
import { LocalAutomationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  automationAuditEvent,
  automationDefinition,
  automationRun,
  automationRunAttempt,
} from "./schema";

export function automationDefinitionRecord(
  row: typeof automationDefinition.$inferSelect,
  queuedRunAt: Date | null = null,
) {
  const recurringAt = row.enabled ? row.nextOccurrenceAt : null;
  const nextRunAt =
    queuedRunAt && recurringAt
      ? new Date(Math.min(queuedRunAt.getTime(), recurringAt.getTime()))
      : (queuedRunAt ?? recurringAt);
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    routine: "local_project_summary_v1" as const,
    triggerType: row.triggerType,
    enabled: row.enabled,
    sourceOfTruth: "local-only" as const,
    recurrenceStartAt: row.recurrenceStartAt?.toISOString() ?? null,
    recurrenceEveryMinutes: row.recurrenceEveryMinutes,
    nextRunAt: nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function automationRunRecord(row: typeof automationRun.$inferSelect) {
  return {
    id: row.id,
    definitionId: row.definitionId,
    projectId: row.projectId,
    occurrenceId: row.occurrenceId,
    trigger: row.trigger,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    state: row.state,
    attempts: row.attempts,
    result: row.result ? automationRunResultSchema.parse(row.result) : null,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function attemptRecord(row: typeof automationRunAttempt.$inferSelect) {
  return {
    id: row.id,
    runId: row.runId,
    ordinal: row.ordinal,
    state: row.state,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function auditRecord(row: typeof automationAuditEvent.$inferSelect) {
  return {
    id: row.id,
    definitionId: row.definitionId,
    runId: row.runId,
    actor: row.actor,
    operation: row.operation,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

type PageQuery = { limit: number; cursor?: string | undefined };

export function createLocalAutomationRepository(db: CommandryDatabase) {
  return {
    async getDefinition(id: string) {
      const [row] = await db
        .select()
        .from(automationDefinition)
        .where(eq(automationDefinition.id, id))
        .limit(1);
      if (!row) return null;
      const [pending] = await db
        .select({ scheduledFor: automationRun.scheduledFor })
        .from(automationRun)
        .where(
          and(
            eq(automationRun.definitionId, id),
            eq(automationRun.state, "queued"),
            eq(automationRun.trigger, "scheduled"),
            isNotNull(automationRun.scheduledFor),
          ),
        )
        .orderBy(asc(automationRun.scheduledFor))
        .limit(1);
      return automationDefinitionRecord(row, pending?.scheduledFor ?? null);
    },
    async listDefinitions(
      query: PageQuery & { projectId?: string | undefined },
    ) {
      const rows = await db
        .select()
        .from(automationDefinition)
        .where(
          and(
            query.projectId
              ? eq(automationDefinition.projectId, query.projectId)
              : undefined,
            query.cursor
              ? gt(automationDefinition.id, query.cursor)
              : undefined,
          ),
        )
        .orderBy(automationDefinition.id)
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      const scheduled = visible.length
        ? await db
            .select({
              definitionId: automationRun.definitionId,
              nextRunAt: sql<string>`min(${automationRun.scheduledFor})`,
            })
            .from(automationRun)
            .where(
              and(
                inArray(
                  automationRun.definitionId,
                  visible.map((row) => row.id),
                ),
                eq(automationRun.state, "queued"),
                eq(automationRun.trigger, "scheduled"),
                isNotNull(automationRun.scheduledFor),
              ),
            )
            .groupBy(automationRun.definitionId)
        : [];
      const dueByDefinition = new Map(
        scheduled.map((row) => [row.definitionId, row.nextRunAt]),
      );
      return {
        items: visible.map((row) =>
          automationDefinitionRecord(
            row,
            dueByDefinition.get(row.id)
              ? new Date(dueByDefinition.get(row.id)!)
              : null,
          ),
        ),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async getRun(id: string) {
      const [row] = await db
        .select()
        .from(automationRun)
        .where(eq(automationRun.id, id))
        .limit(1);
      return row ? automationRunRecord(row) : null;
    },
    async listRuns(definitionId: string, query: PageQuery) {
      const [definition] = await db
        .select({ id: automationDefinition.id })
        .from(automationDefinition)
        .where(eq(automationDefinition.id, definitionId))
        .limit(1);
      if (!definition)
        throw new LocalAutomationError(
          "AUTOMATION_NOT_FOUND",
          "Automation not found",
        );
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: automationRun.createdAt })
            .from(automationRun)
            .where(
              and(
                eq(automationRun.id, query.cursor),
                eq(automationRun.definitionId, definitionId),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(automationRun)
        .where(
          and(
            eq(automationRun.definitionId, definitionId),
            anchor
              ? sql`(${automationRun.createdAt}, ${automationRun.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(automationRun.createdAt), desc(automationRun.id))
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(automationRunRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async listAttempts(runId: string, query: PageQuery) {
      const [run] = await db
        .select({ id: automationRun.id })
        .from(automationRun)
        .where(eq(automationRun.id, runId))
        .limit(1);
      if (!run)
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Automation run not found",
        );
      const rows = await db
        .select()
        .from(automationRunAttempt)
        .where(
          and(
            eq(automationRunAttempt.runId, runId),
            query.cursor
              ? gt(automationRunAttempt.id, query.cursor)
              : undefined,
          ),
        )
        .orderBy(automationRunAttempt.id)
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(attemptRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async listAudit(definitionId: string, query: PageQuery) {
      const [definition] = await db
        .select({ id: automationDefinition.id })
        .from(automationDefinition)
        .where(eq(automationDefinition.id, definitionId))
        .limit(1);
      if (!definition)
        throw new LocalAutomationError(
          "AUTOMATION_NOT_FOUND",
          "Automation not found",
        );
      const rows = await db
        .select()
        .from(automationAuditEvent)
        .where(
          and(
            eq(automationAuditEvent.definitionId, definitionId),
            query.cursor
              ? gt(automationAuditEvent.id, query.cursor)
              : undefined,
          ),
        )
        .orderBy(automationAuditEvent.id)
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(auditRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async beginAttempt(runId: string) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(automationRun)
          .where(eq(automationRun.id, runId))
          .for("update")
          .limit(1);
        if (!current)
          throw new LocalAutomationError(
            "AUTOMATION_RUN_NOT_FOUND",
            "Automation run not found",
          );
        if (current.state === "succeeded" || current.state === "skipped")
          return null;
        const [definition] = await tx
          .select({ enabled: automationDefinition.enabled })
          .from(automationDefinition)
          .where(eq(automationDefinition.id, current.definitionId))
          .for("update")
          .limit(1);
        if (!definition)
          throw new LocalAutomationError(
            "AUTOMATION_NOT_FOUND",
            "Automation not found",
          );
        if (!definition.enabled) {
          const now = new Date();
          await tx
            .update(automationRun)
            .set({
              state: "skipped",
              error: "Disabled before execution",
              completedAt: now,
            })
            .where(eq(automationRun.id, runId));
          await tx.insert(automationAuditEvent).values({
            id: crypto.randomUUID(),
            definitionId: current.definitionId,
            runId,
            actor: "system:local-automation-worker",
            operation: "automation.run_skipped",
            details: { reason: "disabled" },
            createdAt: now,
          });
          return null;
        }
        const now = new Date();
        const ordinal = current.attempts + 1;
        const attemptId = crypto.randomUUID();
        await tx
          .update(automationRun)
          .set({
            state: "running",
            attempts: ordinal,
            startedAt: now,
            error: null,
          })
          .where(eq(automationRun.id, runId));
        await tx.insert(automationRunAttempt).values({
          id: attemptId,
          runId,
          ordinal,
          state: "running",
          createdAt: now,
        });
        await tx.insert(automationAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: current.definitionId,
          runId,
          actor: "system:local-automation-worker",
          operation: "automation.attempt_started",
          details: { ordinal },
          createdAt: now,
        });
        return attemptId;
      });
    },
    async recordRead(runId: string, asOf: string) {
      const [current] = await db
        .select({
          definitionId: automationRun.definitionId,
          projectId: automationRun.projectId,
          state: automationRun.state,
        })
        .from(automationRun)
        .where(eq(automationRun.id, runId))
        .limit(1);
      if (!current || current.state !== "running")
        throw new LocalAutomationError(
          "AUTOMATION_RUN_NOT_FOUND",
          "Running automation not found",
        );
      await db.insert(automationAuditEvent).values({
        id: crypto.randomUUID(),
        definitionId: current.definitionId,
        runId,
        actor: "system:local-automation-worker",
        operation: "automation.project_brief_read",
        details: { projectId: current.projectId, asOf },
      });
    },
    async complete(
      runId: string,
      attemptId: string,
      result: AutomationRunResult,
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(automationRun)
          .where(eq(automationRun.id, runId))
          .for("update")
          .limit(1);
        if (!current)
          throw new LocalAutomationError(
            "AUTOMATION_RUN_NOT_FOUND",
            "Automation run not found",
          );
        if (current.state === "succeeded") return automationRunRecord(current);
        const now = new Date();
        await tx
          .update(automationRunAttempt)
          .set({ state: "succeeded", completedAt: now })
          .where(
            and(
              eq(automationRunAttempt.id, attemptId),
              eq(automationRunAttempt.runId, runId),
            ),
          );
        const [updated] = await tx
          .update(automationRun)
          .set({ state: "succeeded", result, error: null, completedAt: now })
          .where(eq(automationRun.id, runId))
          .returning();
        if (!updated) throw new Error("Locked automation run disappeared");
        await tx.insert(automationAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: current.definitionId,
          runId,
          actor: "system:local-automation-worker",
          operation: "automation.run_succeeded",
          details: { attemptId, evidenceCount: result.evidence.length },
          createdAt: now,
        });
        return automationRunRecord(updated);
      });
    },
    async failAttempt(runId: string, attemptId: string) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(automationRun)
          .where(eq(automationRun.id, runId))
          .for("update")
          .limit(1);
        if (!current)
          throw new LocalAutomationError(
            "AUTOMATION_RUN_NOT_FOUND",
            "Automation run not found",
          );
        if (current.state === "succeeded") return;
        const now = new Date();
        const error = "Local project summary attempt failed";
        await tx
          .update(automationRunAttempt)
          .set({ state: "failed", error, completedAt: now })
          .where(
            and(
              eq(automationRunAttempt.id, attemptId),
              eq(automationRunAttempt.runId, runId),
            ),
          );
        await tx
          .update(automationRun)
          .set({ state: "failed", error, completedAt: now })
          .where(eq(automationRun.id, runId));
        await tx.insert(automationAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: current.definitionId,
          runId,
          actor: "system:local-automation-worker",
          operation: "automation.attempt_failed",
          details: { attemptId },
          createdAt: now,
        });
      });
    },
  };
}
