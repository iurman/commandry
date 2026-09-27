import { and, desc, eq, sql } from "drizzle-orm";
import type {
  CreateWorkRecurrenceRequest,
  UpdateWorkRecurrenceRequest,
} from "@commandry/contracts";
import {
  firstWorkRecurrenceAfter,
  generatedWorkDraft,
  requireWorkRecurrenceSchedule,
  requireWorkRecurrenceSource,
  WorkRecurrenceError,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  workItem,
  workRecurrenceAuditEvent,
  workRecurrenceDefinition,
  workRecurrenceOccurrence,
} from "./schema";

function definitionRecord(row: typeof workRecurrenceDefinition.$inferSelect) {
  return {
    id: row.id,
    sourceWorkItemId: row.sourceWorkItemId,
    projectId: row.projectId,
    startAt: row.startAt.toISOString(),
    everyMinutes: row.everyMinutes,
    nextOccurrenceAt: row.nextOccurrenceAt.toISOString(),
    enabled: row.enabled,
    sourceOfTruth: "local-only" as const,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function occurrenceRecord(row: typeof workRecurrenceOccurrence.$inferSelect) {
  return {
    id: row.id,
    definitionId: row.definitionId,
    scheduledFor: row.scheduledFor.toISOString(),
    state: row.state,
    generatedWorkItemId: row.generatedWorkItemId,
    attempts: row.attempts,
    lastError: row.lastError,
    sourceLabel: "Local worker-created task" as const,
    externalActions: [] as [],
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function auditRecord(row: typeof workRecurrenceAuditEvent.$inferSelect) {
  return {
    id: row.id,
    definitionId: row.definitionId,
    occurrenceId: row.occurrenceId,
    operation: row.operation as
      | "work.recurrence.created"
      | "work.recurrence.updated"
      | "work.recurrence.occurrence_queued"
      | "work.recurrence.occurrences_skipped"
      | "work.recurrence.attempt_started"
      | "work.recurrence.occurrence_generated"
      | "work.recurrence.attempt_failed",
    actor: row.actor as
      | "local-user:unattributed"
      | "system:local-work-scheduler"
      | "system:local-work-worker",
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Page limit must be between 1 and 100");
  return limit;
}

export function createWorkRecurrenceRepository(db: CommandryDatabase) {
  return {
    async getDefinitionByWorkItemId(workItemId: string) {
      const [row] = await db
        .select()
        .from(workRecurrenceDefinition)
        .where(eq(workRecurrenceDefinition.sourceWorkItemId, workItemId))
        .limit(1);
      return row ? definitionRecord(row) : null;
    },
    async getDefinitionById(id: string) {
      const [row] = await db
        .select()
        .from(workRecurrenceDefinition)
        .where(eq(workRecurrenceDefinition.id, id))
        .limit(1);
      return row ? definitionRecord(row) : null;
    },
    async createDefinition(
      sourceWorkItemId: string,
      input: CreateWorkRecurrenceRequest,
    ) {
      return db.transaction(async (tx) => {
        const [source] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, sourceWorkItemId))
          .for("update")
          .limit(1);
        if (!source)
          throw new WorkRecurrenceError(
            "WORK_ITEM_NOT_FOUND",
            "Work item not found",
          );
        requireWorkRecurrenceSource(source);
        const [existing] = await tx
          .select({ id: workRecurrenceDefinition.id })
          .from(workRecurrenceDefinition)
          .where(
            eq(workRecurrenceDefinition.sourceWorkItemId, sourceWorkItemId),
          )
          .limit(1);
        if (existing)
          throw new WorkRecurrenceError(
            "RECURRENCE_ALREADY_EXISTS",
            "This Work item already has a recurring definition",
          );
        const now = new Date();
        const schedule = requireWorkRecurrenceSchedule(input, now);
        const [row] = await tx
          .insert(workRecurrenceDefinition)
          .values({
            id: crypto.randomUUID(),
            sourceWorkItemId,
            projectId: source.projectId,
            startAt: schedule.startAt,
            everyMinutes: schedule.everyMinutes,
            nextOccurrenceAt: schedule.startAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!row) throw new Error("Recurring Work definition was not inserted");
        await tx.insert(workRecurrenceAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: row.id,
          operation: "work.recurrence.created",
          actor: "local-user:unattributed",
          details: {
            startAt: row.startAt.toISOString(),
            everyMinutes: row.everyMinutes,
            sourceWorkItemId,
          },
          createdAt: now,
        });
        return definitionRecord(row);
      });
    },
    async updateDefinition(
      sourceWorkItemId: string,
      input: UpdateWorkRecurrenceRequest,
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workRecurrenceDefinition)
          .where(
            eq(workRecurrenceDefinition.sourceWorkItemId, sourceWorkItemId),
          )
          .for("update")
          .limit(1);
        if (!current)
          throw new WorkRecurrenceError(
            "RECURRENCE_NOT_FOUND",
            "Recurring Work definition not found",
          );
        if (current.updatedAt.toISOString() !== input.expectedUpdatedAt)
          throw new WorkRecurrenceError(
            "RECURRENCE_CONFLICT",
            "Recurring Work changed; refresh before editing",
          );
        const now = new Date(
          Math.max(Date.now(), current.updatedAt.getTime() + 1),
        );
        const schedule = requireWorkRecurrenceSchedule(input, now, true);
        if (
          current.startAt.getTime() === schedule.startAt.getTime() &&
          current.everyMinutes === schedule.everyMinutes &&
          current.enabled === input.enabled
        )
          throw new WorkRecurrenceError(
            "RECURRENCE_CONFLICT",
            "Recurring Work is already set to those values",
          );
        const nextAt = firstWorkRecurrenceAfter(
          schedule.startAt,
          schedule.everyMinutes,
          now,
        );
        const [updated] = await tx
          .update(workRecurrenceDefinition)
          .set({
            startAt: schedule.startAt,
            everyMinutes: schedule.everyMinutes,
            nextOccurrenceAt: nextAt,
            enabled: input.enabled,
            updatedAt: now,
          })
          .where(eq(workRecurrenceDefinition.id, current.id))
          .returning();
        if (!updated) throw new Error("Locked recurrence disappeared");
        await tx.insert(workRecurrenceAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId: current.id,
          operation: "work.recurrence.updated",
          actor: "local-user:unattributed",
          details: {
            previousEnabled: current.enabled,
            enabled: updated.enabled,
            previousEveryMinutes: current.everyMinutes,
            everyMinutes: updated.everyMinutes,
            nextOccurrenceAt: updated.nextOccurrenceAt.toISOString(),
          },
          createdAt: now,
        });
        return definitionRecord(updated);
      });
    },
    async listOccurrences(
      sourceWorkItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const [definition] = await db
        .select({ id: workRecurrenceDefinition.id })
        .from(workRecurrenceDefinition)
        .where(eq(workRecurrenceDefinition.sourceWorkItemId, sourceWorkItemId))
        .limit(1);
      if (!definition) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workRecurrenceOccurrence)
        .where(
          and(
            eq(workRecurrenceOccurrence.definitionId, definition.id),
            query.cursor
              ? sql`(${workRecurrenceOccurrence.scheduledFor}, ${workRecurrenceOccurrence.id}) < (select scheduled_for, id from work_recurrence_occurrence where id = ${query.cursor}::uuid and definition_id = ${definition.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workRecurrenceOccurrence.scheduledFor),
          desc(workRecurrenceOccurrence.id),
        )
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(occurrenceRecord),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async getOccurrenceById(id: string) {
      const [row] = await db
        .select()
        .from(workRecurrenceOccurrence)
        .where(eq(workRecurrenceOccurrence.id, id))
        .limit(1);
      return row ? occurrenceRecord(row) : null;
    },
    async listAudit(
      sourceWorkItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const [definition] = await db
        .select({ id: workRecurrenceDefinition.id })
        .from(workRecurrenceDefinition)
        .where(eq(workRecurrenceDefinition.sourceWorkItemId, sourceWorkItemId))
        .limit(1);
      if (!definition) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workRecurrenceAuditEvent)
        .where(
          and(
            eq(workRecurrenceAuditEvent.definitionId, definition.id),
            query.cursor
              ? sql`(${workRecurrenceAuditEvent.createdAt}, ${workRecurrenceAuditEvent.id}) < (select created_at, id from work_recurrence_audit_event where id = ${query.cursor}::uuid and definition_id = ${definition.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workRecurrenceAuditEvent.createdAt),
          desc(workRecurrenceAuditEvent.id),
        )
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(auditRecord),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async beginOccurrence(occurrenceId: string, definitionId: string) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workRecurrenceOccurrence)
          .where(eq(workRecurrenceOccurrence.id, occurrenceId))
          .for("update")
          .limit(1);
        if (!current || current.definitionId !== definitionId)
          throw new WorkRecurrenceError(
            "RECURRENCE_NOT_FOUND",
            "Recurring Work occurrence not found",
          );
        if (current.state === "generated") return occurrenceRecord(current);
        const [started] = await tx
          .update(workRecurrenceOccurrence)
          .set({
            state: "running",
            attempts: current.attempts + 1,
            lastError: null,
            completedAt: null,
          })
          .where(eq(workRecurrenceOccurrence.id, occurrenceId))
          .returning();
        if (!started) throw new Error("Locked occurrence disappeared");
        await tx.insert(workRecurrenceAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId,
          occurrenceId,
          operation: "work.recurrence.attempt_started",
          actor: "system:local-work-worker",
          details: { attempt: started.attempts },
        });
        return occurrenceRecord(started);
      });
    },
    async finishOccurrence(occurrenceId: string, definitionId: string) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workRecurrenceOccurrence)
          .where(eq(workRecurrenceOccurrence.id, occurrenceId))
          .for("update")
          .limit(1);
        if (!current || current.definitionId !== definitionId)
          throw new WorkRecurrenceError(
            "RECURRENCE_NOT_FOUND",
            "Recurring Work occurrence not found",
          );
        if (current.state === "generated") return occurrenceRecord(current);
        const [definition] = await tx
          .select()
          .from(workRecurrenceDefinition)
          .where(eq(workRecurrenceDefinition.id, definitionId))
          .limit(1);
        if (!definition)
          throw new WorkRecurrenceError(
            "RECURRENCE_NOT_FOUND",
            "Recurring Work definition not found",
          );
        const [source] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, definition.sourceWorkItemId))
          .limit(1);
        if (!source || source.projectId !== definition.projectId)
          throw new WorkRecurrenceError(
            "RECURRENCE_INVALID_SOURCE",
            "Recurring Work source or project changed",
          );
        requireWorkRecurrenceSource(source);
        const now = new Date();
        const generatedId = crypto.randomUUID();
        await tx.insert(workItem).values({
          id: generatedId,
          ...generatedWorkDraft(source, current.scheduledFor),
          createdAt: now,
          updatedAt: now,
        });
        const [completed] = await tx
          .update(workRecurrenceOccurrence)
          .set({
            state: "generated",
            generatedWorkItemId: generatedId,
            lastError: null,
            completedAt: now,
          })
          .where(eq(workRecurrenceOccurrence.id, occurrenceId))
          .returning();
        if (!completed) throw new Error("Locked occurrence disappeared");
        await tx.insert(workRecurrenceAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId,
          occurrenceId,
          operation: "work.recurrence.occurrence_generated",
          actor: "system:local-work-worker",
          details: {
            generatedWorkItemId: generatedId,
            sourceCaptureId: source.sourceCaptureId,
            scheduledFor: current.scheduledFor.toISOString(),
            externalActions: [],
          },
          createdAt: now,
        });
        return occurrenceRecord(completed);
      });
    },
    async failOccurrence(
      occurrenceId: string,
      definitionId: string,
      reason: string,
    ) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workRecurrenceOccurrence)
          .where(eq(workRecurrenceOccurrence.id, occurrenceId))
          .for("update")
          .limit(1);
        if (
          !current ||
          current.definitionId !== definitionId ||
          current.state === "generated"
        )
          return;
        const now = new Date();
        await tx
          .update(workRecurrenceOccurrence)
          .set({ state: "failed", lastError: reason, completedAt: now })
          .where(eq(workRecurrenceOccurrence.id, occurrenceId));
        await tx.insert(workRecurrenceAuditEvent).values({
          id: crypto.randomUUID(),
          definitionId,
          occurrenceId,
          operation: "work.recurrence.attempt_failed",
          actor: "system:local-work-worker",
          details: { attempt: current.attempts, reason },
          createdAt: now,
        });
      });
    },
  };
}
