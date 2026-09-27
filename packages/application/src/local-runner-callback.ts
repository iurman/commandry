import { createHash, randomBytes } from "node:crypto";
import {
  localAgentCallbackEventSchema,
  localAgentCallbackRequestSchema,
  type FakeLocalAgentRunResult,
  type LocalAgentCallbackEvent,
  type LocalAgentCallbackRequest,
} from "@commandry/contracts";
import {
  LOCAL_RUNNER_ARTIFACT_MAX_BYTES,
  LOCAL_RUNNER_CALLBACK_TTL_SECONDS,
  LocalRunnerCallbackError,
} from "@commandry/domain";

export interface LocalRunnerCallbackPort {
  reportCallback(input: {
    runId: string;
    tokenDigest: string;
    callback: LocalAgentCallbackRequest;
  }): Promise<LocalAgentCallbackEvent>;
  listCallbacks(
    runId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: LocalAgentCallbackEvent[]; nextCursor: string | null }>;
  getCallbackArtifact(
    runId: string,
    eventId: string,
  ): Promise<{ event: LocalAgentCallbackEvent; content: string } | null>;
}

export function createLocalRunnerCallbackLease(
  grantExpiresAt: string,
  now = new Date(),
) {
  const expiresAt = new Date(
    Math.min(
      now.getTime() + LOCAL_RUNNER_CALLBACK_TTL_SECONDS * 1000,
      Date.parse(grantExpiresAt),
    ),
  );
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)
    throw new LocalRunnerCallbackError("CALLBACK_EXPIRED");
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenDigest: createHash("sha256").update(token).digest("hex"),
    expiresAt,
  };
}

export function buildSyntheticRunnerReport(input: {
  runId: string;
  attemptId: string;
  packetId: string;
  packetDigest: string;
  result: FakeLocalAgentRunResult;
}) {
  const content = JSON.stringify({
    version: 1,
    sourceLabel: "Synthetic local runner report",
    isSynthetic: true,
    verificationStatus: "unverified",
    runId: input.runId,
    attemptId: input.attemptId,
    packetId: input.packetId,
    packetDigest: input.packetDigest,
    summary: input.result.summary,
    contextReadIds: input.result.contextReadIds,
    evidenceCount: input.result.evidence.length,
    evidence: input.result.evidence.slice(0, 20).map((item) => ({
      kind: item.kind,
      id: item.id,
    })),
    externalActions: [],
  });
  if (Buffer.byteLength(content, "utf8") > LOCAL_RUNNER_ARTIFACT_MAX_BYTES)
    throw new LocalRunnerCallbackError("CALLBACK_PAYLOAD_INVALID");
  return content;
}

export function createLocalRunnerCallbackService(
  port: LocalRunnerCallbackPort,
) {
  return {
    async report(runId: string, bearerToken: string, rawCallback: unknown) {
      if (!/^[0-9a-f]{64}$/.test(bearerToken))
        throw new LocalRunnerCallbackError("CALLBACK_AUTH_DENIED");
      const callback = localAgentCallbackRequestSchema.parse(rawCallback);
      const event = await port.reportCallback({
        runId,
        tokenDigest: createHash("sha256").update(bearerToken).digest("hex"),
        callback,
      });
      return localAgentCallbackEventSchema.parse(event);
    },
    async list(
      runId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const page = await port.listCallbacks(runId, query);
      return {
        items: page.items.map((item) =>
          localAgentCallbackEventSchema.parse(item),
        ),
        nextCursor: page.nextCursor,
      };
    },
    async getArtifact(runId: string, eventId: string) {
      const found = await port.getCallbackArtifact(runId, eventId);
      if (!found) return null;
      localAgentCallbackEventSchema.parse(found.event);
      if (
        found.event.kind !== "artifact" ||
        found.event.artifactBytes !==
          Buffer.byteLength(found.content, "utf8") ||
        found.event.artifactSha256 !==
          createHash("sha256").update(found.content).digest("hex")
      )
        throw new Error("Local runner artifact integrity check failed");
      return found;
    },
  };
}
