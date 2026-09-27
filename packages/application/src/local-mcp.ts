import { randomBytes } from "node:crypto";
import {
  createdLocalMcpSessionSchema,
  listLocalMcpAuditResponseSchema,
  listLocalMcpSessionsResponseSchema,
  localMcpReadResponseSchema,
  localMcpSessionSchema,
  type CreateLocalMcpSessionRequest,
  type LocalAgentProfile,
  type LocalMcpReadRequest,
  type LocalMcpReadResponse,
  type LocalMcpSession,
  type ProjectBrief,
  type WorkItem,
} from "@commandry/contracts";
import {
  evaluateLocalMcpRead,
  LocalMcpError,
  localMcpAuditReason,
  localMcpTokenDigest,
} from "@commandry/domain";
import type { LocalAgentRunPacket } from "./local-agent-runs";

export interface LocalMcpPort {
  getPacketById(id: string): Promise<LocalAgentRunPacket | null>;
  getAgentById(id: string): Promise<LocalAgentProfile | null>;
  isAssigned(agentId: string, projectId: string): Promise<boolean>;
  create(input: {
    packetId: string;
    packetVersion: number;
    packetDigest: string;
    projectId: string;
    workItemId: string;
    agentId: string;
    tokenDigest: string;
    ttlSeconds: number;
  }): Promise<LocalMcpSession>;
  getById(id: string): Promise<LocalMcpSession | null>;
  getByTokenDigest(digest: string): Promise<LocalMcpSession | null>;
  list(query: {
    limit: number;
    cursor?: string | undefined;
    packetId?: string | undefined;
  }): Promise<{ items: LocalMcpSession[]; nextCursor: string | null }>;
  revoke(id: string): Promise<LocalMcpSession>;
  recordAudit(input: {
    sessionId: string;
    operation: string;
    decision: "allowed" | "denied";
    code: string;
    reason: string;
  }): Promise<{ id: string }>;
  listAudit(
    sessionId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
  getProjectBrief(projectId: string): Promise<ProjectBrief | null>;
  getWorkItem(workItemId: string, projectId: string): Promise<WorkItem | null>;
}

function briefSource(brief: ProjectBrief): LocalMcpReadResponse["source"] {
  const citations = [
    ...brief.state.evidence,
    ...Object.values(brief.sections).flatMap(
      (section) => section?.items.flatMap((item) => item.evidence) ?? [],
    ),
    ...brief.nextActions.items.flatMap((item) => item.evidence),
  ];
  return {
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
        citations.map((item) => [`${item.kind}:${item.id}:${item.href}`, item]),
      ).values(),
    ),
    brief,
  };
}

function workSource(work: WorkItem): LocalMcpReadResponse["source"] {
  return {
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

export function createLocalMcpService(
  port: LocalMcpPort,
  ttlSeconds: number,
  clock: () => Date = () => new Date(),
) {
  return {
    async createSession(input: CreateLocalMcpSessionRequest) {
      const packet = await port.getPacketById(input.packetId);
      if (!packet)
        throw new LocalMcpError(
          "PACKET_NOT_FOUND",
          "Execution packet not found",
        );
      const agent = await port.getAgentById(input.agentId);
      if (!agent)
        throw new LocalMcpError("AGENT_NOT_FOUND", "Local agent not found");
      if (!(await port.isAssigned(agent.id, packet.projectId)))
        throw new LocalMcpError(
          "AGENT_NOT_ASSIGNED",
          "Local agent is not assigned to the packet project",
        );
      const token = `mcp_${randomBytes(32).toString("base64url")}`;
      const session = await port.create({
        packetId: packet.id,
        packetVersion: packet.packetVersion,
        packetDigest: packet.contentDigest,
        projectId: packet.projectId,
        workItemId: packet.workItemId,
        agentId: agent.id,
        tokenDigest: localMcpTokenDigest(token),
        ttlSeconds,
      });
      return createdLocalMcpSessionSchema.parse({
        ...session,
        token,
        endpoint: "/mcp",
      });
    },
    async getById(id: string) {
      const session = await port.getById(id);
      return session ? localMcpSessionSchema.parse(session) : null;
    },
    async list(query: {
      limit: number;
      cursor?: string | undefined;
      packetId?: string | undefined;
    }) {
      return listLocalMcpSessionsResponseSchema.parse(await port.list(query));
    },
    async revoke(id: string) {
      return localMcpSessionSchema.parse(await port.revoke(id));
    },
    async authenticate(token: string): Promise<LocalMcpSession> {
      if (!/^mcp_[A-Za-z0-9_-]{43}$/.test(token))
        throw new LocalMcpError(
          "TOKEN_INVALID",
          "Valid local MCP bearer token required",
        );
      const session = await port.getByTokenDigest(localMcpTokenDigest(token));
      if (!session)
        throw new LocalMcpError(
          "TOKEN_INVALID",
          "Valid local MCP bearer token required",
        );
      if (session.revokedAt)
        throw new LocalMcpError(
          "SESSION_REVOKED",
          "Local MCP session was revoked",
        );
      if (Date.parse(session.expiresAt) <= clock().getTime())
        throw new LocalMcpError("SESSION_EXPIRED", "Local MCP session expired");
      return localMcpSessionSchema.parse(session);
    },
    async read(
      token: string,
      input: LocalMcpReadRequest,
    ): Promise<LocalMcpReadResponse> {
      const session = await port.getByTokenDigest(localMcpTokenDigest(token));
      if (!session)
        throw new LocalMcpError(
          "TOKEN_INVALID",
          "Valid local MCP bearer token required",
        );
      const decision = evaluateLocalMcpRead(session, input, clock());
      const reason = localMcpAuditReason(input.reason);
      if (decision !== "ALLOWED") {
        await port.recordAudit({
          sessionId: session.id,
          operation: input.operation,
          decision: "denied",
          code: decision,
          reason,
        });
        throw new LocalMcpError(decision, `Local MCP read denied: ${decision}`);
      }
      const source =
        input.operation === "project.brief.read"
          ? await port
              .getProjectBrief(session.projectId)
              .then((brief) => (brief ? briefSource(brief) : null))
          : await port
              .getWorkItem(session.workItemId, session.projectId)
              .then((work) => (work ? workSource(work) : null));
      if (!source) {
        await port.recordAudit({
          sessionId: session.id,
          operation: input.operation,
          decision: "denied",
          code: "CONTEXT_NOT_FOUND",
          reason,
        });
        throw new LocalMcpError(
          "CONTEXT_NOT_FOUND",
          "Scoped context source not found",
        );
      }
      const audit = await port.recordAudit({
        sessionId: session.id,
        operation: input.operation,
        decision: "allowed",
        code: "CONTEXT_READ_ALLOWED",
        reason,
      });
      return localMcpReadResponseSchema.parse({
        sessionId: session.id,
        projectId: session.projectId,
        operation: input.operation,
        readAt: clock().toISOString(),
        auditId: audit.id,
        sensitivity: "unclassified-local-data",
        source,
      });
    },
    async listAudit(
      sessionId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      if (!(await port.getById(sessionId)))
        throw new LocalMcpError(
          "SESSION_NOT_FOUND",
          "Local MCP session not found",
        );
      return listLocalMcpAuditResponseSchema.parse(
        await port.listAudit(sessionId, query),
      );
    },
  };
}
