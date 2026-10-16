// Official structured source: https://www.cloudflarestatus.com/api
// This adapter retrieves provider evidence. It never decides local relevance or health.
export const cloudflareStatusEndpoint =
  "https://www.cloudflarestatus.com/api/v2/summary.json";

export type {
  ProviderComponent,
  ProviderNoticeUpdate,
  ProviderNotice,
  ProviderStatusSnapshot,
  ProviderStatusRead,
} from "@commandry/application";
import type {
  ProviderNotice,
  ProviderStatusSnapshot,
  ProviderStatusRead,
} from "@commandry/application";
export class ProviderStatusError extends Error {
  constructor(
    public readonly code: string,
    public readonly retrySeconds = 120,
  ) {
    super(code);
  }
}
const invalid = () => new ProviderStatusError("PROVIDER_INVALID_RESPONSE");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 65536): string {
  if (typeof value !== "string" || !value.length || value.length > maximum)
    throw invalid();
  return value;
}
function id(value: unknown) {
  const result = text(value, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw invalid();
  return result;
}
function instant(value: unknown): string {
  const result = text(value, 60);
  if (!/^\d{4}-\d\d-\d\dT/.test(result) || !Number.isFinite(Date.parse(result)))
    throw invalid();
  return new Date(result).toISOString();
}
function nullableInstant(value: unknown): string | null {
  return value === null || value === undefined ? null : instant(value);
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw invalid();
  return value;
}
function unique<T>(values: T[], key: (value: T) => string): T[] {
  const keys = new Set<string>();
  for (const value of values) {
    if (keys.has(key(value))) throw invalid();
    keys.add(key(value));
  }
  return values;
}
function parseNotice(
  value: unknown,
  kind: ProviderNotice["kind"],
): ProviderNotice {
  const row = object(value);
  const noticeId = id(row.id);
  const updatedAt = instant(row.updated_at);
  const updates = array(row.incident_updates).map((value) => {
    const update = object(value);
    return {
      id: id(update.id),
      status: text(update.status, 80),
      body: text(update.body),
      occurredAt: instant(update.display_at ?? update.created_at),
    };
  });
  return {
    id: noticeId,
    kind,
    title: text(row.name, 2000),
    status: text(row.status, 80),
    severity: text(row.impact ?? "unknown", 80),
    componentIds: [
      ...new Set(array(row.components).map((value) => id(object(value).id))),
    ].sort(),
    createdAt: instant(row.created_at),
    updatedAt,
    resolvedAt: nullableInstant(row.resolved_at),
    scheduledFor: nullableInstant(row.scheduled_for),
    scheduledUntil: nullableInstant(row.scheduled_until),
    evidenceHref: `https://www.cloudflarestatus.com/incidents/${noticeId}`,
    updates: unique(updates, (update) => update.id).sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    ),
  };
}
export function parseCloudflareStatus(
  value: unknown,
  readAt = new Date(),
): ProviderStatusSnapshot {
  if (!Number.isFinite(readAt.getTime())) throw invalid();
  const payload = object(value);
  const page = object(payload.page);
  // All three collections are mandatory. A malformed/truncated response cannot reconcile notices.
  const components = array(payload.components).map((value) => {
    const row = object(value);
    return {
      id: id(row.id),
      name: text(row.name, 2000),
      status: text(row.status, 80),
      groupId:
        row.group_id === null || row.group_id === undefined
          ? null
          : id(row.group_id),
    };
  });
  const notices = [
    ...array(payload.incidents).map((notice) =>
      parseNotice(notice, "incident"),
    ),
    ...array(payload.scheduled_maintenances).map((notice) =>
      parseNotice(notice, "maintenance"),
    ),
  ];
  return {
    provider: "cloudflare",
    endpoint: cloudflareStatusEndpoint,
    readAt: readAt.toISOString(),
    reportedAt: instant(page.updated_at),
    complete: true,
    components: unique(components, (component) => component.id),
    notices: unique(notices, (notice) => notice.id),
  };
}
function retrySeconds(response: Response, now: Date): number {
  const raw = response.headers.get("retry-after");
  const value =
    raw && /^\d+$/.test(raw)
      ? Number(raw)
      : raw
        ? Math.ceil((Date.parse(raw) - now.getTime()) / 1000)
        : 120;
  return Math.max(120, Math.min(86400, Number.isFinite(value) ? value : 120));
}
export function createCloudflareStatusReader(
  fetcher: typeof fetch = fetch,
  clock = () => new Date(),
) {
  return async (etag: string | null = null): Promise<ProviderStatusRead> => {
    let response: Response;
    try {
      response = await fetcher(cloudflareStatusEndpoint, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Commandry/1.0 (+https://github.com/iurman/commandry)",
          ...(etag ? { "If-None-Match": etag } : {}),
        },
      });
    } catch {
      throw new ProviderStatusError("PROVIDER_UNAVAILABLE");
    }
    const retry = retrySeconds(response, clock());
    if (response.status === 304) {
      if (!etag) throw invalid();
      return { snapshot: null, notModified: true, etag, retrySeconds: retry };
    }
    if (!response.ok)
      throw new ProviderStatusError(
        response.status === 429
          ? "PROVIDER_RATE_LIMITED"
          : response.status === 401 || response.status === 403
            ? "PROVIDER_UNAUTHORIZED"
            : "PROVIDER_UNAVAILABLE",
        retry,
      );
    if (
      !/application\/(?:[a-z.+-]*\+)?json/i.test(
        response.headers.get("content-type") ?? "",
      )
    )
      throw invalid();
    const maximum = 1_048_576;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maximum)
      throw new ProviderStatusError("PROVIDER_RESPONSE_TOO_LARGE");
    const reader = response.body?.getReader();
    if (!reader) throw invalid();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.byteLength;
        if (size > maximum)
          throw new ProviderStatusError("PROVIDER_RESPONSE_TOO_LARGE");
        chunks.push(result.value);
      }
      const rawPayload: unknown = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      );
      const snapshot = parseCloudflareStatus(rawPayload, clock());
      return {
        snapshot,
        rawPayload,
        notModified: false,
        etag: response.headers.get("etag"),
        retrySeconds: retry,
      };
    } catch (error) {
      if (error instanceof ProviderStatusError) throw error;
      throw invalid();
    } finally {
      await reader.cancel();
    }
  };
}
