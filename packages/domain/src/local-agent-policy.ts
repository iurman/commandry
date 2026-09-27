export const LOCAL_AGENT_RUNTIME = "local-fake-v1" as const;
export const LOCAL_AGENT_SOURCE_LABEL = "Synthetic local agent" as const;
export const LOCAL_AGENT_READ_OPERATIONS = [
  "project.brief.read",
  "work.read",
] as const;
export const LOCAL_AGENT_GRANT_TTL_SECONDS = 1800;
export const LOCAL_AGENT_PROGRESS_STAGES = [
  "brief_read",
  "work_read",
  "result_prepared",
] as const;
export type LocalAgentProgressStage =
  (typeof LOCAL_AGENT_PROGRESS_STAGES)[number];

export type LocalAgentReadOperation =
  (typeof LOCAL_AGENT_READ_OPERATIONS)[number];
export type LocalAgentGrant = {
  projectId: string;
  operation: string;
  expiresAt: string;
};
export type LocalAgentAuthorization = {
  runId: string;
  agentId: string;
  packetId: string;
  workItemId: string;
  projectId: string;
  state: "queued" | "running" | "succeeded" | "failed" | "canceled";
  grants: LocalAgentGrant[];
};

export class LocalAgentError extends Error {
  constructor(
    public readonly code:
      | "AGENT_NOT_FOUND"
      | "PROJECT_NOT_FOUND"
      | "ASSIGNMENT_EXISTS"
      | "AGENT_NOT_ASSIGNED"
      | "PACKET_NOT_FOUND"
      | "RUN_NOT_FOUND"
      | "OCCURRENCE_CONFLICT"
      | "RUN_NOT_ACTIVE"
      | "PROJECT_SCOPE_DENIED"
      | "OPERATION_DENIED"
      | "GRANT_EXPIRED"
      | "CONTEXT_NOT_FOUND"
      | "INVALID_CACHE_CURSOR",
    message: string,
  ) {
    super(message);
    this.name = "LocalAgentError";
  }
}

export function evaluateLocalAgentRead(
  authorization: LocalAgentAuthorization,
  request: { projectId: string; operation: string },
  now: Date,
):
  | "ALLOWED"
  | "RUN_NOT_ACTIVE"
  | "PROJECT_SCOPE_DENIED"
  | "OPERATION_DENIED"
  | "GRANT_EXPIRED" {
  if (request.projectId !== authorization.projectId)
    return "PROJECT_SCOPE_DENIED";
  if (
    !LOCAL_AGENT_READ_OPERATIONS.includes(
      request.operation as LocalAgentReadOperation,
    )
  ) {
    return "OPERATION_DENIED";
  }
  const grant = authorization.grants.find(
    (item) =>
      item.projectId === request.projectId &&
      item.operation === request.operation,
  );
  if (!grant) return "OPERATION_DENIED";
  if (authorization.state !== "running") return "RUN_NOT_ACTIVE";
  if (Date.parse(grant.expiresAt) <= now.getTime()) return "GRANT_EXPIRED";
  return "ALLOWED";
}

export function sanitizeLocalAgentAuditReason(value: string): string {
  const knownWorkerReasons = [
    "Synthetic local run needs project state and evidence",
    "Synthetic local run needs the selected work item",
  ];
  return knownWorkerReasons.includes(value)
    ? value
    : "Manual local context read; supplied reason withheld";
}

export function sanitizeLocalAgentAuditOperation(value: string): string {
  return LOCAL_AGENT_READ_OPERATIONS.includes(value as LocalAgentReadOperation)
    ? value
    : "unrecognized.operation";
}
