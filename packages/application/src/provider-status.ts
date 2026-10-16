export type ProviderComponent = {
  id: string;
  name: string;
  status: string;
  groupId: string | null;
};
export type ProviderNoticeUpdate = {
  id: string;
  status: string;
  body: string;
  occurredAt: string;
};
export type ProviderNotice = {
  id: string;
  kind: "incident" | "maintenance";
  title: string;
  status: string;
  severity: string;
  componentIds: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  scheduledFor: string | null;
  scheduledUntil: string | null;
  evidenceHref: string;
  updates: ProviderNoticeUpdate[];
};
export type ProviderStatusSnapshot = {
  provider: "cloudflare";
  endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json";
  readAt: string;
  reportedAt: string;
  complete: true;
  components: ProviderComponent[];
  notices: ProviderNotice[];
};
export type ProviderStatusRead = {
  snapshot: ProviderStatusSnapshot | null;
  notModified: boolean;
  etag: string | null;
  retrySeconds: number;
  rawPayload?: unknown;
};
export type ProviderPollClaim = {
  leaseId: string;
  etag: string | null;
};
export interface ProviderStatusPort {
  claim(): Promise<ProviderPollClaim | null>;
  complete(claim: ProviderPollClaim, result: ProviderStatusRead): Promise<void>;
  fail(
    claim: ProviderPollClaim,
    code: string,
    retrySeconds: number,
  ): Promise<void>;
}
export function createProviderStatusPoller(
  repository: ProviderStatusPort,
  read: (etag: string | null) => Promise<ProviderStatusRead>,
) {
  return {
    async pollNext(): Promise<boolean> {
      const claim = await repository.claim();
      if (!claim) return false;
      try {
        const result = await read(claim.etag);
        if (
          result.notModified
            ? result.snapshot !== null || !claim.etag
            : !result.snapshot?.complete
        )
          throw new Error("Incomplete provider response");
        await repository.complete(claim, result);
      } catch (error) {
        const code =
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : "PROVIDER_UNAVAILABLE";
        const retry =
          error &&
          typeof error === "object" &&
          "retrySeconds" in error &&
          typeof error.retrySeconds === "number" &&
          Number.isFinite(error.retrySeconds)
            ? Math.max(120, Math.min(86400, error.retrySeconds))
            : 120;
        await repository.fail(claim, code, retry);
      }
      return true;
    },
  };
}
