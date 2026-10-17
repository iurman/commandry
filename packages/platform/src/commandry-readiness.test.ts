import { createServer, type RequestListener } from "node:http";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OperationalSourceError,
  createOperationalObservationPoller,
  type OperationalObservation,
  type OperationalSourceClaim,
  type OperationalSourcePort,
} from "@commandry/application";
import { observatoryAvailabilityEvidenceSchema } from "@commandry/contracts";
import { createCommandryReadinessReader } from "./commandry-readiness";

const at = "2026-10-17T03:00:00.000Z";
const origin = "https://commandry.example";
const claim: OperationalSourceClaim = {
  id: "00000000-0000-4000-8000-000000000001",
  leaseId: "synthetic-readiness-lease",
  resourceId: "00000000-0000-4000-8000-000000000002",
  kind: "http-readiness",
  externalId: "commandry-web-readiness",
  freshnessSeconds: 300,
  environment: "production",
};
const ready = { status: "ready", service: "web", database: "ready" };
const notReady = {
  status: "not_ready",
  service: "web",
  database: "unavailable",
};
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function boundary(handler: RequestListener) {
  const service = createServer(handler);
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  const address = service.address();
  if (!address || typeof address === "string")
    throw new Error("Disposable readiness boundary unavailable");
  cleanups.push(async () => {
    service.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      service.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return `http://127.0.0.1:${address.port}`;
}
async function served(
  body: unknown = ready,
  status = 200,
  headers: Record<string, string> = {},
) {
  return boundary((_request, response) => {
    response.writeHead(status, {
      "content-type": "application/json",
      ...headers,
    });
    response.end(typeof body === "string" ? body : JSON.stringify(body));
  });
}
function read(appOrigin: string, timeoutMs = 500) {
  return createCommandryReadinessReader({
    appOrigin,
    timeoutMs,
    allowLoopbackForTests: true,
    now: () => new Date(at),
  });
}
function json(
  body: unknown = ready,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
async function safeFailure(result: Promise<unknown>, code: string) {
  const error: unknown = await result.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(OperationalSourceError);
  if (!(error instanceof OperationalSourceError))
    throw new Error("Expected a safe source failure");
  expect(error.code).toBe(code);
  expect(error.message).toBe(code);
  expect(Number.isInteger(error.retrySeconds)).toBe(true);
  expect(error.retrySeconds).toBeGreaterThanOrEqual(30);
  expect(error.retrySeconds).toBeLessThanOrEqual(86400);
  expect(JSON.stringify(error)).not.toMatch(/PRIVATE|secret|https?:\/\//);
  return error;
}

describe("fixed Commandry web/database readiness reader", () => {
  it("persists actual HTTP ready, not-ready and recovery checks through the shared poller without overwriting evidence on safe errors", async () => {
    let current: { status: number; body: unknown } = {
      status: 200,
      body: ready,
    };
    const requests: {
      method: string | undefined;
      path: string | undefined;
      authorization: string | undefined;
      accept: string | undefined;
    }[] = [];
    const appOrigin = await boundary((request, response) => {
      requests.push({
        method: request.method,
        path: request.url,
        authorization: request.headers.authorization,
        accept: request.headers.accept,
      });
      response.writeHead(current.status, {
        "content-type": "application/json",
      });
      response.end(
        typeof current.body === "string"
          ? current.body
          : JSON.stringify(current.body),
      );
    });
    let time = Date.parse(at);
    const observations: OperationalObservation[] = [];
    const port: OperationalSourcePort = {
      claim: vi.fn(async () => ({ ...claim })),
      complete: vi.fn(async (_leased, observation) => {
        observations.push(observation);
      }),
      fail: vi.fn(async () => {}),
    };
    const now = () => new Date(time);
    const reader = createCommandryReadinessReader({
      appOrigin,
      now,
      allowLoopbackForTests: true,
    });
    expect(requests).toHaveLength(0);
    const poller = createOperationalObservationPoller(port, reader, { now });
    await poller.pollNext();
    time += 1000;
    current = { status: 503, body: notReady };
    await poller.pollNext();
    time += 1000;
    current = { status: 200, body: ready };
    await poller.pollNext();
    time += 1000;
    current = {
      status: 401,
      body: { error: "PRIVATE credentials https://private.example" },
    };
    await poller.pollNext();
    time += 1000;
    current = { status: 200, body: "PRIVATE invalid original" };
    await poller.pollNext();
    expect(observations.map((item) => item.signals[0]?.state)).toEqual([
      "passing",
      "failing",
      "passing",
    ]);
    expect(observations.map((item) => item.observedAt)).toEqual([
      at,
      "2026-10-17T03:00:01.000Z",
      "2026-10-17T03:00:02.000Z",
    ]);
    expect(port.complete).toHaveBeenCalledTimes(3);
    expect(port.fail).toHaveBeenNthCalledWith(
      1,
      claim,
      "OPERATIONAL_UNAUTHORIZED",
      60,
    );
    expect(port.fail).toHaveBeenNthCalledWith(
      2,
      claim,
      "OPERATIONAL_INVALID_RESPONSE",
      60,
    );
    expect(requests).toHaveLength(5);
    for (const request of requests)
      expect(request).toEqual({
        method: "GET",
        path: "/health/ready",
        authorization: undefined,
        accept: "application/json",
      });
    for (const [index, observation] of observations.entries()) {
      expect(observation.rawPayload).toEqual(index === 1 ? notReady : ready);
      expect(
        observatoryAvailabilityEvidenceSchema.parse(observation.details),
      ).toEqual(observation.details);
      expect(observation.details).toMatchObject({
        monitorId: claim.externalId,
        enabled: true,
        sourceState: "available",
        reason: "observed",
        lastCheckedAt: observation.observedAt,
        latestCheck: {
          checkedAt: observation.observedAt,
          status: index === 1 ? "down" : "up",
          statusCode: index === 1 ? 503 : 200,
        },
        openIncident: null,
        recentChecksLimit: 25,
        historyComplete: false,
      });
      expect(observation.signals).toHaveLength(1);
      expect(observation.signals[0]).toMatchObject({
        resourceId: claim.resourceId,
        sourceId: claim.id,
        facet: "availability",
        environment: claim.environment,
        freshnessMs: 300000,
        incidentId: null,
        observedAt: observation.observedAt,
      });
      const details = observatoryAvailabilityEvidenceSchema.parse(
        observation.details,
      );
      expect(details.latestCheck?.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(observation)).not.toContain(appOrigin);
      expect(JSON.stringify(observation)).not.toContain("PRIVATE");
    }
    expect(observations[2]?.signals[0]?.id).not.toBe(
      observations[0]?.signals[0]?.id,
    );
  });

  it("performs no startup request and uses exactly the fixed no-store, unauthenticated GET boundary", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json());
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
      now: () => new Date(at),
    });
    expect(fetcher).not.toHaveBeenCalled();
    const observation = await reader(claim);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(origin + "/health/ready");
    expect(options).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    expect(Object.keys(options?.headers ?? {})).toEqual(["Accept"]);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(observation)).not.toContain(origin);
    expect(observation.rawPayload).toEqual(ready);
  });

  it("uses completion time after the entire validated body and a monotonic response duration", async () => {
    const now = vi
      .fn()
      .mockReturnValueOnce(new Date(at))
      .mockReturnValueOnce(new Date("2026-10-17T04:00:00.000Z"));
    vi.spyOn(performance, "now")
      .mockReturnValue(137.125)
      .mockReturnValueOnce(100);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
    });
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(stream, {
          headers: { "content-type": "application/json" },
        }),
    );
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
      now,
    });
    const pending = reader(claim);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(now).toHaveBeenCalledOnce();
    controller.enqueue(new TextEncoder().encode(JSON.stringify(ready)));
    controller.close();
    const observation = await pending;
    expect(now).toHaveBeenCalledTimes(2);
    expect(observation.observedAt).toBe("2026-10-17T04:00:00.000Z");
    expect(observation.details).toMatchObject({
      lastCheckedAt: observation.observedAt,
      latestCheck: {
        checkedAt: observation.observedAt,
        responseTimeMs: 37.125,
      },
    });
    expect(observation.rawPayload).toEqual(ready);
  });

  it("keeps check identity stable across lease retries, and distinguishes new completion time, source, resource and result", async () => {
    let time = at;
    let body: unknown = ready,
      status = 200;
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => json(body, status)),
      now: () => new Date(time),
    });
    const first = await reader(claim),
      retry = await reader({ ...claim, leaseId: "next-lease" });
    expect(first.signals[0]?.id).toMatch(/^commandry-readiness:[a-f0-9]{64}$/);
    expect(first.signals[0]?.id).toBe(retry.signals[0]?.id);
    expect(first.signals[0]?.evidenceRefs).toEqual([
      `source:${claim.id}`,
      first.signals[0]?.id,
    ]);
    const source = await reader({ ...claim, id: "other-source" });
    const resource = await reader({
      ...claim,
      resourceId: "00000000-0000-4000-8000-000000000003",
      environment: null,
      freshnessSeconds: 60,
    });
    expect(resource.signals[0]).toMatchObject({
      resourceId: "00000000-0000-4000-8000-000000000003",
      environment: null,
      freshnessMs: 60000,
    });
    status = 503;
    body = notReady;
    const down = await reader(claim);
    time = "2026-10-17T03:00:00.001Z";
    body = ready;
    status = 200;
    const later = await reader(claim);
    expect(
      new Set(
        [first, source, resource, down, later].map(
          (item) => item.signals[0]?.id,
        ),
      ).size,
    ).toBe(5);
  });

  it.each([
    ["http://remote.example", false],
    ["http://remote.example", true],
    ["http://localhost", false],
    ["https://owner:PRIVATE@example.test", false],
    ["https://@example.test", false],
    ["https://example.test/health/ready", false],
    ["https://example.test/./", false],
    ["https://example.test//", false],
    ["https://example.test?PRIVATE", false],
    ["https://example.test?", false],
    ["https://example.test#PRIVATE", false],
    ["https://example.test#", false],
    ["https://example.test\\private", false],
    [" https://example.test", false],
    ["https://example.test\n", false],
    ["ftp://example.test", false],
    ["not-an-origin", false],
    ["http://127.1", true],
    ["http://2130706433", true],
    ["http://127.0.0.2", true],
  ])(
    "rejects untrusted origin syntax %s without a startup request",
    (appOrigin, allowLoopbackForTests) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(() =>
        createCommandryReadinessReader({
          appOrigin,
          allowLoopbackForTests,
          fetch: fetcher,
        }),
      ).toThrowError("OPERATIONAL_CONFIGURATION_INVALID");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, 60001, NaN, Infinity])(
    "rejects invalid timeout %s before a request",
    (timeoutMs) => {
      const fetcher = vi.fn<typeof fetch>();
      expect(() =>
        createCommandryReadinessReader({
          appOrigin: origin,
          fetch: fetcher,
          timeoutMs,
        }),
      ).toThrowError("OPERATIONAL_CONFIGURATION_INVALID");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "permits explicit test HTTP only at %s",
    async (host) => {
      const fetcher = vi.fn<typeof fetch>(async () => json());
      const reader = createCommandryReadinessReader({
        appOrigin: `http://${host}:4321/`,
        allowLoopbackForTests: true,
        fetch: fetcher,
      });
      expect(fetcher).not.toHaveBeenCalled();
      await reader(claim);
      expect(fetcher.mock.calls[0]?.[0]).toBe(
        `http://${host}:4321/health/ready`,
      );
    },
  );

  it("uses the 10 second default deadline and accepts the strict timeout endpoints", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => json()),
    });
    await reader(claim);
    expect(timer.mock.calls.some(([, delay]) => delay === 10000)).toBe(true);
    for (const timeoutMs of [1, 60000])
      expect(() =>
        createCommandryReadinessReader({ appOrigin: origin, timeoutMs }),
      ).not.toThrow();
  });

  it("validates the shared claim and exact readiness identity before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json());
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
    });
    for (const [value, code] of [
      [{ ...claim, resourceId: "invalid" }, "OPERATIONAL_INVALID_CLAIM"],
      [{ ...claim, freshnessSeconds: NaN }, "OPERATIONAL_INVALID_CLAIM"],
      [
        { ...claim, kind: "github-repository" },
        "OPERATIONAL_UNSUPPORTED_SOURCE",
      ],
      [
        { ...claim, kind: "infraagent-monitor" },
        "OPERATIONAL_UNSUPPORTED_SOURCE",
      ],
      [{ ...claim, kind: "unknown" }, "OPERATIONAL_INVALID_CLAIM"],
      [
        { ...claim, externalId: "https://PRIVATE.example/health/ready" },
        "OPERATIONAL_INVALID_CLAIM",
      ],
      [
        { ...claim, externalId: "commandry-web-readiness?secret=PRIVATE" },
        "OPERATIONAL_INVALID_CLAIM",
      ],
      [{ ...claim, extra: "PRIVATE" }, "OPERATIONAL_INVALID_CLAIM"],
    ] as const)
      await safeFailure(reader(value as OperationalSourceClaim), code);
    const accessor = Object.defineProperty({ ...claim }, "environment", {
      get: () => {
        throw new Error("PRIVATE getter");
      },
      enumerable: true,
    });
    await safeFailure(reader(accessor), "OPERATIONAL_INVALID_CLAIM");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [200, notReady],
    [503, ready],
    [200, { ...ready, service: "worker" }],
    [200, { ...ready, database: "unavailable" }],
    [200, { ...ready, checkedAt: "2001-01-01T00:00:00Z" }],
    [503, { ...notReady, error: "PRIVATE" }],
    [200, null],
    [200, [ready]],
    [200, {}],
    [200, { status: "ready", service: "web" }],
  ])(
    "rejects an inconsistent or unsupported strict body at status %s",
    async (status, body) => {
      const appOrigin = await served(body, status);
      await safeFailure(read(appOrigin)(claim), "OPERATIONAL_INVALID_RESPONSE");
    },
  );

  it.each(["PRIVATE not-json", '{"status":', "", "true", '"ready"'])(
    "rejects malformed or nonobject JSON %s at an actual boundary",
    async (body) => {
      const appOrigin = await served(body);
      await safeFailure(read(appOrigin)(claim), "OPERATIONAL_INVALID_RESPONSE");
    },
  );

  it.each([
    [401, "OPERATIONAL_UNAUTHORIZED"],
    [403, "OPERATIONAL_UNAUTHORIZED"],
    [404, "OPERATIONAL_NOT_FOUND"],
    [429, "OPERATIONAL_RATE_LIMITED"],
    [500, "OPERATIONAL_UNAVAILABLE"],
  ] as const)(
    "classifies HTTP %s without persisting error body or a measurement",
    async (status, code) => {
      const appOrigin = await served(
        { error: "PRIVATE upstream credentials" },
        status,
        { "retry-after": "7" },
      );
      const error = await safeFailure(read(appOrigin)(claim), code);
      expect(error.retrySeconds).toBe(30);
    },
  );

  it.each([
    [
      "9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999",
      86400,
    ],
    ["86401", 86400],
    ["0", 30],
    ["PRIVATE malformed", 60],
    ["Sat, 17 Oct 2026 03:01:30 GMT", 90],
  ] as const)("bounds untrusted retry header %s", async (value, expected) => {
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () =>
        json({ PRIVATE: "not stored" }, 429, { "retry-after": value }),
      ),
      now: () => new Date(at),
    });
    const error = await safeFailure(reader(claim), "OPERATIONAL_RATE_LIMITED");
    expect(error.retrySeconds).toBe(expected);
  });

  it("does not follow actual redirects or probe a second path", async () => {
    let redirectedRequests = 0;
    const appOrigin = await boundary((request, response) => {
      if (request.url !== "/health/ready") redirectedRequests++;
      response.writeHead(302, { location: "/PRIVATE-secret" });
      response.end("PRIVATE redirect body");
    });
    await safeFailure(read(appOrigin)(claim), "OPERATIONAL_UNAVAILABLE");
    expect(redirectedRequests).toBe(0);
  });

  it.each(["redirected", "other-url", "extra-query"])(
    "rejects injected response identity %s and cancels its body",
    async (mode) => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      const response = new Response(body, {
        headers: { "content-type": "application/json" },
      });
      Object.defineProperty(
        response,
        mode === "redirected" ? "redirected" : "url",
        {
          value:
            mode === "redirected"
              ? true
              : mode === "other-url"
                ? "https://PRIVATE.example/health/ready"
                : origin + "/health/ready?secret=PRIVATE",
        },
      );
      const reader = createCommandryReadinessReader({
        appOrigin: origin,
        fetch: vi.fn<typeof fetch>(async () => response),
      });
      await safeFailure(reader(claim), "OPERATIONAL_INVALID_RESPONSE");
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("accepts a matching nonempty final URL without leaking the configured origin", async () => {
    const response = json();
    Object.defineProperty(response, "url", { value: origin + "/health/ready" });
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => response),
    });
    const result = await reader(claim);
    expect(result.signals[0]?.state).toBe("passing");
    expect(JSON.stringify(result)).not.toContain(origin);
  });

  it("permits exactly 4096 bytes but rejects a larger declared or streamed body", async () => {
    const exact = JSON.stringify(ready).padEnd(4096, " ");
    const appOrigin = await served(exact);
    expect((await read(appOrigin)(claim)).rawPayload).toEqual(ready);
    const streamed = await boundary((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write(" ".repeat(2048));
      response.end(" ".repeat(2049));
    });
    await safeFailure(read(streamed)(claim), "OPERATIONAL_RESPONSE_TOO_LARGE");
    const declared = await boundary((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": "4097",
      });
      response.flushHeaders();
    });
    await safeFailure(read(declared)(claim), "OPERATIONAL_RESPONSE_TOO_LARGE");
  });

  it("counts UTF-8 bytes, rejects invalid encoding and malformed content metadata", async () => {
    const oversized = await served(
      JSON.stringify({ value: "\u{1f642}".repeat(1100) }),
    );
    await safeFailure(read(oversized)(claim), "OPERATIONAL_RESPONSE_TOO_LARGE");
    const invalid = await boundary((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(Buffer.from([0xc3, 0x28]));
    });
    await safeFailure(read(invalid)(claim), "OPERATIONAL_INVALID_RESPONSE");
    for (const headers of [
      { "content-type": "text/html" },
      { "content-type": "application/json", "content-length": "bad" },
      { "content-type": "application/json", "content-length": "1" },
      {
        "content-type": "application/json",
        "content-length": "1",
        "content-encoding": "identity",
      },
    ]) {
      const reader = createCommandryReadinessReader({
        appOrigin: origin,
        fetch: vi.fn<typeof fetch>(
          async () => new Response(JSON.stringify(ready), { headers }),
        ),
      });
      await safeFailure(reader(claim), "OPERATIONAL_INVALID_RESPONSE");
    }
    const missing = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response(null, {
            headers: { "content-type": "application/json" },
          }),
      ),
    });
    await safeFailure(missing(claim), "OPERATIONAL_INVALID_RESPONSE");
  });

  it.each(["headers", "body"])(
    "bounds stalled actual HTTP %s and aborts the request",
    async (phase) => {
      const appOrigin = await boundary((_request, response) => {
        if (phase === "body") {
          response.writeHead(200, { "content-type": "application/json" });
          response.write("{");
        }
      });
      await safeFailure(read(appOrigin, 40)(claim), "OPERATIONAL_TIMEOUT");
    },
  );

  it("times out an injected fetch that ignores abort and discards its late response", async () => {
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((yes) => {
          resolve = yes;
        }),
    );
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
      timeoutMs: 25,
    });
    await safeFailure(reader(claim), "OPERATIONAL_TIMEOUT");
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    const cancel = vi.fn();
    resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it("bounds a body and cancellation promise that both ignore abort", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      cancel,
    });
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(stream, {
          headers: { "content-type": "application/json" },
        }),
    );
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
      timeoutMs: 25,
    });
    await safeFailure(reader(claim), "OPERATIONAL_TIMEOUT");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("withholds transport exception details and bounds cleanup failures", async () => {
    const transport = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => {
        throw new Error("PRIVATE transport https://secret.example");
      }),
    });
    await safeFailure(transport(claim), "OPERATIONAL_UNAVAILABLE");
    const cancel = vi.fn(async () => {
      throw new Error("PRIVATE cancel");
    });
    const body = new ReadableStream<Uint8Array>({ cancel });
    const response = new Response(body, { status: 401 });
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => response),
    });
    await safeFailure(reader(claim), "OPERATIONAL_UNAUTHORIZED");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects an explicit null timeout rather than treating it as the default", () => {
    expect(() =>
      createCommandryReadinessReader({
        appOrigin: origin,
        timeoutMs: null as unknown as number,
      }),
    ).toThrowError("OPERATIONAL_CONFIGURATION_INVALID");
  });

  it("withholds a late check even if a blocked event loop delayed the abort timer", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(151);
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      timeoutMs: 50,
      fetch: vi.fn<typeof fetch>(async () => json()),
    });
    await safeFailure(reader(claim), "OPERATIONAL_TIMEOUT");
  });

  it("reconstructs allowlisted transport errors without retaining mutated messages or private properties", async () => {
    const upstream = Object.assign(
      new OperationalSourceError("OPERATIONAL_UNAVAILABLE", 1),
      {
        message: "PRIVATE transport credentials",
        privateOrigin: "https://secret.example",
      },
    );
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => {
        throw upstream;
      }),
    });
    const error = await safeFailure(reader(claim), "OPERATIONAL_UNAVAILABLE");
    expect(error).not.toBe(upstream);
    expect(error).not.toHaveProperty("privateOrigin");
  });

  if (process.env.COMMANDRY_READINESS_RR1_CHILD === "1") {
    it("RR1 infinite empty stream probe", async () => {
      const cancel = vi.fn();
      let pulls = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls++;
          controller.enqueue(new Uint8Array());
        },
        cancel,
      });
      const reader = createCommandryReadinessReader({
        appOrigin: origin,
        timeoutMs: 25,
        fetch: vi.fn<typeof fetch>(
          async () =>
            new Response(body, {
              headers: { "content-type": "application/json" },
            }),
        ),
      });
      process.stdout.write("RR1_READY\n");
      const started = performance.now();
      await safeFailure(reader(claim), "OPERATIONAL_TIMEOUT");
      expect(cancel).toHaveBeenCalledOnce();
      process.stdout.write(
        `RR1_CANCELLED ${JSON.stringify({ elapsedMs: performance.now() - started, pulls })}\n`,
      );
    });
  } else {
    it("bounds an infinite empty stream with an independent watchdog", async () => {
      const result = await new Promise<{
        code: number | null;
        watchdog: boolean;
        output: string;
      }>((resolve, reject) => {
        const child = spawn(
          "pnpm",
          [
            "exec",
            "vitest",
            "run",
            "--config",
            "vitest.config.mts",
            "packages/platform/src/commandry-readiness.test.ts",
            "--testNamePattern",
            "RR1 infinite empty stream probe",
          ],
          {
            env: { ...process.env, COMMANDRY_READINESS_RR1_CHILD: "1" },
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let ready = false,
          watchdog = false,
          output = "";
        const kill = () => {
          watchdog = true;
          try {
            if (process.platform !== "win32" && child.pid)
              process.kill(-child.pid, "SIGKILL");
            else child.kill("SIGKILL");
          } catch {
            // The isolated child may already have exited.
          }
        };
        let timer = setTimeout(kill, 10000);
        const capture = (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-16000);
          if (!ready && output.includes("RR1_READY")) {
            ready = true;
            clearTimeout(timer);
            timer = setTimeout(kill, 500);
          }
        };
        child.stdout.on("data", capture);
        child.stderr.on("data", capture);
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve({ code, watchdog, output });
        });
      });
      expect(result.watchdog, result.output).toBe(false);
      expect(result.code, result.output).toBe(0);
      expect(result.output).toContain("RR1_CANCELLED");
    }, 15000);
  }

  it("does not retain empty chunks while accepting a finite body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (++pulls <= 128) controller.enqueue(new Uint8Array());
        else {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(ready)));
          controller.close();
        }
      },
    });
    const response = new Response(body, {
      headers: { "content-type": "application/json" },
    });
    const concat = vi.spyOn(Buffer, "concat");
    const reader = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: vi.fn<typeof fetch>(async () => response),
    });
    expect((await reader(claim)).rawPayload).toEqual(ready);
    expect(concat).toHaveBeenCalledOnce();
    expect(concat.mock.calls[0]![0]).toHaveLength(1);
    expect(concat.mock.calls[0]![0][0]?.byteLength).toBe(
      JSON.stringify(ready).length,
    );
  });

  it.each([NaN, -1])(
    "checks finite nonnegative monotonic elapsed time after an immediate read (%s)",
    async (value) => {
      const clock = vi.spyOn(performance, "now").mockReturnValue(100);
      const cancel = vi.fn();
      let pulled = false;
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            if (pulled) return;
            pulled = true;
            clock.mockReturnValue(value === -1 ? 99 : value);
            controller.enqueue(new Uint8Array());
          },
          cancel,
        },
        { highWaterMark: 0 },
      );
      const reader = createCommandryReadinessReader({
        appOrigin: origin,
        timeoutMs: 25,
        fetch: vi.fn<typeof fetch>(
          async () =>
            new Response(body, {
              headers: { "content-type": "application/json" },
            }),
        ),
      });
      await safeFailure(reader(claim), "OPERATIONAL_CONFIGURATION_INVALID");
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it("rejects invalid and backwards local clocks without a passing measurement", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json());
    const invalidStart = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
      now: () => new Date(NaN),
    });
    await safeFailure(invalidStart(claim), "OPERATIONAL_CONFIGURATION_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
    const throwing = createCommandryReadinessReader({
      appOrigin: origin,
      fetch: fetcher,
      now: () => {
        throw new Error("PRIVATE clock");
      },
    });
    await safeFailure(throwing(claim), "OPERATIONAL_CONFIGURATION_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
    for (const finished of [
      new Date(NaN),
      new Date("2026-10-17T02:59:59.999Z"),
    ]) {
      const now = vi
        .fn()
        .mockReturnValueOnce(new Date(at))
        .mockReturnValueOnce(finished);
      const reader = createCommandryReadinessReader({
        appOrigin: origin,
        fetch: fetcher,
        now,
      });
      await safeFailure(reader(claim), "OPERATIONAL_CONFIGURATION_INVALID");
    }
  });
});
