import { and, desc, eq, gt, lte, or, sql } from "drizzle-orm";
import { OvernightQueueError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  executionPacket,
  localAgentProfile,
  localAgentProjectAssignment,
  localAgentRun,
  overnightQueueAuditEvent,
  overnightQueueEntry,
  project,
  workItem,
  workItemRelation,
} from "./schema";

const columns = {
  entry: overnightQueueEntry,
  projectName: project.name,
  workTitle: workItem.title,
  agentName: localAgentProfile.name,
  runState: localAgentRun.state,
};

function record(row: {
  entry: typeof overnightQueueEntry.$inferSelect;
  projectName: string;
  workTitle: string;
  agentName: string;
  runState: typeof localAgentRun.$inferSelect.state | null;
}) {
  const entry = row.entry;
  return {
    id: entry.id,
    packetId: entry.packetId,
    packetVersion: entry.packetVersion,
    packetDigest: entry.packetDigest,
    projectId: entry.projectId,
    projectName: row.projectName,
    workItemId: entry.workItemId,
    workTitle: row.workTitle,
    agentId: entry.agentId,
    agentName: row.agentName,
    runAfter: entry.runAfter.toISOString(),
    state: entry.state,
    runId: entry.runId,
    runState: row.runState,
    blockedReason: entry.blockedReason,
    sourceLabel: "Synthetic local overnight queue" as const,
    isSynthetic: true as const,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function baseQuery(db: CommandryDatabase) {
  return db
    .select(columns)
    .from(overnightQueueEntry)
    .innerJoin(project, eq(project.id, overnightQueueEntry.projectId))
    .innerJoin(workItem, eq(workItem.id, overnightQueueEntry.workItemId))
    .innerJoin(
      localAgentProfile,
      eq(localAgentProfile.id, overnightQueueEntry.agentId),
    )
    .leftJoin(localAgentRun, eq(localAgentRun.id, overnightQueueEntry.runId));
}

export function createOvernightQueueRepository(db: CommandryDatabase) {
  return {
    async getContext(packetId: string, agentId: string) {
      const [packetRows, agentRows] = await Promise.all([
        db
          .select({
            projectId: executionPacket.projectId,
            workItemId: workItem.id,
            status: workItem.status,
          })
          .from(executionPacket)
          .innerJoin(workItem, eq(workItem.id, executionPacket.workItemId))
          .where(eq(executionPacket.id, packetId))
          .limit(1),
        db
          .select({ id: localAgentProfile.id })
          .from(localAgentProfile)
          .where(eq(localAgentProfile.id, agentId))
          .limit(1),
      ]);
      const packet = packetRows[0];
      const agent = agentRows[0];
      const [openBlocker] = packet
        ? await db
            .select({ id: workItemRelation.id })
            .from(workItemRelation)
            .innerJoin(
              workItem,
              eq(workItem.id, workItemRelation.sourceWorkItemId),
            )
            .where(
              and(
                eq(workItemRelation.targetWorkItemId, packet.workItemId),
                eq(workItemRelation.type, "blocks"),
                eq(workItemRelation.state, "active"),
                eq(workItem.status, "open"),
              ),
            )
            .limit(1)
        : [];
      const [assignment] =
        packet && agent
          ? await db
              .select({ id: localAgentProjectAssignment.id })
              .from(localAgentProjectAssignment)
              .where(
                and(
                  eq(localAgentProjectAssignment.agentId, agentId),
                  eq(localAgentProjectAssignment.projectId, packet.projectId),
                ),
              )
              .limit(1)
          : [];
      return {
        packetExists: Boolean(packet),
        packetWorkOpen: packet?.status === "open",
        packetWorkUnblocked: !openBlocker,
        agentExists: Boolean(agent),
        agentAssigned: Boolean(assignment),
      };
    },
    async getById(id: string) {
      const [row] = await baseQuery(db)
        .where(eq(overnightQueueEntry.id, id))
        .limit(1);
      return row ? record(row) : null;
    },
    async list(query: {
      limit: number;
      cursor?: string | undefined;
      projectId?: string | undefined;
    }) {
      const rows = await baseQuery(db)
        .where(
          and(
            query.projectId
              ? eq(overnightQueueEntry.projectId, query.projectId)
              : undefined,
            query.cursor
              ? sql`(${overnightQueueEntry.createdAt}, ${overnightQueueEntry.id}) < (select "created_at", "id" from "overnight_queue_entry" where "id" = ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(overnightQueueEntry.createdAt),
          desc(overnightQueueEntry.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(record),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.entry.id ?? null) : null,
      };
    },
    async cancel(id: string) {
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(overnightQueueEntry)
          .set({ state: "canceled", updatedAt: new Date() })
          .where(
            and(
              eq(overnightQueueEntry.id, id),
              eq(overnightQueueEntry.state, "scheduled"),
            ),
          )
          .returning({ id: overnightQueueEntry.id });
        if (!updated) {
          const [existing] = await tx
            .select({ id: overnightQueueEntry.id })
            .from(overnightQueueEntry)
            .where(eq(overnightQueueEntry.id, id))
            .limit(1);
          throw new OvernightQueueError(
            existing ? "NOT_CANCELABLE" : "ENTRY_NOT_FOUND",
            existing
              ? "Only a scheduled entry can be canceled"
              : "Overnight queue entry not found",
          );
        }
        await tx.insert(overnightQueueAuditEvent).values({
          id: crypto.randomUUID(),
          entryId: id,
          actor: "local-user:unattributed",
          operation: "overnight_queue.canceled",
        });
      });
      const entry = await this.getById(id);
      if (!entry) throw new Error("Canceled overnight entry disappeared");
      return entry;
    },
    async claimForDispatch(id: string) {
      const [row] = await db
        .update(overnightQueueEntry)
        .set({ state: "dispatching", updatedAt: new Date() })
        .where(
          and(
            eq(overnightQueueEntry.id, id),
            eq(overnightQueueEntry.state, "scheduled"),
          ),
        )
        .returning({ id: overnightQueueEntry.id });
      return Boolean(row);
    },
    async markBlocked(id: string, reason: string) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(overnightQueueEntry)
          .set({
            state: "blocked",
            blockedReason: reason.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(overnightQueueEntry.id, id),
              eq(overnightQueueEntry.state, "dispatching"),
            ),
          )
          .returning({ id: overnightQueueEntry.id });
        if (row)
          await tx.insert(overnightQueueAuditEvent).values({
            id: crypto.randomUUID(),
            entryId: id,
            actor: "system:worker",
            operation: "overnight_queue.blocked",
            details: { reason: reason.slice(0, 500) },
          });
      });
    },
    async markDispatched(id: string, runId: string) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(overnightQueueEntry)
          .set({ state: "dispatched", runId, updatedAt: new Date() })
          .where(
            and(
              eq(overnightQueueEntry.id, id),
              eq(overnightQueueEntry.state, "dispatching"),
            ),
          )
          .returning({ id: overnightQueueEntry.id });
        if (row)
          await tx.insert(overnightQueueAuditEvent).values({
            id: crypto.randomUUID(),
            entryId: id,
            actor: "system:worker",
            operation: "overnight_queue.dispatched",
            details: { runId },
          });
      });
    },
    async listAudit(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const rows = await db
        .select()
        .from(overnightQueueAuditEvent)
        .where(
          and(
            eq(overnightQueueAuditEvent.entryId, id),
            query.cursor
              ? sql`(${overnightQueueAuditEvent.createdAt}, ${overnightQueueAuditEvent.id}) < (select "created_at", "id" from "overnight_queue_audit_event" where "id" = ${query.cursor}::uuid and "entry_id" = ${id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(overnightQueueAuditEvent.createdAt),
          desc(overnightQueueAuditEvent.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async listRecoverable(now: Date, cursor?: string) {
      const stale = new Date(now.getTime() - 60_000);
      const rows = await db
        .select({ id: overnightQueueEntry.id })
        .from(overnightQueueEntry)
        .where(
          and(
            cursor ? gt(overnightQueueEntry.id, cursor) : undefined,
            or(
              and(
                eq(overnightQueueEntry.state, "scheduled"),
                lte(overnightQueueEntry.runAfter, now),
              ),
              and(
                eq(overnightQueueEntry.state, "dispatching"),
                lte(overnightQueueEntry.updatedAt, stale),
              ),
            ),
          ),
        )
        .orderBy(overnightQueueEntry.id)
        .limit(100);
      return rows.map((row) => row.id);
    },
  };
}
