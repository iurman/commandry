import { eq, sql } from "drizzle-orm";
import type { ProjectFlowItem } from "@commandry/contracts";
import type { CommandryDatabase } from "./client";
import { project } from "./schema";

type ProjectFlowCursor = {
  occurredAt: string;
  kind: ProjectFlowItem["kind"];
  id: string;
};
type ProjectFlowRawRow = {
  id: string;
  kind: ProjectFlowItem["kind"];
  occurredAt: Date | string;
  recordedAt: Date | string;
  title: string;
  state: string;
  detail: string | null;
  sourceLabel: string;
  isSynthetic: boolean;
  primaryId: string | null;
  primaryName: string | null;
  secondaryId: string | null;
  secondaryName: string | null;
};

export function createProjectFlowRepository(db: CommandryDatabase) {
  return {
    async getProjectById(id: string) {
      const [row] = await db
        .select({ id: project.id, name: project.name })
        .from(project)
        .where(eq(project.id, id))
        .limit(1);
      return row ?? null;
    },
    async listRaw(
      projectId: string,
      query: { limit: number; cursor?: ProjectFlowCursor | undefined },
    ): Promise<{ items: ProjectFlowRawRow[]; hasMore: boolean }> {
      if (
        !Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > 100
      )
        throw new Error("Flow page limit must be between 1 and 100");
      const cursorFilter = query.cursor
        ? sql`where ("occurredAt", kind, id) < (${new Date(query.cursor.occurredAt)}, ${query.cursor.kind}::text, ${query.cursor.id}::uuid)`
        : sql``;
      const result = await db.execute<ProjectFlowRawRow>(sql`
        with raw_entries as (
          select spl.id, 'system_link'::text as kind,
            coalesce(spl.archived_at, spl.created_at) as "occurredAt",
            spl.created_at as "recordedAt", s.name as title,
            spl.lifecycle::text as state, spl.type::text as detail,
            'Manual system relationship'::text as "sourceLabel",
            false as "isSynthetic", s.id as "primaryId",
            s.name as "primaryName", null::uuid as "secondaryId",
            null::text as "secondaryName"
          from system_project_link spl
          join system s on s.id = spl.system_id
          where spl.project_id = ${projectId}::uuid

          union all
          select prl.id, 'resource_link'::text,
            prl.created_at, prl.created_at, r.name,
            prl.lifecycle::text, prl.type::text,
            'Manual project resource relationship'::text,
            false, r.id, r.name, null::uuid, null::text
          from project_resource_link prl
          join resource r on r.id = prl.resource_id
          where prl.project_id = ${projectId}::uuid

          union all
          select srl.id, 'system_resource_link'::text,
            coalesce(srl.archived_at, srl.created_at), srl.created_at,
            s.name || ' / ' || r.name, srl.lifecycle::text,
            srl.type::text, 'Manual system resource relationship'::text,
            false, s.id, s.name, r.id, r.name
          from system_resource_link srl
          join system s on s.id = srl.system_id
          join resource r on r.id = srl.resource_id
          where exists (
            select 1 from system_project_link spl
            where spl.system_id = srl.system_id
              and spl.project_id = ${projectId}::uuid
              and spl.created_at <= coalesce(srl.archived_at, 'infinity'::timestamptz)
              and srl.created_at <= coalesce(spl.archived_at, 'infinity'::timestamptz)
          )

          union all
          select e.id, 'synthetic_event'::text,
            e.occurred_at, e.ingested_at, e.summary,
            e.severity::text, e.type::text, e.source_label,
            e.is_synthetic, r.id, r.name, null::uuid, null::text
          from normalized_event e
          left join resource r on r.id = e.resource_id
          where e.project_id = ${projectId}::uuid

          union all
          select run.id, 'local_agent_run'::text,
            coalesce(run.completed_at, run.created_at), run.created_at,
            agent.name, run.state::text, run.verification_status::text,
            'Synthetic local fake agent run'::text,
            true, agent.id, agent.name, run.packet_id,
            'Execution packet v' || run.packet_version::text
          from local_agent_run run
          join local_agent_profile agent on agent.id = run.agent_id
          where run.project_id = ${projectId}::uuid

          union all
          select run.id, 'automation_run'::text,
            coalesce(run.completed_at, run.created_at), run.created_at,
            definition.name, run.state::text, run.trigger::text,
            case when run.trigger in ('synthetic_event', 'synthetic_condition')
              or source_event.is_synthetic
              then 'Synthetic-triggered local automation run'
              else 'Local automation run' end,
            run.trigger in ('synthetic_event', 'synthetic_condition')
              or coalesce(source_event.is_synthetic, false),
            definition.id, definition.name, run.source_event_id,
            case when run.source_event_id is not null
              then case when source_event.is_synthetic
                then 'Triggering synthetic event'
                else 'Triggering event' end
              else null end
          from automation_run run
          join automation_definition definition on definition.id = run.definition_id
          left join normalized_event source_event
            on source_event.id = run.source_event_id
          where run.project_id = ${projectId}::uuid

          union all
          select proposal.id, 'simulated_approval'::text,
            coalesce(approval.decided_at, proposal.created_at),
            proposal.created_at, 'Simulated resource restart proposal'::text,
            approval.state::text, proposal.schema_version::text,
            'Simulated local action proposal'::text,
            true, r.id, r.name, agent.id, agent.name
          from simulated_action_proposal proposal
          join simulated_approval_state approval
            on approval.proposal_id = proposal.id
          join resource r on r.id = proposal.resource_id
          join local_agent_profile agent on agent.id = proposal.agent_id
          where proposal.project_id = ${projectId}::uuid
        ), entries as (
          select id, kind,
            date_trunc('milliseconds', "occurredAt") as "occurredAt",
            date_trunc('milliseconds', "recordedAt") as "recordedAt",
            title, state, detail, "sourceLabel", "isSynthetic",
            "primaryId", "primaryName", "secondaryId", "secondaryName"
          from raw_entries
        )
        select * from entries
        ${cursorFilter}
        order by "occurredAt" desc, kind desc, id desc
        limit ${query.limit + 1}
      `);
      return {
        items: result.rows.slice(0, query.limit),
        hasMore: result.rows.length > query.limit,
      };
    },
  };
}
