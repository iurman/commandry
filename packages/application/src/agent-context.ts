import {
  agentContextReadResponseSchema,
  agentRunAuditEventSchema,
  type AgentContextReadRequest,
  type AgentContextReadResponse,
  type AgentRunAuditEvent,
  type ProjectBrief,
  type WorkItem,
} from "@commandry/contracts";
import {
  evaluateLocalAgentRead,
  LocalAgentError,
  sanitizeLocalAgentAuditOperation,
  sanitizeLocalAgentAuditReason,
  type LocalAgentAuthorization,
} from "@commandry/domain";
import type { LocalAgentPage, LocalAgentPageQuery } from "./local-agents";

export type AgentContextAuditInput = {
  runId: string;
  agentId: string;
  origin: "worker-agent" | "manual-local-reviewer";
  projectId: string;
  operation: string;
  decision: "allowed" | "denied";
  code: string;
  reason: string;
  createdAt: string;
};

export interface AgentContextPort {
  getAuthorization(runId: string): Promise<LocalAgentAuthorization | null>;
  getProjectBrief(projectId: string): Promise<ProjectBrief | null>;
  getWorkItem(workItemId: string, projectId: string): Promise<WorkItem | null>;
  recordAudit(input: AgentContextAuditInput): Promise<AgentRunAuditEvent>;
  listAudit(
    runId: string,
    query: LocalAgentPageQuery,
  ): Promise<LocalAgentPage<AgentRunAuditEvent>>;
}

export function createAgentContextService(
  port: AgentContextPort,
  clock: () => Date = () => new Date(),
) {
  async function read(
    runId: string,
    input: AgentContextReadRequest,
    origin: AgentContextAuditInput["origin"] = "worker-agent",
  ): Promise<AgentContextReadResponse> {
    const authorization = await port.getAuthorization(runId);
    if (!authorization)
      throw new LocalAgentError("RUN_NOT_FOUND", "Local agent run not found");
    const readAt = clock().toISOString();
    const reason = sanitizeLocalAgentAuditReason(input.reason);
    const auditOperation = sanitizeLocalAgentAuditOperation(input.operation);
    const decision = evaluateLocalAgentRead(
      authorization,
      input,
      new Date(readAt),
    );
    if (decision !== "ALLOWED") {
      await port.recordAudit({
        runId,
        agentId: authorization.agentId,
        origin,
        projectId: input.projectId,
        operation: auditOperation,
        decision: "denied",
        code: decision,
        reason,
        createdAt: readAt,
      });
      throw new LocalAgentError(decision, `Context read denied: ${decision}`);
    }

    let source: AgentContextReadResponse["source"] | null = null;
    if (input.operation === "project.brief.read") {
      const brief = await port.getProjectBrief(input.projectId);
      if (brief) {
        const citations = [
          ...brief.state.evidence,
          ...Object.values(brief.sections).flatMap(
            (section) => section?.items.flatMap((item) => item.evidence) ?? [],
          ),
          ...brief.nextActions.items.flatMap((item) => item.evidence),
        ];
        source = {
          kind: "project_brief",
          id: brief.project.id,
          title: brief.project.name,
          summary: brief.state.text,
          href: `/api/v1/projects/${brief.project.id}/brief`,
          recordedAt: brief.project.updatedAt,
          sourceLabel: "Deterministic local project brief",
          isSynthetic: false,
          evidence: Array.from(
            new Map(
              citations.map((item) => [
                `${item.kind}:${item.id}:${item.href}`,
                item,
              ]),
            ).values(),
          ),
          brief,
        };
      }
    } else if (input.operation === "work.read") {
      const work = await port.getWorkItem(
        authorization.workItemId,
        input.projectId,
      );
      if (work)
        source = {
          kind: "work_item",
          id: work.id,
          title: work.title,
          summary: work.description,
          href: `/api/v1/work-items/${work.id}`,
          recordedAt: work.updatedAt,
          sourceLabel: "Manual local capture",
          isSynthetic: false,
          brief: null,
          evidence: [
            {
              kind: "work_item",
              id: work.id,
              href: `/api/v1/work-items/${work.id}`,
              recordedAt: work.updatedAt,
              occurredAt: null,
              sourceLabel: "Manual local capture",
              isSynthetic: false,
            },
          ],
        };
    }
    if (!source) {
      await port.recordAudit({
        runId,
        agentId: authorization.agentId,
        origin,
        projectId: input.projectId,
        operation: auditOperation,
        decision: "denied",
        code: "CONTEXT_NOT_FOUND",
        reason,
        createdAt: readAt,
      });
      throw new LocalAgentError(
        "CONTEXT_NOT_FOUND",
        "Scoped context source not found",
      );
    }
    const audit = agentRunAuditEventSchema.parse(
      await port.recordAudit({
        runId,
        agentId: authorization.agentId,
        origin,
        projectId: input.projectId,
        operation: auditOperation,
        decision: "allowed",
        code: "CONTEXT_READ_ALLOWED",
        reason,
        createdAt: readAt,
      }),
    );
    return agentContextReadResponseSchema.parse({
      runId,
      projectId: input.projectId,
      operation: input.operation,
      readAt,
      sensitivity: "unclassified-local-data",
      isSynthetic: true,
      source,
      auditId: audit.id,
    });
  }

  return {
    read,
    async listAudit(
      runId: string,
      query: LocalAgentPageQuery,
    ): Promise<LocalAgentPage<AgentRunAuditEvent>> {
      if (!(await port.getAuthorization(runId))) {
        throw new LocalAgentError("RUN_NOT_FOUND", "Local agent run not found");
      }
      const page = await port.listAudit(runId, query);
      return {
        items: page.items.map((item) => agentRunAuditEventSchema.parse(item)),
        nextCursor: page.nextCursor,
      };
    },
  };
}
