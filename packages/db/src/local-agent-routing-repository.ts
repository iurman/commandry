import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import {
  localAgentProfile,
  localAgentProjectAssignment,
  localAgentRun,
} from "./schema";

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Agent routing page limit must be between 1 and 100");
  return limit;
}

export function createLocalAgentRoutingRepository(db: CommandryDatabase) {
  return {
    async listAssignedCandidates(
      projectId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const limit = checkedLimit(query.limit);
      const rows = await db
        .select({
          agent: localAgentProfile,
          activeRunCount: sql<number>`(
            select count(*)::integer from local_agent_run
            where agent_id = ${localAgentProfile.id}
              and state in ('queued', 'running')
          )`.mapWith(Number),
        })
        .from(localAgentProjectAssignment)
        .innerJoin(
          localAgentProfile,
          eq(localAgentProfile.id, localAgentProjectAssignment.agentId),
        )
        .where(
          and(
            eq(localAgentProjectAssignment.projectId, projectId),
            query.cursor
              ? sql`(${localAgentProfile.createdAt}, ${localAgentProfile.id}) < (
                  select created_at, id from local_agent_profile
                  where id = ${query.cursor}::uuid
                  and exists (
                    select 1 from local_agent_project_assignment
                    where agent_id = ${query.cursor}::uuid
                      and project_id = ${projectId}::uuid
                  )
                )`
              : undefined,
          ),
        )
        .orderBy(desc(localAgentProfile.createdAt), desc(localAgentProfile.id))
        .limit(limit + 1);
      const visible = rows.slice(0, limit);
      return {
        items: visible.map(({ agent, activeRunCount }) => ({
          agent: {
            id: agent.id,
            name: agent.name,
            role: agent.role,
            runtime: "local-fake-v1" as const,
            sourceLabel: "Synthetic local agent" as const,
            isSynthetic: true as const,
            createdAt: agent.createdAt.toISOString(),
          },
          activeRunCount,
        })),
        nextCursor:
          rows.length > limit ? (visible.at(-1)?.agent.id ?? null) : null,
      };
    },
    async getLatestSucceededResult(input: {
      packetId: string;
      packetDigest: string;
      agentId: string;
    }) {
      const [row] = await db
        .select({
          id: localAgentRun.id,
          completedAt: localAgentRun.completedAt,
          result: localAgentRun.result,
        })
        .from(localAgentRun)
        .where(
          and(
            eq(localAgentRun.packetId, input.packetId),
            eq(localAgentRun.packetDigest, input.packetDigest),
            eq(localAgentRun.agentId, input.agentId),
            eq(localAgentRun.state, "succeeded"),
            isNotNull(localAgentRun.completedAt),
            isNotNull(localAgentRun.result),
          ),
        )
        .orderBy(desc(localAgentRun.completedAt), desc(localAgentRun.id))
        .limit(1);
      return row && row.completedAt
        ? {
            id: row.id,
            completedAt: row.completedAt.toISOString(),
            result: row.result,
          }
        : null;
    },
  };
}
