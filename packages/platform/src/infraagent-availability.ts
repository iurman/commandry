import { createHash } from "node:crypto";
import type { ObservatorySignal } from "@commandry/domain";
import {
  OperationalSourceError,
  boundedOperationalRetrySeconds,
  validateOperationalSourceClaim,
} from "@commandry/application";
import type {
  OperationalObservation,
  OperationalSourceClaim,
} from "@commandry/application";

const maximumBytes = 1_048_576;
const invalid = () =>
  new OperationalSourceError("OPERATIONAL_INVALID_RESPONSE");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum = 200): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > maximum ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw invalid();
  return value;
}
function instant(value: unknown): string {
  const raw = text(value, 100);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      raw,
    ) ||
    !Number.isFinite(Date.parse(raw)) ||
    new Date(`${raw.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !==
      raw.slice(0, 10)
  )
    throw invalid();
  return new Date(raw).toISOString();
}
const nullableInstant = (value: unknown) =>
  value === null ? null : instant(value);
function identifier(value: unknown): string {
  const result = text(value);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result)) throw invalid();
  return result;
}
type Check = {
  checkedAt: string;
  status: string;
  responseTimeMs: number | null;
  statusCode: number | null;
};
function status(value: unknown): string {
  const raw = text(value, 100);
  return [
    "up",
    "down",
    "degraded",
    "unknown",
    "pending",
    "paused",
    "unreachable",
  ].includes(raw)
    ? raw
    : "unknown";
}
function parseCheck(value: unknown): Check {
  const raw = object(value);
  if (
    (raw.responseTimeMs !== null &&
      (typeof raw.responseTimeMs !== "number" ||
        !Number.isFinite(raw.responseTimeMs) ||
        raw.responseTimeMs < 0)) ||
    (raw.statusCode !== null &&
      (typeof raw.statusCode !== "number" ||
        !Number.isInteger(raw.statusCode) ||
        raw.statusCode < 100 ||
        raw.statusCode > 599))
  )
    throw invalid();
  return {
    checkedAt: instant(raw.checkedAt),
    status: status(raw.status),
    responseTimeMs: raw.responseTimeMs as number | null,
    statusCode: raw.statusCode as number | null,
  };
}
function observation(
  payload: unknown,
  claim: OperationalSourceClaim,
  now: Date,
): OperationalObservation {
  const raw = object(payload);
  const monitor = object(raw.monitor);
  if (
    raw.success !== true ||
    identifier(monitor.id) !== claim.externalId ||
    typeof monitor.enabled !== "boolean" ||
    !Array.isArray(raw.recentChecks) ||
    raw.recentChecks.length > 25 ||
    !Object.hasOwn(raw, "openIncident")
  )
    throw invalid();
  const monitorStatus = status(monitor.status);
  const lastCheckedAt = nullableInstant(monitor.lastCheckedAt);
  const checks = raw.recentChecks
    .map(parseCheck)
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  if (new Set(checks.map((check) => check.checkedAt)).size !== checks.length)
    throw invalid();
  const latest = checks[0] ?? null;
  if (lastCheckedAt !== (latest?.checkedAt ?? null)) throw invalid();
  let openIncident: {
    id: string;
    startedAt: string;
    acknowledgedAt: string | null;
  } | null = null;
  if (raw.openIncident !== null) {
    const incident = object(raw.openIncident);
    openIncident = {
      id: identifier(incident.id),
      startedAt: instant(incident.startedAt),
      acknowledgedAt: nullableInstant(incident.acknowledgedAt),
    };
  }
  const known = ["up", "down", "degraded"];
  if (
    monitor.enabled &&
    known.includes(monitorStatus) &&
    latest &&
    known.includes(latest.status) &&
    monitorStatus !== latest.status
  )
    throw invalid();
  let sourceState: "available" | "stale" | "unknown" | "disabled" = "available";
  let reason:
    | "observed"
    | "stale"
    | "disabled"
    | "paused"
    | "pending"
    | "unknown"
    | "future"
    | "no_observation" = "observed";
  if (!monitor.enabled) {
    sourceState = "disabled";
    reason = "disabled";
  } else if (monitorStatus === "paused") {
    sourceState = "disabled";
    reason = "paused";
  } else if (monitorStatus === "pending") {
    sourceState = "unknown";
    reason = "pending";
  } else if (!known.includes(monitorStatus)) {
    sourceState = "unknown";
    reason = "unknown";
  } else if (!latest) {
    sourceState = "unknown";
    reason = "no_observation";
  } else if (Date.parse(latest.checkedAt) > now.getTime()) {
    sourceState = "unknown";
    reason = "future";
  } else if (!known.includes(latest.status)) {
    sourceState = "unknown";
    reason = "unknown";
  } else if (
    now.getTime() - Date.parse(latest.checkedAt) >=
    claim.freshnessSeconds * 1000
  ) {
    sourceState = "stale";
    reason = "stale";
  }
  const signals: ObservatorySignal[] = [];
  if (latest && (sourceState === "available" || sourceState === "stale")) {
    const checkIdentity = createHash("sha256")
      .update(JSON.stringify([claim.id, claim.externalId, latest.checkedAt]))
      .digest("hex");
    signals.push({
      id: `infraagent-check:${checkIdentity}`,
      resourceId: claim.resourceId,
      facet: "availability",
      state:
        latest.status === "up"
          ? "passing"
          : latest.status === "down"
            ? "failing"
            : "degraded",
      sourceId: claim.id,
      observedAt: latest.checkedAt,
      freshnessMs: claim.freshnessSeconds * 1000,
      evidenceRefs: [`operational-observation:${claim.id}:${checkIdentity}`],
      environment: claim.environment,
      incidentId: openIncident?.id ?? null,
    });
  }
  return {
    sourceId: claim.id,
    resourceId: claim.resourceId,
    observedAt: latest?.checkedAt ?? null,
    signals,
    details: {
      monitorId: claim.externalId,
      monitorStatus,
      enabled: monitor.enabled,
      sourceState,
      reason,
      lastCheckedAt,
      latestCheck: latest,
      openIncident,
      recentChecksLimit: 25,
      historyComplete: false,
    },
    rawPayload: payload,
  };
}
function retrySeconds(response: Response, now: Date): number {
  const raw = response.headers.get("retry-after");
  return boundedOperationalRetrySeconds(
    raw && /^\d+$/.test(raw)
      ? Number.isFinite(Number(raw))
        ? Number(raw)
        : 86400
      : raw
        ? Math.ceil((Date.parse(raw) - now.getTime()) / 1000)
        : 60,
  );
}
async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    /* Cleanup cannot expose a transport body/error. */
  }
}

/** Trusted server construction only. Never construct this from public query JSON. */
export function createInfraAgentAvailabilityReader(options: {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  allowLoopbackForTests?: boolean;
}) {
  let origin: string;
  const apiKey = options.apiKey;
  const timeoutMs = options.timeoutMs ?? 10000;
  try {
    if (typeof options.baseUrl !== "string" || typeof apiKey !== "string")
      throw new Error();
    const base = new URL(options.baseUrl);
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
      base.hostname,
    );
    if (
      /[\s\\]/.test(options.baseUrl) ||
      !base.hostname ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash ||
      (base.protocol !== "https:" &&
        !(
          base.protocol === "http:" &&
          loopback &&
          options.allowLoopbackForTests === true
        )) ||
      !/^[\x21-\x7e]{1,4096}$/.test(apiKey) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60000
    )
      throw new Error();
    origin = base.origin;
  } catch {
    throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
  }
  const fetcher = options.fetch ?? fetch;
  const clock = options.now ?? (() => new Date());
  return async (
    rawClaim: OperationalSourceClaim,
  ): Promise<OperationalObservation> => {
    const claim = validateOperationalSourceClaim(rawClaim);
    if (claim.kind !== "infraagent-monitor")
      throw new OperationalSourceError("OPERATIONAL_UNSUPPORTED_SOURCE");
    let externalId: string;
    try {
      externalId = identifier(claim.externalId);
    } catch {
      throw new OperationalSourceError("OPERATIONAL_INVALID_CLAIM");
    }
    const endpoint = new URL(
      `/api/v1/monitors/${encodeURIComponent(externalId)}`,
      origin,
    );
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
      response = await fetcher(endpoint.href, {
        method: "GET",
        redirect: "error",
        signal,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Accept-Encoding": "identity",
        },
      });
    } catch {
      throw new OperationalSourceError(
        signal.aborted ? "OPERATIONAL_TIMEOUT" : "OPERATIONAL_UNAVAILABLE",
      );
    }
    const now = clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      await discard(response);
      throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
    }
    if (
      response.redirected ||
      (response.url && response.url !== endpoint.href) ||
      !response.ok
    ) {
      const retry = retrySeconds(response, now);
      await discard(response);
      throw new OperationalSourceError(
        response.status === 429
          ? "OPERATIONAL_RATE_LIMITED"
          : response.status === 401 || response.status === 403
            ? "OPERATIONAL_UNAUTHORIZED"
            : response.status === 404
              ? "OPERATIONAL_NOT_FOUND"
              : "OPERATIONAL_UNAVAILABLE",
        retry,
      );
    }
    if (
      !/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      await discard(response);
      throw invalid();
    }
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && !/^\d+$/.test(declaredLength)) {
      await discard(response);
      throw invalid();
    }
    if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
      await discard(response);
      throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
    }
    const reader = response.body?.getReader();
    if (!reader) throw invalid();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maximumBytes)
          throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
        chunks.push(part.value);
      }
      if (
        declaredLength !== null &&
        !response.headers.get("content-encoding") &&
        size !== Number(declaredLength)
      )
        throw invalid();
      const payload: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
      const completedAt = clock();
      if (
        !(completedAt instanceof Date) ||
        !Number.isFinite(completedAt.getTime())
      )
        throw new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
      return observation(payload, claim, completedAt);
    } catch (error) {
      if (error instanceof OperationalSourceError) throw error;
      throw signal.aborted
        ? new OperationalSourceError("OPERATIONAL_TIMEOUT")
        : invalid();
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* Never replace the safe error with a transport exception. */
      }
    }
  };
}
