import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  OperationalSourceError,
  boundedOperationalRetrySeconds,
  validateOperationalSourceClaim,
  type OperationalObservation,
  type OperationalSourceClaim,
} from "@commandry/application";
import { observatoryAvailabilityEvidenceSchema } from "@commandry/contracts";

const sourceIdentity = "commandry-web-readiness";
const maximumBytes = 4096;
type ReadinessBody =
  | { status: "ready"; service: "web"; database: "ready" }
  | { status: "not_ready"; service: "web"; database: "unavailable" };
const invalid = () =>
  new OperationalSourceError("OPERATIONAL_INVALID_RESPONSE");
const configuration = () =>
  new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");
function localTime(clock: () => Date): Date {
  try {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw configuration();
    const copy = new Date(value.getTime());
    if (!/^\d{4}-/.test(copy.toISOString())) throw configuration();
    return copy;
  } catch {
    throw configuration();
  }
}
function readiness(bytes: Uint8Array, status: number): ReadinessBody {
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid();
  }
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !== "database,service,status"
  )
    throw invalid();
  const value = body as ReadinessBody;
  if (
    value.service !== "web" ||
    !(
      (status === 200 &&
        value.status === "ready" &&
        value.database === "ready") ||
      (status === 503 &&
        value.status === "not_ready" &&
        value.database === "unavailable")
    )
  )
    throw invalid();
  return value;
}
function retry(response: Response, at: Date): number {
  const value = response.headers.get("retry-after");
  return boundedOperationalRetrySeconds(
    value !== null && /^\d+$/.test(value)
      ? Number.isFinite(Number(value))
        ? Number(value)
        : 86400
      : value
        ? Math.ceil((Date.parse(value) - at.getTime()) / 1000)
        : 60,
  );
}
function discard(
  body:
    ReadableStream<Uint8Array> | ReadableStreamDefaultReader<Uint8Array> | null,
): void {
  try {
    // A hostile cancellation promise must not extend the request deadline.
    void body?.cancel().catch(() => {});
  } catch {
    // Cancellation cannot replace the safe result with a transport error.
  }
}

/** Trusted APP_ORIGIN only; a reviewed claim cannot choose another endpoint. */
export function createCommandryReadinessReader(options: {
  appOrigin: string;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  allowLoopbackForTests?: boolean;
}): (claim: OperationalSourceClaim) => Promise<OperationalObservation> {
  let endpoint: string;
  const timeoutMs = options.timeoutMs === undefined ? 10000 : options.timeoutMs;
  try {
    if (
      typeof options.appOrigin !== "string" ||
      !/^https?:\/\/[^/?#@\\\s]+\/?$/i.test(options.appOrigin) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60000 ||
      (options.fetch !== undefined && typeof options.fetch !== "function") ||
      (options.now !== undefined && typeof options.now !== "function") ||
      (options.allowLoopbackForTests !== undefined &&
        typeof options.allowLoopbackForTests !== "boolean")
    )
      throw configuration();
    const origin = new URL(options.appOrigin);
    if (
      !origin.hostname ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      (origin.protocol !== "https:" &&
        !(
          origin.protocol === "http:" &&
          options.allowLoopbackForTests === true &&
          /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/?$/i.test(
            options.appOrigin,
          )
        ))
    )
      throw configuration();
    endpoint = new URL("/health/ready", origin.origin).href;
  } catch {
    throw configuration();
  }
  const fetcher = options.fetch ?? fetch;
  const clock = options.now ?? (() => new Date());
  return async (rawClaim) => {
    const claim = validateOperationalSourceClaim(rawClaim);
    if (claim.kind !== "http-readiness")
      throw new OperationalSourceError("OPERATIONAL_UNSUPPORTED_SOURCE");
    if (claim.externalId !== sourceIdentity)
      throw new OperationalSourceError("OPERATIONAL_INVALID_CLAIM");
    const startedAt = localTime(clock);
    const started = performance.now();
    const controller = new AbortController();
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        expired = true;
        controller.abort();
        reject(new OperationalSourceError("OPERATIONAL_TIMEOUT"));
      }, timeoutMs);
    });
    const bounded = <T>(value: Promise<T>) => Promise.race([value, deadline]);
    function elapsed(): number {
      const duration = performance.now() - started;
      if (!Number.isFinite(duration) || duration < 0) throw configuration();
      if (duration >= timeoutMs)
        throw new OperationalSourceError("OPERATIONAL_TIMEOUT");
      return duration;
    }
    let response: Response | undefined;
    let body: ReadableStream<Uint8Array> | null = null;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const request = Promise.resolve().then(() =>
        fetcher(endpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        }),
      );
      // A fetch implementation may ignore abort and resolve after our deadline.
      void request.then(
        (late) => {
          if (controller.signal.aborted) {
            try {
              discard(late.body);
            } catch {
              // A malformed late response cannot escape deadline cleanup.
            }
          }
        },
        () => {},
      );
      response = await bounded(request);
      body = response.body;
      elapsed();
      if (
        response.redirected ||
        (response.url !== "" && response.url !== endpoint)
      )
        throw invalid();
      if (response.status !== 200 && response.status !== 503)
        throw new OperationalSourceError(
          response.status === 401 || response.status === 403
            ? "OPERATIONAL_UNAUTHORIZED"
            : response.status === 404
              ? "OPERATIONAL_NOT_FOUND"
              : response.status === 429
                ? "OPERATIONAL_RATE_LIMITED"
                : "OPERATIONAL_UNAVAILABLE",
          retry(response, startedAt),
        );
      if (
        !/^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|$)/i.test(
          response.headers.get("content-type") ?? "",
        )
      )
        throw invalid();
      const declared = response.headers.get("content-length");
      if (declared !== null && !/^\d+$/.test(declared)) throw invalid();
      if (declared !== null && Number(declared) > maximumBytes)
        throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
      reader = body?.getReader();
      if (!reader) throw invalid();
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        elapsed();
        const part = await bounded(reader.read());
        elapsed();
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) throw invalid();
        if (part.value.byteLength === 0) continue;
        length += part.value.byteLength;
        if (length > maximumBytes)
          throw new OperationalSourceError("OPERATIONAL_RESPONSE_TOO_LARGE");
        chunks.push(part.value);
      }
      const encoding = response.headers.get("content-encoding");
      if (
        declared !== null &&
        (encoding === null || encoding.trim().toLowerCase() === "identity") &&
        Number(declared) !== length
      )
        throw invalid();
      const rawPayload = readiness(Buffer.concat(chunks), response.status);
      const completedAt = localTime(clock);
      const responseTimeMs = elapsed();
      if (completedAt.getTime() < startedAt.getTime()) throw configuration();
      const checkedAt = completedAt.toISOString();
      const up = response.status === 200;
      const digest = createHash("sha256")
        .update(
          JSON.stringify([
            claim.id,
            claim.resourceId,
            sourceIdentity,
            checkedAt,
            rawPayload.status,
          ]),
        )
        .digest("hex");
      const checkId = `commandry-readiness:${digest}`;
      const details = observatoryAvailabilityEvidenceSchema.parse({
        monitorId: sourceIdentity,
        monitorStatus: up ? "up" : "down",
        enabled: true,
        sourceState: "available",
        reason: "observed",
        lastCheckedAt: checkedAt,
        latestCheck: {
          checkedAt,
          status: up ? "up" : "down",
          statusCode: response.status,
          responseTimeMs,
        },
        openIncident: null,
        recentChecksLimit: 25,
        historyComplete: false,
      });
      return {
        sourceId: claim.id,
        resourceId: claim.resourceId,
        observedAt: checkedAt,
        signals: [
          {
            id: checkId,
            resourceId: claim.resourceId,
            facet: "availability",
            state: up ? "passing" : "failing",
            sourceId: claim.id,
            observedAt: checkedAt,
            freshnessMs: claim.freshnessSeconds * 1000,
            evidenceRefs: [`source:${claim.id}`, checkId],
            environment: claim.environment,
            incidentId: null,
          },
        ],
        details,
        rawPayload,
      };
    } catch (error) {
      if (expired) throw new OperationalSourceError("OPERATIONAL_TIMEOUT");
      if (error instanceof OperationalSourceError)
        throw new OperationalSourceError(error.code, error.retrySeconds);
      throw new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      controller.abort();
      discard(reader ?? body);
      try {
        reader?.releaseLock();
      } catch {
        // A pending hostile reader cannot hold the returned result open.
      }
    }
  };
}
