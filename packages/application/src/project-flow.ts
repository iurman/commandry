import { Buffer } from "node:buffer";
import {
  entityIdSchema,
  listProjectFlowResponseSchema,
  projectFlowKindSchema,
  type ListProjectFlowResponse,
  type ProjectFlowItem,
} from "@commandry/contracts";

export type ProjectFlowCursor = {
  projectId: string;
  occurredAt: string;
  kind: ProjectFlowItem["kind"];
  id: string;
};
export type ProjectFlowRawRow = {
  id: string;
  kind: ProjectFlowCursor["kind"];
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

export class ProjectFlowError extends Error {
  constructor(
    public readonly code: "PROJECT_NOT_FOUND" | "INVALID_CURSOR",
    message: string,
  ) {
    super(message);
  }
}

export interface ProjectFlowPort {
  getProjectById(id: string): Promise<{ id: string; name: string } | null>;
  listRaw(
    projectId: string,
    query: { limit: number; cursor?: ProjectFlowCursor | undefined },
  ): Promise<{ items: ProjectFlowRawRow[]; hasMore: boolean }>;
}

function timestamp(value: Date | string) {
  return new Date(value).toISOString();
}

function related(
  kind: ProjectFlowItem["related"][number]["kind"],
  id: string | null,
  name: string | null,
) {
  if (!id || !name) return null;
  const path = {
    system: "systems",
    resource: "resources",
    agent: "agents",
    packet: "execution-packets",
    automation: "automations",
    event: "events",
  }[kind];
  return { kind, id, name, href: `/api/v1/${path}/${id}` };
}

function flowItem(projectId: string, row: ProjectFlowRawRow): ProjectFlowItem {
  const sourcePath = {
    system_link: "system-project-links",
    resource_link: "project-resource-links",
    system_resource_link: "system-resource-links",
    synthetic_event: "events",
    local_agent_run: "agent-runs",
    automation_run: "automation-runs",
    simulated_approval: "approvals",
  }[row.kind];
  const relatedKinds: Record<
    ProjectFlowRawRow["kind"],
    [
      ProjectFlowItem["related"][number]["kind"] | null,
      ProjectFlowItem["related"][number]["kind"] | null,
    ]
  > = {
    system_link: ["system", null],
    resource_link: ["resource", null],
    system_resource_link: ["system", "resource"],
    synthetic_event: ["resource", null],
    local_agent_run: ["agent", "packet"],
    automation_run: ["automation", "event"],
    simulated_approval: ["resource", "agent"],
  };
  const kinds = relatedKinds[row.kind];
  const links = [
    kinds[0] ? related(kinds[0], row.primaryId, row.primaryName) : null,
    kinds[1] ? related(kinds[1], row.secondaryId, row.secondaryName) : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  return {
    id: row.id,
    kind: row.kind,
    projectId,
    occurredAt: timestamp(row.occurredAt),
    recordedAt: timestamp(row.recordedAt),
    title: row.title,
    state: row.state,
    detail: row.detail,
    sourceHref: `/api/v1/${sourcePath}/${row.id}`,
    sourceLabel: row.sourceLabel,
    isSynthetic: row.isSynthetic,
    related: links,
  };
}

export function createProjectFlowService(port: ProjectFlowPort) {
  return {
    async list(
      projectId: string,
      query: { limit: number; cursor?: string | undefined },
    ): Promise<ListProjectFlowResponse> {
      const project = await port.getProjectById(projectId);
      if (!project)
        throw new ProjectFlowError("PROJECT_NOT_FOUND", "Project not found");
      let cursor: ProjectFlowCursor | undefined;
      if (query.cursor) {
        try {
          const decoded: unknown = JSON.parse(
            Buffer.from(query.cursor, "base64url").toString("utf8"),
          );
          if (!decoded || typeof decoded !== "object") throw new Error();
          const value = decoded as Record<string, unknown>;
          if (
            !entityIdSchema.safeParse(value.projectId).success ||
            !entityIdSchema.safeParse(value.id).success ||
            !projectFlowKindSchema.safeParse(value.kind).success ||
            typeof value.occurredAt !== "string" ||
            !Number.isFinite(new Date(value.occurredAt).getTime()) ||
            new Date(value.occurredAt).toISOString() !== value.occurredAt
          )
            throw new Error();
          cursor = value as ProjectFlowCursor;
        } catch {
          throw new ProjectFlowError("INVALID_CURSOR", "Invalid flow cursor");
        }
        if (cursor.projectId !== projectId)
          throw new ProjectFlowError(
            "INVALID_CURSOR",
            "Flow cursor belongs to another project",
          );
      }
      const page = await port.listRaw(projectId, {
        limit: query.limit,
        cursor,
      });
      const last = page.items.at(-1);
      return listProjectFlowResponseSchema.parse({
        projectId,
        projectName: project.name,
        asOf: new Date().toISOString(),
        mode: "historical-local-snapshot",
        items: page.items.map((row) => flowItem(projectId, row)),
        nextCursor:
          page.hasMore && last
            ? Buffer.from(
                JSON.stringify({
                  projectId,
                  occurredAt: timestamp(last.occurredAt),
                  kind: last.kind,
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      });
    },
  };
}
