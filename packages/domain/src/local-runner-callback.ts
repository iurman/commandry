export const LOCAL_RUNNER_CALLBACK_TTL_SECONDS = 600;
export const LOCAL_RUNNER_ARTIFACT_MAX_BYTES = 16 * 1024;
export const LOCAL_RUNNER_CALLBACK_STAGES = [
  "started",
  "brief_read",
  "work_read",
  "result_prepared",
] as const;

export type LocalRunnerCallbackStage =
  (typeof LOCAL_RUNNER_CALLBACK_STAGES)[number];

export type LocalRunnerCallbackCode =
  | "CALLBACK_RUN_NOT_ACTIVE"
  | "CALLBACK_SCOPE_DENIED"
  | "CALLBACK_AUTH_DENIED"
  | "CALLBACK_EXPIRED"
  | "CALLBACK_SEQUENCE_CONFLICT"
  | "CALLBACK_PAYLOAD_INVALID";

export class LocalRunnerCallbackError extends Error {
  constructor(public readonly code: LocalRunnerCallbackCode) {
    super(code.replaceAll("_", " ").toLowerCase());
    this.name = "LocalRunnerCallbackError";
  }
}

function equalDigest(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right))
    return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export function evaluateLocalRunnerCallback(
  current: {
    runId: string;
    attemptId: string;
    runState: string;
    attemptState: string;
    tokenDigest: string | null;
    tokenExpiresAt: Date | null;
    grantExpiresAt: Date;
    lastSequence: number;
  },
  request: {
    runId: string;
    attemptId: string;
    tokenDigest: string;
    sequence: number;
    kind: "heartbeat" | "artifact";
    stage: string | null;
    artifactName: string | null;
    artifactContent: string | null;
  },
  now: Date,
): "ALLOWED" | LocalRunnerCallbackCode {
  if (
    current.runId !== request.runId ||
    current.attemptId !== request.attemptId
  )
    return "CALLBACK_SCOPE_DENIED";
  if (current.runState !== "running" || current.attemptState !== "running")
    return "CALLBACK_RUN_NOT_ACTIVE";
  if (
    !current.tokenDigest ||
    !equalDigest(current.tokenDigest, request.tokenDigest)
  )
    return "CALLBACK_AUTH_DENIED";
  if (
    !current.tokenExpiresAt ||
    current.tokenExpiresAt.getTime() <= now.getTime() ||
    current.grantExpiresAt.getTime() <= now.getTime()
  )
    return "CALLBACK_EXPIRED";
  if (
    !Number.isSafeInteger(request.sequence) ||
    request.sequence !== current.lastSequence + 1
  )
    return "CALLBACK_SEQUENCE_CONFLICT";
  if (request.kind === "heartbeat") {
    return LOCAL_RUNNER_CALLBACK_STAGES.includes(
      request.stage as LocalRunnerCallbackStage,
    ) &&
      request.artifactName === null &&
      request.artifactContent === null
      ? "ALLOWED"
      : "CALLBACK_PAYLOAD_INVALID";
  }
  if (
    request.stage !== null ||
    request.artifactName !== "synthetic-run-report.json" ||
    !request.artifactContent
  )
    return "CALLBACK_PAYLOAD_INVALID";
  const size = new TextEncoder().encode(request.artifactContent).length;
  if (size === 0 || size > LOCAL_RUNNER_ARTIFACT_MAX_BYTES)
    return "CALLBACK_PAYLOAD_INVALID";
  try {
    const value: unknown = JSON.parse(request.artifactContent);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (value as Record<string, unknown>).sourceLabel !==
        "Synthetic local runner report"
    )
      return "CALLBACK_PAYLOAD_INVALID";
  } catch {
    return "CALLBACK_PAYLOAD_INVALID";
  }
  return "ALLOWED";
}
