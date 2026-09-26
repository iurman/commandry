import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  sql,
  type AnyColumn,
} from "drizzle-orm";
import {
  automationRunResultSchema,
  fakeLocalAgentRunResultSchema,
} from "@commandry/contracts";
import type { MorningRunKind } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  automationDefinition,
  automationRun,
  localAgentProfile,
  localAgentRun,
  workItem,
} from "./schema";

type Cursor = { completedAt: Date; kind: MorningRunKind; id: string };
type Query = {
  from: Date;
  to: Date;
  limit: number;
  projectId?: string | undefined;
  cursor: Cursor | null;
};

function afterCursor(
  kind: MorningRunKind,
  completedAt: AnyColumn,
  id: AnyColumn,
  cursor: Cursor | null,
) {
  if (!cursor) return undefined;
  if (kind === cursor.kind)
    return sql`(${completedAt}, ${id}) < (${cursor.completedAt}, ${cursor.id}::uuid)`;
  return kind === "agent"
    ? lte(completedAt, cursor.completedAt)
    : lt(completedAt, cursor.completedAt);
}

export function createMorningDigestRepository(db: CommandryDatabase) {
  return {
    async listCompletedRuns(query: Query) {
      const [automations, agents] = await Promise.all([
        db
          .select({
            run: automationRun,
            name: automationDefinition.name,
          })
          .from(automationRun)
          .innerJoin(
            automationDefinition,
            eq(automationDefinition.id, automationRun.definitionId),
          )
          .where(
            and(
              isNotNull(automationRun.completedAt),
              gte(automationRun.completedAt, query.from),
              lt(automationRun.completedAt, query.to),
              inArray(automationRun.state, ["succeeded", "failed", "skipped"]),
              query.projectId
                ? eq(automationRun.projectId, query.projectId)
                : undefined,
              afterCursor(
                "automation",
                automationRun.completedAt,
                automationRun.id,
                query.cursor,
              ),
            ),
          )
          .orderBy(desc(automationRun.completedAt), desc(automationRun.id))
          .limit(query.limit + 1),
        db
          .select({
            run: localAgentRun,
            agentName: localAgentProfile.name,
            workTitle: workItem.title,
          })
          .from(localAgentRun)
          .innerJoin(
            localAgentProfile,
            eq(localAgentProfile.id, localAgentRun.agentId),
          )
          .innerJoin(workItem, eq(workItem.id, localAgentRun.workItemId))
          .where(
            and(
              isNotNull(localAgentRun.completedAt),
              gte(localAgentRun.completedAt, query.from),
              lt(localAgentRun.completedAt, query.to),
              inArray(localAgentRun.state, ["succeeded", "failed"]),
              query.projectId
                ? eq(localAgentRun.projectId, query.projectId)
                : undefined,
              afterCursor(
                "agent",
                localAgentRun.completedAt,
                localAgentRun.id,
                query.cursor,
              ),
            ),
          )
          .orderBy(desc(localAgentRun.completedAt), desc(localAgentRun.id))
          .limit(query.limit + 1),
      ]);
      const candidates = [
        ...automations.map(({ run, name }) => {
          if (!run.completedAt)
            throw new Error("Completed automation has no time");
          const result = automationRunResultSchema.safeParse(run.result);
          return {
            kind: "automation" as const,
            id: run.id,
            projectId: run.projectId,
            title: name,
            actorLabel: "Local automation worker",
            state: run.state as "succeeded" | "failed" | "skipped",
            completedAt: run.completedAt,
            summary: result.success ? result.data.summary : run.error,
            firstEvidenceHref: result.success
              ? (result.data.evidence[0]?.href ?? null)
              : null,
            definitionId: run.definitionId,
            sourceEventId: run.sourceEventId,
            packetId: null,
          };
        }),
        ...agents.map(({ run, agentName, workTitle }) => {
          if (!run.completedAt)
            throw new Error("Completed agent run has no time");
          const result = fakeLocalAgentRunResultSchema.safeParse(run.result);
          return {
            kind: "agent" as const,
            id: run.id,
            projectId: run.projectId,
            title: workTitle,
            actorLabel: agentName,
            state: run.state as "succeeded" | "failed",
            completedAt: run.completedAt,
            summary: result.success ? result.data.summary : run.error,
            firstEvidenceHref: result.success
              ? (result.data.evidence[0]?.href ?? null)
              : null,
            definitionId: null,
            sourceEventId: null,
            packetId: run.packetId,
          };
        }),
      ].sort((a, b) => {
        const time = b.completedAt.getTime() - a.completedAt.getTime();
        if (time) return time;
        if (a.kind !== b.kind) return a.kind === "automation" ? -1 : 1;
        return b.id.localeCompare(a.id);
      });
      return {
        items: candidates.slice(0, query.limit),
        hasMore: candidates.length > query.limit,
      };
    },
  };
}
