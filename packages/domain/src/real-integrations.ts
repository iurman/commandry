export class RealIntegrationError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "INVALID_BINDING"
      | "DISABLED"
      | "UNAUTHORIZED"
      | "INVALID_SOURCE"
      | "OCCURRENCE_CONFLICT",
    message: string,
  ) {
    super(message);
  }
}
export type RealSourceProjection = {
  sourceEventId: string;
  occurredAt: string;
  type:
    | "git.repository.activity"
    | "git.pull_request.merged"
    | "host.telemetry.sampled";
  summary: string;
  rawPayload: unknown;
  metrics: { name: string; unit: string; value: number }[];
};

export function normalizeGitHubActivity(
  identifier: string,
  input: unknown,
): RealSourceProjection {
  if (!input || typeof input !== "object")
    throw new RealIntegrationError("INVALID_SOURCE", "Invalid GitHub event");
  const event = input as Record<string, unknown>;
  const repo = event.repo as Record<string, unknown> | undefined;
  if (
    typeof event.id !== "string" ||
    !/^\d{1,30}$/.test(event.id) ||
    typeof event.type !== "string" ||
    !/^[A-Za-z]{1,80}Event$/.test(event.type) ||
    typeof event.created_at !== "string" ||
    !Number.isFinite(Date.parse(event.created_at)) ||
    typeof repo?.name !== "string" ||
    repo.name.toLowerCase() !== identifier.toLowerCase()
  )
    throw new RealIntegrationError(
      "INVALID_SOURCE",
      "GitHub event does not match this repository",
    );
  const payload = event.payload as Record<string, unknown> | undefined;
  const pr = payload?.pull_request as Record<string, unknown> | undefined;
  const merged =
    event.type === "PullRequestEvent" &&
    payload?.action === "closed" &&
    pr?.merged === true;
  return {
    sourceEventId: event.id,
    occurredAt: new Date(event.created_at).toISOString(),
    type: merged ? "git.pull_request.merged" : "git.repository.activity",
    summary: `${merged ? "Pull request merged" : event.type} in ${identifier}`,
    rawPayload: input,
    metrics: [],
  };
}

export const realIntegrationReadPolicy = {
  riskLevel: "read",
  requiredCapability: "integration.read",
  approvalBehavior:
    "Owner configures and enables a scoped source; reads then run automatically",
  auditEvent: "integration.real_observation_imported",
} as const;
