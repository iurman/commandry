import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { localAgentRun, project } from "./schema";

type FindingRow = {
  runId: string;
  projectId: string;
  agentId: string;
  agentName: string;
  workItemId: string;
  workTitle: string;
  packetId: string;
  packetDigest: string;
  completedAt: Date | string;
  result: unknown;
};

export function createProjectAgentFindingsRepository(db: CommandryDatabase) {
  return {
    async projectExists(projectId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      return Boolean(row);
    },
    async cursorExists(projectId: string, runId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: localAgentRun.id })
        .from(localAgentRun)
        .where(
          and(
            eq(localAgentRun.id, runId),
            eq(localAgentRun.projectId, projectId),
            eq(localAgentRun.state, "succeeded"),
            isNotNull(localAgentRun.completedAt),
            isNotNull(localAgentRun.result),
          ),
        )
        .limit(1);
      return Boolean(row);
    },
    async listRows(
      projectId: string,
      query: { limit: number; cursor?: string | undefined },
    ): Promise<{ items: FindingRow[]; hasMore: boolean }> {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50)
        throw new Error("Finding page limit must be between 1 and 50");
      const cursorFilter = query.cursor
        ? sql`and (run.completed_at, run.id) < (
            select anchor.completed_at, anchor.id
            from local_agent_run anchor
            where anchor.id = ${query.cursor}::uuid
              and anchor.project_id = ${projectId}::uuid
          )`
        : sql``;
      const page = await db.execute<FindingRow>(sql`
        select run.id as "runId", run.project_id as "projectId",
          run.agent_id as "agentId", agent.name as "agentName",
          run.work_item_id as "workItemId", work.title as "workTitle",
          run.packet_id as "packetId", run.packet_digest as "packetDigest",
          run.completed_at as "completedAt", run.result
        from local_agent_run run
        join local_agent_profile agent on agent.id = run.agent_id
        join work_item work on work.id = run.work_item_id
        where run.project_id = ${projectId}::uuid
          and run.state = 'succeeded'
          and run.completed_at is not null
          and run.result is not null
          ${cursorFilter}
        order by run.completed_at desc, run.id desc
        limit ${query.limit + 1}
      `);
      return {
        items: page.rows.slice(0, query.limit),
        hasMore: page.rows.length > query.limit,
      };
    },
  };
}
