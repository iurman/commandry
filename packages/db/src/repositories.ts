import { eq, gt, sql } from "drizzle-orm";
import type { SyntheticRun } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  auditEvent,
  resource,
  syntheticRun,
  syntheticRunAttempt,
  syntheticRunEffect,
  workerHeartbeat,
} from "./schema";

function runRecord(row: typeof syntheticRun.$inferSelect): SyntheticRun {
  return {
    id: row.id,
    occurrenceId: row.occurrenceId,
    state: row.state,
    attempts: row.attempts,
    result: row.result,
    error: row.error,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

export function createSyntheticRunRepository(db: CommandryDatabase) {
  return {
    async getById(id: string): Promise<SyntheticRun | null> {
      const [row] = await db
        .select()
        .from(syntheticRun)
        .where(eq(syntheticRun.id, id))
        .limit(1);
      return row ? runRecord(row) : null;
    },

    async beginAttempt(id: string): Promise<string | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(syntheticRun)
          .where(eq(syntheticRun.id, id))
          .for("update");
        if (!row) throw new Error("Synthetic run not found");
        if (row.state === "succeeded") return null;

        const attemptId = crypto.randomUUID();
        await tx
          .update(syntheticRun)
          .set({
            state: "running",
            attempts: sql`${syntheticRun.attempts} + 1`,
            startedAt: new Date(),
            error: null,
          })
          .where(eq(syntheticRun.id, id));
        await tx
          .insert(syntheticRunAttempt)
          .values({ id: attemptId, runId: id, state: "running" });
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:synthetic-worker",
          operation: "synthetic_run.attempt_started",
          targetRunId: id,
          details: { attempt: row.attempts + 1 },
        });
        return attemptId;
      });
    },

    async completeAttempt(
      id: string,
      attemptId: string,
      result: string,
    ): Promise<SyntheticRun> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(syntheticRun)
          .where(eq(syntheticRun.id, id))
          .for("update");
        if (!row) throw new Error("Synthetic run not found");

        const [insertedEffect] = await tx
          .insert(syntheticRunEffect)
          .values({ runId: id, result })
          .onConflictDoNothing()
          .returning();
        const finalResult =
          insertedEffect?.result ??
          (
            await tx
              .select()
              .from(syntheticRunEffect)
              .where(eq(syntheticRunEffect.runId, id))
          )[0]?.result;
        if (!finalResult)
          throw new Error("Synthetic effect could not be recorded");

        await tx
          .update(syntheticRunAttempt)
          .set({ state: "succeeded", completedAt: new Date() })
          .where(eq(syntheticRunAttempt.id, attemptId));
        const [completed] = await tx
          .update(syntheticRun)
          .set({
            state: "succeeded",
            result: finalResult,
            error: null,
            completedAt: new Date(),
          })
          .where(eq(syntheticRun.id, id))
          .returning();
        if (!completed) throw new Error("Synthetic run could not be completed");
        if (insertedEffect) {
          await tx.insert(auditEvent).values({
            id: crypto.randomUUID(),
            actor: "system:synthetic-worker",
            operation: "synthetic_run.succeeded",
            targetRunId: id,
            details: { attemptId },
          });
        }
        return runRecord(completed);
      });
    },

    async failAttempt(id: string, attemptId: string): Promise<void> {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(syntheticRun)
          .where(eq(syntheticRun.id, id))
          .for("update");
        if (!row) throw new Error("Synthetic run not found");
        await tx
          .update(syntheticRunAttempt)
          .set({
            state: "failed",
            error: "Synthetic worker attempt failed",
            completedAt: new Date(),
          })
          .where(eq(syntheticRunAttempt.id, attemptId));
        if (row.state !== "succeeded") {
          await tx
            .update(syntheticRun)
            .set({ state: "failed", error: "Synthetic worker attempt failed" })
            .where(eq(syntheticRun.id, id));
        }
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:synthetic-worker",
          operation: "synthetic_run.attempt_failed",
          targetRunId: id,
          details: { attemptId },
        });
      });
    },
  };
}

export function createResourceRepository(db: CommandryDatabase) {
  return {
    async list(input: { limit: number; cursor?: string }) {
      const rows = await db
        .select()
        .from(resource)
        .where(input.cursor ? gt(resource.id, input.cursor) : undefined)
        .orderBy(resource.id)
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map((row) => ({
          id: row.id,
          kind: row.kind,
          name: row.name,
          subtype: row.subtype,
          state: row.state,
          externalUrl: row.externalUrl,
          lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
        })),
        nextCursor:
          rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}

export function createWorkerHeartbeatRepository(db: CommandryDatabase) {
  return {
    async beat(workerId: string, releaseSha: string): Promise<void> {
      await db
        .insert(workerHeartbeat)
        .values({ workerId, releaseSha, seenAt: new Date() })
        .onConflictDoUpdate({
          target: workerHeartbeat.workerId,
          set: { releaseSha, seenAt: new Date() },
        });
    },
    async latest(): Promise<Date | null> {
      const [row] = await db
        .select()
        .from(workerHeartbeat)
        .orderBy(sql`${workerHeartbeat.seenAt} desc`)
        .limit(1);
      return row?.seenAt ?? null;
    },
  };
}
