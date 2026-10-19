import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import { isAbsolute } from "node:path";
import { connect } from "node:net";
import { performance } from "node:perf_hooks";
import {
  OperationalSourceError,
  validateOperationalSourceClaim,
  type OperationalSourceClaim,
  type OperationalObservation,
} from "@commandry/application";
import {
  observatoryAvailabilityEvidenceSchema,
  endpointCheckCatalogueSchema,
  observatoryProbeTransportSchema,
  type EndpointCheckCatalogue,
} from "@commandry/contracts";
export { endpointCheckCatalogueSchema } from "@commandry/contracts";
export type { EndpointCheckCatalogue } from "@commandry/contracts";

type Check = EndpointCheckCatalogue["checks"][number];
const configurationError = () =>
  new OperationalSourceError("OPERATIONAL_CONFIGURATION_INVALID");

/** Operator-owned startup configuration only. Reject links, special files and public files. */
export async function readEndpointCheckCatalogue(
  path: string,
): Promise<EndpointCheckCatalogue> {
  let file: fs.FileHandle | undefined;
  try {
    if (!isAbsolute(path) || path.includes("\0") || !constants.O_NOFOLLOW)
      throw configurationError();
    file = await fs.open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const before = await file.stat();
    if (
      !before.isFile() ||
      (before.mode & 0o037) !== 0 ||
      before.size < 1 ||
      before.size > 262144
    )
      throw configurationError();
    const buffer = Buffer.alloc(before.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const result = await file.read(buffer, size, buffer.length - size, size);
      if (!result.bytesRead) break;
      size += result.bytesRead;
    }
    const after = await file.stat();
    if (
      size !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw configurationError();
    return endpointCheckCatalogueSchema.parse(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, size),
        ),
      ),
    );
  } catch {
    throw configurationError();
  } finally {
    await file?.close();
  }
}

function tcp(check: Extract<Check, { protocol: "tcp" }>): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: check.host, port: check.port });
    let finished = false;
    const done = (result: boolean | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.destroy();
      if (result === null)
        reject(new OperationalSourceError("OPERATIONAL_UNAVAILABLE"));
      else resolve(result);
    };
    const timer = setTimeout(() => done(false), check.timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", (error: NodeJS.ErrnoException) =>
      done(
        ["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(
          error.code ?? "",
        )
          ? false
          : null,
      ),
    );
  });
}

/** A claim selects a configured identity; it can never choose a network destination. */
export function createEndpointCheckReader(options: {
  catalogue: EndpointCheckCatalogue;
  originResourceId?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): (claim: OperationalSourceClaim) => Promise<OperationalObservation> {
  const catalogue = endpointCheckCatalogueSchema.parse(options.catalogue);
  if (
    options.originResourceId !== undefined &&
    !observatoryProbeTransportSchema.shape.originResourceId.safeParse(
      options.originResourceId,
    ).success
  )
    throw configurationError();
  const checks = new Map(catalogue.checks.map((check) => [check.id, check]));
  const fetcher = options.fetch ?? fetch;
  return async (rawClaim) => {
    const claim = validateOperationalSourceClaim(rawClaim);
    const check = checks.get(claim.externalId);
    if (claim.kind !== "endpoint-check")
      throw new OperationalSourceError("OPERATIONAL_UNSUPPORTED_SOURCE");
    if (
      !check ||
      check.resourceId !== claim.resourceId ||
      check.environment !== claim.environment
    )
      throw configurationError();
    const started = performance.now();
    let passing: boolean;
    let statusCode: number | null = null;
    if (check.protocol === "tcp") passing = await tcp(check);
    else {
      const controller = new AbortController();
      let expired = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          expired = true;
          controller.abort();
          reject(new OperationalSourceError("OPERATIONAL_TIMEOUT"));
        }, check.timeoutMs);
      });
      const request = Promise.resolve().then(() =>
        fetcher(check.url, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          headers: { "User-Agent": "Commandry-Endpoint-Check/1.0" },
          signal: controller.signal,
        }),
      );
      // Dispose even a fetch implementation that ignores abort and resolves late.
      void request.then(
        (response) => {
          if (expired) void response.body?.cancel().catch(() => {});
        },
        () => {},
      );
      try {
        const response = await Promise.race([request, deadline]);
        statusCode = response.status;
        if (
          !Number.isInteger(statusCode) ||
          statusCode < 200 ||
          statusCode > 599
        )
          throw new OperationalSourceError("OPERATIONAL_INVALID_RESPONSE");
        passing = check.acceptedStatuses.includes(statusCode);
        void response.body?.cancel().catch(() => {});
      } catch (error) {
        if (expired) passing = false;
        else if (error instanceof OperationalSourceError) throw error;
        else throw new OperationalSourceError("OPERATIONAL_UNAVAILABLE");
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }
    const date = (options.now ?? (() => new Date()))();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
      throw configurationError();
    const checkedAt = date.toISOString();
    const responseTimeMs = performance.now() - started;
    const target =
      check.protocol === "http" ? check.url : `${check.host}:${check.port}`;
    const details = observatoryAvailabilityEvidenceSchema.parse({
      probe: { protocol: check.protocol, vantage: check.vantage, target },
      monitorId: check.id,
      monitorStatus: passing ? "up" : "down",
      enabled: true,
      sourceState: "available",
      reason: "observed",
      lastCheckedAt: checkedAt,
      latestCheck: {
        checkedAt,
        status: passing ? "up" : "down",
        responseTimeMs,
        statusCode,
      },
      openIncident: null,
      recentChecksLimit: 25,
      historyComplete: false,
    });
    const id = `endpoint:${createHash("sha256")
      .update(JSON.stringify({ sourceId: claim.id, checkedAt, details }))
      .digest("hex")}`;
    return {
      sourceId: claim.id,
      resourceId: claim.resourceId,
      observedAt: checkedAt,
      details,
      rawPayload: {
        schemaVersion: 1,
        ...details,
        ...(options.originResourceId
          ? {
              probeTransport: observatoryProbeTransportSchema.parse({
                originResourceId: options.originResourceId,
                protocol: check.protocol,
                responseTimeMs,
                responseReceived:
                  check.protocol === "http" ? statusCode !== null : passing,
              }),
            }
          : {}),
      },
      signals: [
        {
          id,
          resourceId: claim.resourceId,
          facet: "availability",
          state: passing ? "passing" : "failing",
          sourceId: claim.id,
          observedAt: checkedAt,
          freshnessMs: claim.freshnessSeconds * 1000,
          evidenceRefs: [`source:${claim.id}`, id],
          environment: claim.environment,
          incidentId: null,
        },
      ],
    };
  };
}
