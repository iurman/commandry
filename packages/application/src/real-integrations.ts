import {
  linuxHostSampleSchema,
  type LinuxHostSample,
} from "@commandry/contracts";
import {
  normalizeGitHubActivity,
  RealIntegrationError,
  type RealSourceProjection,
} from "@commandry/domain";

export type RealPollClaim = {
  id: string;
  leaseId: string;
  identifier: string;
  page: number;
  etag: string | null;
  pendingEtag: string | null;
};
export type GitHubActivityPage = {
  events: unknown[];
  notModified: boolean;
  etag: string | null;
  hasNext: boolean;
  pollSeconds: number;
};
export interface RealIntegrationPollPort {
  claimDue(): Promise<RealPollClaim | null>;
  completePoll(
    claim: RealPollClaim,
    projections: RealSourceProjection[],
    page: GitHubActivityPage,
  ): Promise<void>;
  failPoll(
    claim: RealPollClaim,
    code: string,
    retrySeconds: number,
  ): Promise<void>;
}
export class RealProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retrySeconds = 300,
  ) {
    super(code);
  }
}
export function createRealIntegrationPoller(
  port: RealIntegrationPollPort,
  readGitHub: (claim: RealPollClaim) => Promise<GitHubActivityPage>,
) {
  return {
    async pollNext() {
      const claim = await port.claimDue();
      if (!claim) return false;
      try {
        const page = await readGitHub(claim);
        const projections = page.events.map((event) =>
          normalizeGitHubActivity(claim.identifier, event),
        );
        await port.completePoll(claim, projections, page);
      } catch (error) {
        await port.failPoll(
          claim,
          error instanceof RealProviderError
            ? error.code
            : error instanceof RealIntegrationError
              ? error.code
              : "PROVIDER_UNAVAILABLE",
          error instanceof RealProviderError ? error.retrySeconds : 300,
        );
      }
      return true;
    },
  };
}
export function prepareLinuxHostObservation(
  identifier: string,
  input: LinuxHostSample,
  now = new Date(),
): RealSourceProjection {
  const sample = linuxHostSampleSchema.parse(input);
  if (
    sample.hostname !== identifier ||
    Date.parse(sample.observedAt) > now.getTime() + 300_000
  )
    throw new RealIntegrationError(
      "INVALID_SOURCE",
      "Host identity or observation timestamp does not match this source",
    );
  return {
    sourceEventId: sample.sampleId,
    occurredAt: sample.observedAt,
    type: "host.telemetry.sampled",
    summary: `Host telemetry reported by ${sample.hostname}`,
    rawPayload: sample,
    metrics: [
      {
        name: "host_memory_used",
        unit: "percent",
        value: Math.round(
          100 * (1 - sample.memory.availableBytes / sample.memory.totalBytes),
        ),
      },
      {
        name: "host_disk_used",
        unit: "percent",
        value: Math.round(
          100 * (1 - sample.disk.availableBytes / sample.disk.totalBytes),
        ),
      },
      { name: "host_uptime", unit: "seconds", value: sample.uptimeSeconds },
      { name: "host_load_1m", unit: "milli_load", value: sample.load1Milli },
    ],
  };
}
