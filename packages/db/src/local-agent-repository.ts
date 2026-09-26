import { and, desc, eq, sql } from "drizzle-orm";
import { LocalAgentError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  auditEvent,
  localAgentProfile,
  localAgentProjectAssignment,
  project,
} from "./schema";

function profileRecord(row: typeof localAgentProfile.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    runtime: "local-fake-v1" as const,
    sourceLabel: "Synthetic local agent" as const,
    isSynthetic: true as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function assignmentRecord(
  row: typeof localAgentProjectAssignment.$inferSelect,
) {
  return {
    id: row.id,
    agentId: row.agentId,
    projectId: row.projectId,
    isSynthetic: true as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Page limit must be between 1 and 100");
  }
  return limit;
}

export function createLocalAgentRepository(db: CommandryDatabase) {
  return {
    async create(input: { name: string; role?: string | undefined }) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(localAgentProfile)
          .values({
            id: crypto.randomUUID(),
            name: input.name,
            role: input.role ?? null,
          })
          .returning();
        if (!row) throw new Error("Agent profile was not inserted");
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:local-preview",
          operation: "local_agent_profile.created",
          details: { agentId: row.id },
        });
        return profileRecord(row);
      });
    },
    async getById(id: string) {
      const [row] = await db
        .select()
        .from(localAgentProfile)
        .where(eq(localAgentProfile.id, id))
        .limit(1);
      return row ? profileRecord(row) : null;
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      const limit = checkedLimit(query.limit);
      const rows = await db
        .select()
        .from(localAgentProfile)
        .where(
          query.cursor
            ? sql`(${localAgentProfile.createdAt}, ${localAgentProfile.id}) < (select "created_at", "id" from "local_agent_profile" where "id" = ${query.cursor}::uuid)`
            : undefined,
        )
        .orderBy(desc(localAgentProfile.createdAt), desc(localAgentProfile.id))
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(profileRecord),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async projectExists(projectId: string) {
      const [row] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      return Boolean(row);
    },
    async assignProject(agentId: string, projectId: string) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(localAgentProjectAssignment)
          .values({ id: crypto.randomUUID(), agentId, projectId })
          .onConflictDoNothing({
            target: [
              localAgentProjectAssignment.agentId,
              localAgentProjectAssignment.projectId,
            ],
          })
          .returning();
        if (!row) {
          throw new LocalAgentError(
            "ASSIGNMENT_EXISTS",
            "Agent is already assigned to this project",
          );
        }
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "system:local-preview",
          operation: "local_agent_project_assignment.created",
          details: { agentId, projectId, assignmentId: row.id },
        });
        return assignmentRecord(row);
      });
    },
    async listProjects(
      agentId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const rows = await db
        .select()
        .from(localAgentProjectAssignment)
        .where(
          and(
            eq(localAgentProjectAssignment.agentId, agentId),
            query.cursor
              ? sql`(${localAgentProjectAssignment.createdAt}, ${localAgentProjectAssignment.id}) < (select "created_at", "id" from "local_agent_project_assignment" where "id" = ${query.cursor}::uuid and "agent_id" = ${agentId}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(localAgentProjectAssignment.createdAt),
          desc(localAgentProjectAssignment.id),
        )
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(assignmentRecord),
        nextCursor: rows.length > limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async isAssigned(agentId: string, projectId: string) {
      const [row] = await db
        .select({ id: localAgentProjectAssignment.id })
        .from(localAgentProjectAssignment)
        .where(
          and(
            eq(localAgentProjectAssignment.agentId, agentId),
            eq(localAgentProjectAssignment.projectId, projectId),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
  };
}
