import {
  fakeLocalAgentRunResultSchema,
  listProjectAgentFindingsResponseSchema,
  type ListProjectAgentFindingsResponse,
} from "@commandry/contracts";

export type ProjectAgentFindingRow = {
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

export interface ProjectAgentFindingsPort {
  projectExists(projectId: string): Promise<boolean>;
  cursorExists(projectId: string, runId: string): Promise<boolean>;
  listRows(
    projectId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: ProjectAgentFindingRow[]; hasMore: boolean }>;
}

export class ProjectAgentFindingsError extends Error {
  constructor(
    public readonly code: "PROJECT_NOT_FOUND" | "INVALID_CURSOR",
    message: string,
  ) {
    super(message);
  }
}

export function createProjectAgentFindingsService(
  port: ProjectAgentFindingsPort,
) {
  return {
    async list(
      projectId: string,
      query: { limit: number; cursor?: string | undefined },
    ): Promise<ListProjectAgentFindingsResponse> {
      if (!(await port.projectExists(projectId)))
        throw new ProjectAgentFindingsError(
          "PROJECT_NOT_FOUND",
          "Project not found",
        );
      if (query.cursor && !(await port.cursorExists(projectId, query.cursor)))
        throw new ProjectAgentFindingsError(
          "INVALID_CURSOR",
          "The finding cursor does not belong to this project",
        );
      const page = await port.listRows(projectId, query);
      const last = page.items.at(-1);
      return listProjectAgentFindingsResponseSchema.parse({
        projectId,
        asOf: new Date().toISOString(),
        items: page.items.map((row) => {
          if (row.projectId !== projectId)
            throw new Error("A finding belongs to another project");
          const result = fakeLocalAgentRunResultSchema.parse(row.result);
          return {
            runId: row.runId,
            projectId: row.projectId,
            agentId: row.agentId,
            agentName: row.agentName,
            workItemId: row.workItemId,
            workTitle: row.workTitle,
            packetId: row.packetId,
            packetDigest: row.packetDigest,
            completedAt: new Date(row.completedAt).toISOString(),
            summary: result.summary,
            evidence: result.evidence.slice(0, 3),
            evidenceCount: result.evidence.length,
            sourceHref: `/api/v1/agent-runs/${row.runId}`,
            packetHref: `/api/v1/execution-packets/${row.packetId}`,
            sourceLabel: "Saved synthetic local fake-run result",
            isSynthetic: true,
            verificationStatus: "unverified",
          };
        }),
        nextCursor: page.hasMore && last ? last.runId : null,
      });
    },
  };
}
