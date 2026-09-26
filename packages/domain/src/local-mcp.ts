import { createHash } from "node:crypto";
import { LOCAL_AGENT_READ_OPERATIONS } from "./local-agent-policy";

export class LocalMcpError extends Error {
  constructor(
    public readonly code:
      | "PACKET_NOT_FOUND"
      | "AGENT_NOT_FOUND"
      | "AGENT_NOT_ASSIGNED"
      | "SESSION_NOT_FOUND"
      | "TOKEN_INVALID"
      | "SESSION_EXPIRED"
      | "SESSION_REVOKED"
      | "PROJECT_SCOPE_DENIED"
      | "WORK_SCOPE_DENIED"
      | "OPERATION_DENIED"
      | "CONTEXT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LocalMcpError";
  }
}

export function localMcpTokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function evaluateLocalMcpRead(
  session: {
    projectId: string;
    workItemId: string;
    expiresAt: string;
    revokedAt: string | null;
  },
  request: {
    projectId: string;
    workItemId?: string | undefined;
    operation: string;
  },
  now: Date,
): LocalMcpError["code"] | "ALLOWED" {
  if (session.revokedAt) return "SESSION_REVOKED";
  if (Date.parse(session.expiresAt) <= now.getTime()) return "SESSION_EXPIRED";
  if (session.projectId !== request.projectId) return "PROJECT_SCOPE_DENIED";
  if (
    !LOCAL_AGENT_READ_OPERATIONS.includes(
      request.operation as (typeof LOCAL_AGENT_READ_OPERATIONS)[number],
    )
  )
    return "OPERATION_DENIED";
  if (
    request.operation === "work.read" &&
    session.workItemId !== request.workItemId
  )
    return "WORK_SCOPE_DENIED";
  return "ALLOWED";
}

export function localMcpAuditReason(userReason: string): string {
  void userReason;
  return "Local MCP context read; caller-supplied reason withheld";
}
