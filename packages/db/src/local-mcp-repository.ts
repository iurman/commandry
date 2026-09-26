import { and, desc, eq, sql } from "drizzle-orm";
import { LocalMcpError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  executionPacket,
  localAgentProfile,
  localAgentProjectAssignment,
  localMcpAuditEvent,
  localMcpSession,
  workItem,
} from "./schema";

function record(row: typeof localMcpSession.$inferSelect) {
  return {
    id: row.id,
    packetId: row.packetId,
    packetVersion: row.packetVersion,
    packetDigest: row.packetDigest,
    agentId: row.agentId,
    projectId: row.projectId,
    workItemId: row.workItemId,
    operations: ["project.brief.read", "work.read"] as [
      "project.brief.read",
      "work.read",
    ],
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    sourceLabel: "Local read-only MCP preview" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function auditRecord(row: typeof localMcpAuditEvent.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    actor: row.actor as
      "local-mcp-client:unattributed" | "local-reviewer:unattributed",
    operation: row.operation,
    decision: row.decision,
    code: row.code,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createLocalMcpRepository(db: CommandryDatabase) {
  return {
    async create(input: {
      packetId: string;
      packetVersion: number;
      packetDigest: string;
      projectId: string;
      workItemId: string;
      agentId: string;
      tokenDigest: string;
      ttlSeconds: number;
    }) {
      const row = await db.transaction(async (tx) => {
        const [packet] = await tx
          .select({
            packetVersion: executionPacket.packetVersion,
            packetDigest: executionPacket.contentDigest,
            projectId: executionPacket.projectId,
            workItemId: executionPacket.workItemId,
            status: workItem.status,
          })
          .from(executionPacket)
          .innerJoin(workItem, eq(workItem.id, executionPacket.workItemId))
          .where(eq(executionPacket.id, input.packetId))
          .limit(1);
        if (
          !packet ||
          packet.packetVersion !== input.packetVersion ||
          packet.packetDigest !== input.packetDigest ||
          packet.projectId !== input.projectId ||
          packet.workItemId !== input.workItemId
        )
          throw new LocalMcpError(
            "PACKET_NOT_FOUND",
            "Saved packet did not match this read session",
          );
        if (packet.status !== "open")
          throw new LocalMcpError(
            "PACKET_NOT_FOUND",
            "Packet work is not open",
          );
        const [agent] = await tx
          .select({ id: localAgentProfile.id })
          .from(localAgentProfile)
          .where(eq(localAgentProfile.id, input.agentId))
          .limit(1);
        if (!agent)
          throw new LocalMcpError("AGENT_NOT_FOUND", "Local agent not found");
        const [assignment] = await tx
          .select({ id: localAgentProjectAssignment.id })
          .from(localAgentProjectAssignment)
          .where(
            and(
              eq(localAgentProjectAssignment.agentId, input.agentId),
              eq(localAgentProjectAssignment.projectId, input.projectId),
            ),
          )
          .limit(1);
        if (!assignment)
          throw new LocalMcpError(
            "AGENT_NOT_ASSIGNED",
            "Local agent is not assigned to the packet project",
          );
        const now = new Date();
        const [inserted] = await tx
          .insert(localMcpSession)
          .values({
            id: crypto.randomUUID(),
            packetId: input.packetId,
            packetVersion: input.packetVersion,
            packetDigest: input.packetDigest,
            agentId: input.agentId,
            projectId: input.projectId,
            workItemId: input.workItemId,
            tokenDigest: input.tokenDigest,
            expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000),
            createdAt: now,
          })
          .returning();
        if (!inserted)
          throw new Error("Local MCP session insert returned no row");
        await tx.insert(localMcpAuditEvent).values({
          id: crypto.randomUUID(),
          sessionId: inserted.id,
          actor: "local-reviewer:unattributed",
          operation: "mcp_session.created",
          decision: "allowed",
          code: "SESSION_CREATED",
          reason: "Local packet-scoped read session created",
          createdAt: now,
        });
        return inserted;
      });
      return record(row);
    },
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(localMcpSession)
        .where(eq(localMcpSession.id, id))
        .limit(1);
      return row ? record(row) : null;
    },
    async getByTokenDigest(tokenDigest: string) {
      const [row] = await db
        .select()
        .from(localMcpSession)
        .where(eq(localMcpSession.tokenDigest, tokenDigest))
        .limit(1);
      return row ? record(row) : null;
    },
    async list(query: {
      limit: number;
      cursor?: string | undefined;
      packetId?: string | undefined;
    }) {
      const rows = await db
        .select()
        .from(localMcpSession)
        .where(
          and(
            query.packetId
              ? eq(localMcpSession.packetId, query.packetId)
              : undefined,
            query.cursor
              ? sql`(${localMcpSession.createdAt}, ${localMcpSession.id}) < (select "created_at", "id" from "local_mcp_session" where "id" = ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(localMcpSession.createdAt), desc(localMcpSession.id))
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(record),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async revoke(id: string) {
      await db.transaction(async (tx) => {
        const now = new Date();
        const [updated] = await tx
          .update(localMcpSession)
          .set({ revokedAt: now })
          .where(
            and(
              eq(localMcpSession.id, id),
              sql`${localMcpSession.revokedAt} is null`,
            ),
          )
          .returning({ id: localMcpSession.id });
        if (updated)
          await tx.insert(localMcpAuditEvent).values({
            id: crypto.randomUUID(),
            sessionId: id,
            actor: "local-reviewer:unattributed",
            operation: "mcp_session.revoked",
            decision: "allowed",
            code: "SESSION_REVOKED",
            reason: "Local read session revoked",
            createdAt: now,
          });
        if (!updated) {
          const [existing] = await tx
            .select({ id: localMcpSession.id })
            .from(localMcpSession)
            .where(eq(localMcpSession.id, id))
            .limit(1);
          if (!existing)
            throw new LocalMcpError(
              "SESSION_NOT_FOUND",
              "Local MCP session not found",
            );
        }
      });
      const session = await this.getById(id);
      if (!session) throw new Error("Revoked local MCP session disappeared");
      return session;
    },
    async recordAudit(input: {
      sessionId: string;
      operation: string;
      decision: "allowed" | "denied";
      code: string;
      reason: string;
    }) {
      const [row] = await db
        .insert(localMcpAuditEvent)
        .values({
          id: crypto.randomUUID(),
          sessionId: input.sessionId,
          actor: "local-mcp-client:unattributed",
          operation: input.operation,
          decision: input.decision,
          code: input.code,
          reason: input.reason,
        })
        .returning();
      if (!row) throw new Error("Local MCP audit insert returned no row");
      return auditRecord(row);
    },
    async listAudit(
      sessionId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const rows = await db
        .select()
        .from(localMcpAuditEvent)
        .where(
          and(
            eq(localMcpAuditEvent.sessionId, sessionId),
            query.cursor
              ? sql`(${localMcpAuditEvent.createdAt}, ${localMcpAuditEvent.id}) < (select "created_at", "id" from "local_mcp_audit_event" where "id" = ${query.cursor}::uuid and "session_id" = ${sessionId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(localMcpAuditEvent.createdAt),
          desc(localMcpAuditEvent.id),
        )
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(auditRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
