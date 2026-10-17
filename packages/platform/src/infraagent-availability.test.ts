import { createServer, type RequestListener } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observatoryFreshness } from "@commandry/domain";
import { createInfraAgentAvailabilityReader } from "./infraagent-availability";
import { createOperationalObservationPoller } from "@commandry/application";
import type {
  OperationalObservation,
  OperationalSourceClaim,
  OperationalSourcePort,
} from "@commandry/application";

const at = "2026-10-16T12:00:00.000Z";
const apiKey = "synthetic_read_only_key";
const claim: OperationalSourceClaim = {
  id: "00000000-0000-4000-8000-000000000001",
  leaseId: "synthetic-lease",
  resourceId: "00000000-0000-4000-8000-000000000002",
  kind: "infraagent-monitor",
  externalId: "monitor-one",
  freshnessSeconds: 300,
  environment: "production",
};
function payload(status = "up", checkedAt: string | null = at) {
  return {
    success: true,
    monitor: {
      id: claim.externalId,
      name: "Synthetic monitor",
      description: null,
      type: "http",
      status,
      enabled: true,
      target: "https://private.invalid/?token=DO_NOT_DISCLOSE",
      intervalSeconds: 60,
      escalationSeconds: 300,
      appId: "synthetic-app",
      lastCheckedAt: checkedAt,
      lastStatusChangedAt: checkedAt,
      createdAt: at,
      config: { key: "DO_NOT_DISCLOSE_CONFIG" },
      heartbeatUrl: "https://private.invalid/DO_NOT_DISCLOSE_HEARTBEAT",
    },
    recentChecks:
      checkedAt === null
        ? []
        : [
            {
              checkedAt,
              status,
              responseTimeMs: status === "up" ? 15 : null,
              statusCode: status === "up" ? 200 : 503,
              error: status === "up" ? null : "DO_NOT_DISCLOSE_PROVIDER_ERROR",
            },
          ],
    openIncident:
      status === "down"
        ? {
            id: "incident-one",
            startedAt: checkedAt!,
            cause: "DO_NOT_DISCLOSE_CAUSE",
            lastError: "DO_NOT_DISCLOSE_ERROR",
            acknowledgedAt: null as string | null,
            escalationCount: 1,
          }
        : null,
  };
}
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function server(handler: RequestListener) {
  const service = createServer(handler);
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  const address = service.address();
  if (!address || typeof address === "string")
    throw new Error("No disposable boundary");
  cleanups.push(async () => {
    service.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      service.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return `http://127.0.0.1:${address.port}`;
}
async function bodyServer(body: unknown, mime = "application/json") {
  return server((_request, response) => {
    response.writeHead(200, { "content-type": mime });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  });
}
const reader = (baseUrl: string, timeoutMs = 1000) =>
  createInfraAgentAvailabilityReader({
    baseUrl,
    apiKey,
    allowLoopbackForTests: true,
    now: () => new Date("2026-10-16T12:02:01.000Z"),
    timeoutMs,
  });

describe("supported InfraAgent read-only availability adapter", () => {
  it("uses actual HTTP passing/failure/acknowledgment/recovery responses through the poller", async () => {
    let current = payload();
    let requests = 0;
    const baseUrl = await server((request, response) => {
      requests++;
      expect(request.method).toBe("GET");
      expect(request.url).toBe("/api/v1/monitors/monitor-one");
      expect(request.headers.authorization).toBe(`Bearer ${apiKey}`);
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(JSON.stringify(current));
    });
    const observations: OperationalObservation[] = [];
    const port: OperationalSourcePort = {
      claim: vi.fn(async () => claim),
      complete: vi.fn(async (_claim, observation) => {
        observations.push(observation);
      }),
      fail: vi.fn(async () => {}),
    };
    const poll = createOperationalObservationPoller(port, reader(baseUrl), {
      now: () => new Date("2026-10-16T12:02:01.000Z"),
    });
    await poll.pollNext();
    current = payload("down", "2026-10-16T12:01:00.000Z");
    await poll.pollNext();
    current.openIncident!.acknowledgedAt = "2026-10-16T12:01:30.000Z";
    await poll.pollNext();
    current = payload("up", "2026-10-16T12:02:00.000Z");
    await poll.pollNext();
    expect(requests).toBe(4);
    expect(port.fail).not.toHaveBeenCalled();
    expect(
      observations.map((observation) => observation.signals[0]?.state),
    ).toEqual(["passing", "failing", "failing", "passing"]);
    expect(observations.map((observation) => observation.observedAt)).toEqual([
      at,
      "2026-10-16T12:01:00.000Z",
      "2026-10-16T12:01:00.000Z",
      "2026-10-16T12:02:00.000Z",
    ]);
    expect(observations[1]?.signals[0]?.id).toBe(
      observations[2]?.signals[0]?.id,
    );
    expect(observations[1]?.signals[0]?.incidentId).toBe("incident-one");
    expect(observations[2]?.signals[0]?.incidentId).toBe("incident-one");
    expect(observations[3]?.signals[0]?.incidentId).toBeNull();
    expect(observations[3]?.signals[0]?.id).not.toBe(
      observations[1]?.signals[0]?.id,
    );
    expect(observations[1]?.rawPayload).toMatchObject({
      monitor: { config: { key: "DO_NOT_DISCLOSE_CONFIG" } },
    });
    for (const observation of observations) {
      const derived = JSON.stringify({
        signals: observation.signals,
        details: observation.details,
      });
      expect(derived).not.toContain("DO_NOT_DISCLOSE");
      expect(derived).not.toContain("private.invalid");
      expect(derived).not.toContain(apiKey);
      expect(observation.details).toMatchObject({
        recentChecksLimit: 25,
        historyComplete: false,
      });
      expect(observation.details).not.toHaveProperty("resolvedIncidents");
    }
  });
  it("keeps an unchanged check identity and observation time stable across ordinary reads", async () => {
    const source = payload();
    const baseUrl = await bodyServer(source, "application/problem+json");
    const read = reader(baseUrl);
    const a = await read(claim),
      b = await read(claim);
    expect(a).toEqual(b);
    expect(a.observedAt).toBe(at);
    expect(a.signals[0]?.freshnessMs).toBe(300000);
    expect(a.signals[0]?.environment).toBe("production");
  });
  it("retains stale observation age instead of refreshing it into passing coverage", async () => {
    const baseUrl = await bodyServer(payload());
    const read = createInfraAgentAvailabilityReader({
      baseUrl,
      apiKey,
      allowLoopbackForTests: true,
      now: () => new Date("2026-10-16T13:00:00Z"),
    });
    const observation = await read(claim);
    expect(observation.details).toMatchObject({
      sourceState: "stale",
      reason: "stale",
    });
    expect(observation.observedAt).toBe(at);
    expect(
      observatoryFreshness(
        observation.signals[0]!.observedAt,
        observation.signals[0]!.freshnessMs,
        "2026-10-16T13:00:00Z",
      ),
    ).toBe("stale");
  });
  it.each([
    "pending",
    "paused",
    "disabled",
    "unknown",
    "unreachable",
    "future",
    "no-observation",
    "unknown-check",
  ])(
    "keeps %s sources explicitly non-passing without invented measurement times",
    async (mode) => {
      const source = payload();
      if (
        mode === "pending" ||
        mode === "paused" ||
        mode === "unknown" ||
        mode === "unreachable"
      )
        source.monitor.status = mode;
      if (mode === "disabled") source.monitor.enabled = false;
      if (mode === "future") {
        source.monitor.lastCheckedAt = "2026-10-16T13:00:00Z";
        source.recentChecks[0]!.checkedAt = "2026-10-16T13:00:00Z";
      }
      if (mode === "no-observation") {
        source.monitor.lastCheckedAt = null;
        source.recentChecks = [];
      }
      if (mode === "unknown-check") source.recentChecks[0]!.status = "unknown";
      const observation = await reader(await bodyServer(source))(claim);
      expect(observation.signals).toEqual([]);
      expect(observation.details.sourceState).toBe(
        mode === "paused" || mode === "disabled" ? "disabled" : "unknown",
      );
      if (mode === "no-observation") expect(observation.observedAt).toBeNull();
    },
  );
  it("maps a degraded observation and selects the actual latest check regardless of response order", async () => {
    const source = payload("degraded");
    source.recentChecks.unshift({
      checkedAt: "2026-10-16T11:59:00Z",
      status: "down",
      responseTimeMs: null,
      statusCode: 503,
      error: "DO_NOT_DISCLOSE_OLD_ERROR",
    });
    const result = await reader(await bodyServer(source))(claim);
    expect(result.signals[0]?.state).toBe("degraded");
    expect(result.observedAt).toBe(at);
  });
  it("keeps constructor origin and key fixed and refuses monitor path/query/traversal injection", async () => {
    let received: string | undefined;
    const baseUrl = await server((request, response) => {
      received = request.headers.authorization;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payload()));
    });
    const options = {
      baseUrl,
      apiKey,
      allowLoopbackForTests: true,
      now: () => new Date(at),
    };
    const read = createInfraAgentAvailabilityReader(options);
    options.apiKey = "mutated-key";
    options.baseUrl = "https://unrelated.invalid";
    await read(claim);
    expect(received).toBe(`Bearer ${apiKey}`);
    for (const externalId of [
      "../other",
      "a/b",
      "a?key=x",
      "a#fragment",
      "%2e%2e",
      "https://unrelated.invalid",
      "a\\b",
      "a..b",
    ])
      await expect(read({ ...claim, externalId })).rejects.toMatchObject({
        code: "OPERATIONAL_INVALID_CLAIM",
      });
    await expect(
      read({ ...claim, kind: "github-repository" }),
    ).rejects.toMatchObject({ code: "OPERATIONAL_UNSUPPORTED_SOURCE" });
  });
  it("rejects insecure or non-origin construction without making a network request", () => {
    const fetcher = vi.fn();
    for (const baseUrl of [
      "http://127.0.0.1:1234",
      "http://public.invalid",
      "https://configured.invalid/path",
      "https://configured.invalid/?secret=1",
      "https://configured.invalid/#fragment",
      "https://user:password@configured.invalid",
      "ftp://configured.invalid",
      "not a url",
    ])
      expect(() =>
        createInfraAgentAvailabilityReader({ baseUrl, apiKey, fetch: fetcher }),
      ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(() =>
      createInfraAgentAvailabilityReader({
        baseUrl: "http://public.invalid",
        apiKey,
        allowLoopbackForTests: true,
        fetch: fetcher,
      }),
    ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(() =>
      createInfraAgentAvailabilityReader({
        baseUrl: "https://configured.invalid",
        apiKey: "bad\nkey",
        fetch: fetcher,
      }),
    ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never follows a redirect or forwards the read-only key to its destination", async () => {
    const targetRequests: string[] = [];
    const target = await server((request, response) => {
      targetRequests.push(request.headers.authorization ?? "none");
      response.end();
    });
    const baseUrl = await server((_request, response) => {
      response.writeHead(302, { location: `${target}/steal` });
      response.end();
    });
    const error = await reader(baseUrl)(claim).catch((error: unknown) => error);
    expect(error).toMatchObject({
      code: "OPERATIONAL_UNAVAILABLE",
      message: "OPERATIONAL_UNAVAILABLE",
    });
    expect(targetRequests).toEqual([]);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(baseUrl);
  });
  it.each([401, 403, 404, 429, 500])(
    "rejects HTTP %i with safe errors and bounded retry metadata",
    async (status) => {
      const baseUrl = await server((_request, response) => {
        response.writeHead(status, { "retry-after": "600" });
        response.end("DO_NOT_DISCLOSE_PROVIDER_BODY");
      });
      const error = await reader(baseUrl)(claim).catch(
        (error: unknown) => error,
      );
      expect(error).toMatchObject({
        code:
          status === 429
            ? "OPERATIONAL_RATE_LIMITED"
            : status === 404
              ? "OPERATIONAL_NOT_FOUND"
              : status === 401 || status === 403
                ? "OPERATIONAL_UNAUTHORIZED"
                : "OPERATIONAL_UNAVAILABLE",
        retrySeconds: 600,
      });
      expect(JSON.stringify(error)).not.toContain("DO_NOT_DISCLOSE");
      expect(JSON.stringify(error)).not.toContain(apiKey);
    },
  );
  it("honors HTTP-date Retry-After and bounds excessive or expired backoff", async () => {
    for (const [retry, expected] of [
      ["Fri, 16 Oct 2026 12:12:01 GMT", 600],
      ["999999999", 86400],
      ["9".repeat(400), 86400],
      ["0", 30],
      ["invalid", 60],
    ] as const) {
      const baseUrl = await server((_request, response) => {
        response.writeHead(429, { "retry-after": retry });
        response.end();
      });
      await expect(reader(baseUrl)(claim)).rejects.toMatchObject({
        code: "OPERATIONAL_RATE_LIMITED",
        retrySeconds: expected,
      });
    }
  });
  it.each(["headers", "body"])(
    "bounds the entire %s read with an actual timeout",
    async (mode) => {
      const baseUrl = await server((_request, response) => {
        if (mode === "body") {
          response.writeHead(200, { "content-type": "application/json" });
          response.flushHeaders();
          response.write('{"success":');
        }
      });
      await expect(reader(baseUrl, 30)(claim)).rejects.toMatchObject({
        code: "OPERATIONAL_TIMEOUT",
      });
    },
  );
  it.each([
    "malformed",
    "truncated",
    "oversized",
    "stream-oversized",
    "wrong-mime",
    "identity",
    "missing-checks",
    "inconsistent-time",
    "contradictory-status",
    "duplicate-check",
  ])("rejects %s without a successful empty read", async (mode) => {
    const source = payload();
    if (mode === "identity") source.monitor.id = "another-monitor";
    if (mode === "inconsistent-time")
      source.monitor.lastCheckedAt = "2026-10-16T12:01:00Z";
    if (mode === "contradictory-status") source.monitor.status = "down";
    if (mode === "duplicate-check")
      source.recentChecks.push(source.recentChecks[0]!);
    const baseUrl = await server((_request, response) => {
      response.setHeader(
        "content-type",
        mode === "wrong-mime" ? "text/html" : "application/json",
      );
      if (mode === "stream-oversized") {
        response.write("x".repeat(600000));
        response.end("x".repeat(600000));
      } else
        response.end(
          mode === "oversized"
            ? "x".repeat(1_048_577)
            : mode === "malformed"
              ? "not json"
              : mode === "truncated"
                ? '{"success":true'
                : mode === "missing-checks"
                  ? JSON.stringify({
                      success: true,
                      monitor: source.monitor,
                      openIncident: null,
                    })
                  : JSON.stringify(source),
        );
    });
    await expect(reader(baseUrl)(claim)).rejects.toMatchObject({
      code:
        mode === "oversized" || mode === "stream-oversized"
          ? "OPERATIONAL_RESPONSE_TOO_LARGE"
          : "OPERATIONAL_INVALID_RESPONSE",
    });
  });
  it("sanitizes network exceptions and arbitrary unknown status text", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error(`PRIVATE ${apiKey} https://private.invalid`);
    });
    await expect(
      createInfraAgentAvailabilityReader({
        baseUrl: "https://configured.invalid",
        apiKey,
        fetch: fetcher,
      })(claim),
    ).rejects.toMatchObject({ message: "OPERATIONAL_UNAVAILABLE" });
    const source = payload();
    source.monitor.status = "DO_NOT_DISCLOSE_STATUS";
    const result = await reader(await bodyServer(source))(claim);
    expect(result.details.monitorStatus).toBe("unknown");
    expect(JSON.stringify(result.details)).not.toContain("DO_NOT_DISCLOSE");
  });
});
