import type { ObservatorySignal } from "@commandry/domain";
import { observatoryFreshness } from "@commandry/domain";
import {
  observatorySignalSchema,
  providerInventoryEvidenceSchema,
} from "@commandry/contracts";

export type OperationalSourceClaim = {
  id: string;
  leaseId: string;
  resourceId: string;
  kind:
    | "infraagent-monitor"
    | "github-repository"
    | "http-readiness"
    | "endpoint-check"
    | "cloudflare-account"
    | "namecheap-account";
  externalId: string;
  freshnessSeconds: number;
  environment: string | null;
};
export type OperationalObservation = {
  sourceId: string;
  resourceId: string;
  /** null when the source has no actual observation; never substitute fetch time. */
  observedAt: string | null;
  signals: ObservatorySignal[];
  /** Derived, allowlisted data only. Never include provider configuration or credentials. */
  details: Record<string, unknown>;
  /** SERVER PRIVATE: persist the original immutably; never return it through UI/MCP. */
  rawPayload: unknown;
};
export interface OperationalSourcePort {
  /** Atomically lease one enabled due source; null if another worker owns it. */
  claim(): Promise<OperationalSourceClaim | null>;
  /** Append immutable evidence atomically under the exact lease. Empty unknown/disabled
   * observations update source coverage only and never erase earlier signals/history. */
  complete(
    claim: OperationalSourceClaim,
    observation: OperationalObservation,
  ): Promise<void>;
  /** Preserve all prior evidence; update only safe failure/backoff metadata under the lease. */
  fail(
    claim: OperationalSourceClaim,
    code: string,
    retrySeconds: number,
  ): Promise<void>;
}
export const operationalSourceErrorCodes = [
  "OPERATIONAL_INVALID_CLAIM",
  "OPERATIONAL_INVALID_OBSERVATION",
  "OPERATIONAL_INVALID_RESPONSE",
  "OPERATIONAL_CONFIGURATION_INVALID",
  "OPERATIONAL_UNSUPPORTED_SOURCE",
  "OPERATIONAL_UNAUTHORIZED",
  "OPERATIONAL_NOT_FOUND",
  "OPERATIONAL_RATE_LIMITED",
  "OPERATIONAL_TIMEOUT",
  "OPERATIONAL_RESPONSE_TOO_LARGE",
  "OPERATIONAL_UNAVAILABLE",
] as const;
export type OperationalSourceErrorCode =
  (typeof operationalSourceErrorCodes)[number];
export function boundedOperationalRetrySeconds(value: number = 60): number {
  return Number.isFinite(value)
    ? Math.max(30, Math.min(86400, Math.ceil(value)))
    : 60;
}
/** The message is an allowlisted code, never a URL, credential or provider error body. */
export class OperationalSourceError extends Error {
  readonly retrySeconds: number;
  readonly code: OperationalSourceErrorCode;
  constructor(code: OperationalSourceErrorCode, retrySeconds = 60) {
    const safeCode = operationalSourceErrorCodes.includes(code)
      ? code
      : "OPERATIONAL_UNAVAILABLE";
    super(safeCode);
    this.name = "OperationalSourceError";
    this.code = safeCode;
    this.retrySeconds = boundedOperationalRetrySeconds(retrySeconds);
  }
}
function safeData(value: unknown, seen = new Set<object>(), depth = 0): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return;
  if (typeof value !== "object" || depth > 64 || seen.has(value))
    throw new OperationalSourceError("OPERATIONAL_INVALID_OBSERVATION");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new OperationalSourceError("OPERATIONAL_INVALID_OBSERVATION");
  seen.add(value);
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(value),
  )) {
    if (Array.isArray(value) && name === "length") continue;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
      throw new OperationalSourceError("OPERATIONAL_INVALID_OBSERVATION");
    safeData(descriptor.value, seen, depth + 1);
  }
  if (Object.getOwnPropertySymbols(value).length)
    throw new OperationalSourceError("OPERATIONAL_INVALID_OBSERVATION");
  seen.delete(value);
}
const text = (value: unknown, maximum = 500) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value &&
  !/[\u0000-\u001f\u007f]/.test(value);
const resourceIdentity = (value: unknown) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function validateOperationalSourceClaim(
  claim: OperationalSourceClaim,
): OperationalSourceClaim {
  try {
    safeData(claim);
    if (
      Object.keys(claim).sort().join(",") !==
        "environment,externalId,freshnessSeconds,id,kind,leaseId,resourceId" ||
      !text(claim.id, 200) ||
      !text(claim.leaseId, 200) ||
      !resourceIdentity(claim.resourceId) ||
      ![
        "infraagent-monitor",
        "github-repository",
        "http-readiness",
        "endpoint-check",
        "cloudflare-account",
        "namecheap-account",
      ].includes(claim.kind) ||
      !text(claim.externalId) ||
      !Number.isSafeInteger(claim.freshnessSeconds) ||
      claim.freshnessSeconds <= 0 ||
      claim.freshnessSeconds > Number.MAX_SAFE_INTEGER / 1000 ||
      (claim.environment !== null && !text(claim.environment, 100))
    )
      throw new Error();
    return structuredClone(claim);
  } catch {
    throw new OperationalSourceError("OPERATIONAL_INVALID_CLAIM");
  }
}
function validateObservation(
  claim: OperationalSourceClaim,
  observation: OperationalObservation,
  now: Date,
): OperationalObservation {
  try {
    safeData(observation);
    if (
      Object.keys(observation).sort().join(",") !==
        "details,observedAt,rawPayload,resourceId,signals,sourceId" ||
      observation.sourceId !== claim.id ||
      observation.resourceId !== claim.resourceId ||
      !observation.details ||
      typeof observation.details !== "object" ||
      Array.isArray(observation.details) ||
      !observation.rawPayload ||
      typeof observation.rawPayload !== "object" ||
      !Array.isArray(observation.signals) ||
      !Number.isFinite(now.getTime())
    )
      throw new Error();
    if (
      observation.observedAt !== null &&
      (!text(observation.observedAt, 100) ||
        !Number.isFinite(Date.parse(observation.observedAt)))
    )
      throw new Error();
    const ids = new Set<string>();
    for (const signal of observation.signals) {
      if (
        signal.sourceId !== claim.id ||
        signal.resourceId !== claim.resourceId ||
        signal.environment !== claim.environment ||
        signal.freshnessMs !== claim.freshnessSeconds * 1000 ||
        ids.has(signal.id) ||
        observation.observedAt === null ||
        Date.parse(signal.observedAt) > Date.parse(observation.observedAt) ||
        signal.evidenceRefs.some((ref) => !ref.trim())
      )
        throw new Error();
      const parsed = observatorySignalSchema.parse({
        ...signal,
        freshness: observatoryFreshness(
          signal.observedAt,
          signal.freshnessMs,
          now.toISOString(),
        ),
      });
      if (parsed.freshness === "future" && signal.state !== "unknown")
        throw new Error();
      ids.add(signal.id);
    }
    if (["cloudflare-account", "namecheap-account"].includes(claim.kind)) {
      const inventory = providerInventoryEvidenceSchema.parse(
        observation.details,
      );
      if (
        observation.signals.length !== 0 ||
        inventory.accountId !== claim.externalId ||
        inventory.readAt !== observation.observedAt ||
        inventory.provider !==
          (claim.kind === "cloudflare-account" ? "cloudflare" : "namecheap") ||
        Date.parse(inventory.readAt) > now.getTime()
      )
        throw new Error();
    } else if (observation.signals.length) {
      if (
        !observation.signals.some(
          (signal) =>
            Date.parse(signal.observedAt) ===
            Date.parse(observation.observedAt!),
        ) ||
        ["unknown", "disabled", "unavailable"].includes(
          String(observation.details.sourceState),
        )
      )
        throw new Error();
    } else {
      const state = observation.details.sourceState;
      const reason = observation.details.reason;
      if (
        state === "disabled"
          ? reason !== "disabled" && reason !== "paused"
          : state !== "unknown" ||
            !["pending", "unknown", "future", "no_observation"].includes(
              String(reason),
            )
      )
        throw new Error();
    }
    return structuredClone(observation);
  } catch {
    throw new OperationalSourceError("OPERATIONAL_INVALID_OBSERVATION");
  }
}

export function createOperationalObservationPoller(
  port: OperationalSourcePort,
  read: (claim: OperationalSourceClaim) => Promise<OperationalObservation>,
  options: { now?: () => Date } = {},
) {
  let inFlight: Promise<boolean> | undefined;
  const clock = options.now ?? (() => new Date());
  async function attempt(): Promise<boolean> {
    const rawClaim = await port.claim();
    if (rawClaim === null) return false;
    let claim = rawClaim;
    let observation: OperationalObservation;
    try {
      claim = Object.freeze(validateOperationalSourceClaim(rawClaim));
      const identity = JSON.stringify(claim);
      const rawObservation = await read(claim);
      if (JSON.stringify(validateOperationalSourceClaim(rawClaim)) !== identity)
        throw new OperationalSourceError("OPERATIONAL_INVALID_CLAIM");
      observation = validateObservation(claim, rawObservation, clock());
    } catch (error) {
      // Do not persist arbitrary thrown messages/code strings from providers or transports.
      const failure =
        error instanceof OperationalSourceError
          ? new OperationalSourceError(error.code, error.retrySeconds)
          : new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
      await port.fail(claim, failure.code, failure.retrySeconds);
      return true;
    }
    // Persistence/audit failures propagate to the worker; they are not source outages.
    await port.complete(claim, observation);
    return true;
  }
  return {
    pollNext(): Promise<boolean> {
      if (!inFlight)
        inFlight = attempt().finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
  };
}
