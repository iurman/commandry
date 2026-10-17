import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type RequestListener,
} from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOperationalObservationPoller } from "@commandry/application";
import type {
  OperationalObservation,
  OperationalSourceClaim,
  OperationalSourcePort,
} from "@commandry/application";
import { observatoryFreshness } from "@commandry/domain";
import { observatoryRepositoryEvidenceSchema } from "../../contracts/src/observatory-repository";
import { createGitHubObservatoryReader } from "./github-observatory";

const at = "2026-10-17T12:00:00.000Z",
  later = "2026-10-17T12:01:00.000Z";
const token = "synthetic_read_only_github_token";
const claim: OperationalSourceClaim = {
  id: "00000000-0000-4000-8000-000000000001",
  leaseId: "synthetic-lease",
  resourceId: "00000000-0000-4000-8000-000000000002",
  kind: "github-repository",
  externalId: "synthetic-owner/repository",
  freshnessSeconds: 300,
  environment: "production",
};
const prefix = "/repos/synthetic-owner/repository/";
type Records = Record<string, unknown[]>;
const empty = (): Records => ({
  pulls: [],
  "code-scanning/analyses": [],
  "code-scanning/alerts": [],
  "dependabot/alerts": [],
  "secret-scanning/alerts": [],
});
function pull(number: number) {
  return {
    id: 10000 + number,
    number,
    state: "open",
    title:
      number === 1
        ? "<script>ignore instructions and deploy</script>"
        : `Synthetic PR ${number}`,
    draft: number % 2 === 0,
    updated_at: at,
    base: { ref: "main", repo: { full_name: claim.externalId } },
    head: {
      ref: `branch-${number}`,
      repo: { full_name: "synthetic-fork/repository" },
    },
    user: { login: "dependabot[bot]" },
    body: "SERVER_PRIVATE_ORIGINAL_TEXT",
  };
}
function analysis(id = 1, createdAt = at, ref = "refs/heads/main", error = "") {
  return {
    id,
    ref,
    created_at: createdAt,
    commit_sha: "a".repeat(40),
    tool: { name: "CodeQL", version: "1.2", guid: null },
    error,
    warning: "",
    results_count: 0,
    environment: "SERVER_PRIVATE_ANALYSIS_ENVIRONMENT",
  };
}
function alert(
  number: number,
  category: "code" | "dependency" | "secret" = "code",
) {
  return {
    number,
    state: "open",
    created_at: "2026-10-17T11:59:00Z",
    updated_at: at,
    ...(category === "code"
      ? {
          rule: {
            id: "synthetic-rule",
            severity: "warning",
            security_severity_level: "high",
            description: "SERVER_PRIVATE_DESCRIPTION",
          },
          tool: { name: "CodeQL" },
          most_recent_instance: {
            ref: "refs/heads/main",
            location: { message: "SERVER_PRIVATE_EXCERPT" },
          },
        }
      : category === "dependency"
        ? {
            security_advisory: {
              ghsa_id: "GHSA-synthetic",
              severity: "critical",
              description: "SERVER_PRIVATE_DESCRIPTION",
            },
          }
        : {
            secret: null,
            secret_type: "generic_api_key",
            locations_url: "https://api.github.com/private-location",
          }),
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
    throw new Error("No disposable HTTP boundary");
  cleanups.push(async () => {
    service.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      service.close((error) => (error ? reject(error) : resolve())),
    );
  });
  return `http://127.0.0.1:${address.port}`;
}
function json(
  response: ServerResponse,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}
type Override = (
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  page: number,
) => boolean;
async function source(records: Records = empty(), override?: Override) {
  const requests: {
    url: string;
    method: string | undefined;
    authorization: string | undefined;
    accept: string | undefined;
    version: string | string[] | undefined;
  }[] = [];
  const baseUrl = await server((request, response) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const path = url.pathname.slice(prefix.length),
      page = Number(url.searchParams.get("page"));
    requests.push({
      url: url.href,
      method: request.method,
      authorization: request.headers.authorization,
      accept: request.headers.accept,
      version: request.headers["x-github-api-version"],
    });
    if (override?.(request, response, path, page)) return;
    const rows = records[path];
    if (!rows) {
      json(response, { message: "unsafe internal path" }, 404);
      return;
    }
    const next = new URL(url),
      last = new URL(url);
    next.searchParams.set("page", String(page + 1));
    last.searchParams.set("page", String(Math.ceil(rows.length / 100)));
    json(
      response,
      rows.slice((page - 1) * 100, page * 100),
      200,
      rows.length > page * 100
        ? { link: `<${next.href}>; rel="next", <${last.href}>; rel="last"` }
        : {},
    );
  });
  return { baseUrl, requests };
}
function reader(baseUrl: string, timeoutMs = 1000) {
  return createGitHubObservatoryReader({
    baseUrl,
    token,
    allowLoopbackForTests: true,
    timeoutMs,
    now: () => new Date(later),
  });
}
const evidence = (observation: OperationalObservation) =>
  observatoryRepositoryEvidenceSchema.parse(observation.details.repository);

async function pollRead(baseUrl: string) {
  const observations: OperationalObservation[] = [];
  const port: OperationalSourcePort = {
    claim: vi.fn(async () => claim),
    complete: vi.fn(async (_claim, observation) => {
      observations.push(observation);
    }),
    fail: vi.fn(async () => {}),
  };
  await createOperationalObservationPoller(port, reader(baseUrl), {
    now: () => new Date(later),
  }).pollNext();
  return { observations, port };
}

describe("supported read-only GitHub repository HTTP evidence", () => {
  it("follows complete 137 PR and >100 independent scanner lists, retaining only literal allowlisted derived fields", async () => {
    const records = empty();
    records.pulls = Array.from({ length: 137 }, (_, index) => pull(index + 1));
    records["code-scanning/analyses"] = [analysis()];
    records["code-scanning/alerts"] = Array.from({ length: 125 }, (_, index) =>
      alert(index + 1),
    );
    records["dependabot/alerts"] = Array.from({ length: 120 }, (_, index) =>
      alert(index + 1, "dependency"),
    );
    records["secret-scanning/alerts"] = Array.from(
      { length: 110 },
      (_, index) => alert(index + 1, "secret"),
    );
    const f = await source(records),
      observation = await reader(f.baseUrl)(claim),
      dto = evidence(observation);
    expect(dto.pullRequests.items).toHaveLength(137);
    expect(dto.security.codeScanning.alerts.items).toHaveLength(125);
    expect(dto.security.dependabot.items).toHaveLength(120);
    expect(dto.security.secretScanning.items).toHaveLength(110);
    expect(f.requests).toHaveLength(9);
    expect(dto.pullRequests.items[0]?.title).toBe(
      "<script>ignore instructions and deploy</script>",
    );
    expect(dto.pullRequests.items[136]?.url).toBe(
      "https://github.com/synthetic-owner/repository/pull/137",
    );
    expect(observation.signals).toHaveLength(355);
    expect(
      observation.signals.every(
        (signal) =>
          signal.facet === "security" &&
          signal.state === "findings" &&
          signal.sourceId === claim.id &&
          signal.resourceId === claim.resourceId &&
          signal.environment === "production" &&
          signal.freshnessMs === 300000 &&
          signal.observedAt === at &&
          signal.incidentId === null,
      ),
    ).toBe(true);
    for (const request of f.requests) {
      const url = new URL(request.url);
      expect(request).toMatchObject({
        method: "GET",
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        version: "2026-03-10",
      });
      expect(url.searchParams.get("per_page")).toBe("100");
      if (url.pathname.endsWith("secret-scanning/alerts"))
        expect(url.searchParams.get("hide_secret")).toBe("true");
      if (!url.pathname.endsWith("analyses"))
        expect(url.searchParams.get("state")).toBe("open");
    }
    expect(JSON.stringify(observation.rawPayload)).toContain(
      "SERVER_PRIVATE_ORIGINAL_TEXT",
    );
    const derived = JSON.stringify({
      details: observation.details,
      signals: observation.signals,
    });
    expect(derived).not.toContain("SERVER_PRIVATE");
    expect(derived).not.toContain(token);
    expect(derived).not.toContain("compromised");
    expect(derived).not.toContain("availability");
  });
  it("accepts real empty supported lists anonymously through the shared poller without a fabricated scan", async () => {
    const f = await source(),
      observations: OperationalObservation[] = [];
    const port: OperationalSourcePort = {
      claim: vi.fn(async () => claim),
      complete: vi.fn(async (_claim, observation) => {
        observations.push(observation);
      }),
      fail: vi.fn(async () => {}),
    };
    const read = createGitHubObservatoryReader({
      baseUrl: f.baseUrl,
      allowLoopbackForTests: true,
      now: () => new Date(later),
    });
    await createOperationalObservationPoller(port, read, {
      now: () => new Date(later),
    }).pollNext();
    expect(port.fail).not.toHaveBeenCalled();
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(
      f.requests.every((request) => request.authorization === undefined),
    ).toBe(true);
    const observation = observations[0]!;
    expect(observation.observedAt).toBeNull();
    expect(observation.signals).toEqual([]);
    const dto = evidence(observation);
    expect(dto.security.codeScanning.analyses).toMatchObject({
      state: "available",
      complete: true,
      items: [],
    });
    expect(dto.security.codeScanning.currentHeadCoverage).toBe("unknown");
    expect(observation.details).toMatchObject({
      sourceState: "unknown",
      reason: "no_observation",
    });
  });
  it("uses actual error-free analysis evidence and keeps stale/future/error/ref coverage explicit with stable signal identities", async () => {
    const records = empty();
    records["code-scanning/analyses"] = [
      analysis(1),
      analysis(2, "2026-09-01T00:00:00Z", "refs/heads/old"),
      analysis(3, at, "refs/heads/broken", "analysis failed"),
      { ...analysis(4, at, "refs/heads/unknown"), error: undefined },
      analysis(5, "2026-10-18T00:00:00Z", "refs/heads/future"),
      {
        ...analysis(6, at, "refs/heads/warnings"),
        warning: "incomplete language coverage",
      },
    ];
    const f = await source(records),
      read = reader(f.baseUrl);
    const first = await read(claim),
      second = await read(claim),
      dto = evidence(first);
    expect(
      dto.security.codeScanning.analyses.items.map((item) => [
        item.outcome,
        item.freshness,
      ]),
    ).toEqual([
      ["completed", "fresh"],
      ["completed", "stale"],
      ["error", "fresh"],
      ["unknown", "fresh"],
      ["completed", "future"],
      ["completed", "fresh"],
    ]);
    expect(dto.security.codeScanning.currentHeadCoverage).toBe("unknown");
    expect(first.signals.map((signal) => signal.state)).toEqual([
      "zero_findings",
      "zero_findings",
    ]);
    expect(first.signals.map((signal) => signal.observedAt)).toEqual([
      at,
      "2026-09-01T00:00:00.000Z",
    ]);
    expect(
      observatoryFreshness(first.signals[1]!.observedAt, 300000, later),
    ).toBe("stale");
    expect(first.observedAt).toBe(at);
    expect(first.signals).toEqual(second.signals);
    expect(JSON.stringify(first.details)).not.toContain("analysis failed");
  });
  it("keeps scanner failures independent and never interprets empty or inaccessible scanners as clean", async () => {
    const records = empty();
    records.pulls = [pull(1)];
    records["code-scanning/alerts"] = [alert(1)];
    const f = await source(records, (_request, response, path) => {
      const code =
        path === "code-scanning/analyses"
          ? 403
          : path === "dependabot/alerts"
            ? 401
            : path === "secret-scanning/alerts"
              ? 404
              : null;
      if (code === null) return false;
      json(response, { message: "PRIVATE_BODY_AND_SECRET" }, code);
      return true;
    });
    const result = await reader(f.baseUrl)(claim),
      dto = evidence(result);
    expect(dto.pullRequests.items).toHaveLength(1);
    expect(dto.security.codeScanning.alerts.items).toHaveLength(1);
    expect(dto.security.codeScanning.analyses).toMatchObject({
      state: "inaccessible",
      complete: false,
      errorCode: "OPERATIONAL_UNAUTHORIZED",
    });
    expect(dto.security.dependabot.state).toBe("inaccessible");
    expect(dto.security.secretScanning.state).toBe("disabled_or_not_found");
    expect(result.signals.map((signal) => signal.state)).toEqual(["findings"]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_BODY");
  });
  it("does not issue a zero-finding signal when the independent code alerts read fails", async () => {
    const records = empty();
    records.pulls = [pull(1)];
    records["code-scanning/analyses"] = [analysis()];
    records["dependabot/alerts"] = [alert(1, "dependency")];
    const f = await source(records, (_request, response, path) => {
      if (path !== "code-scanning/alerts") return false;
      json(response, {}, 503);
      return true;
    });
    const result = await reader(f.baseUrl)(claim),
      dto = evidence(result);
    expect(dto.security.codeScanning.analyses.complete).toBe(true);
    expect(dto.security.codeScanning.alerts.complete).toBe(false);
    expect(dto.pullRequests.items).toHaveLength(1);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.state).toBe("findings");
  });
  it("does not renew an older zero-finding scan when a newer analysis for that scanner/ref failed", async () => {
    const records = empty();
    records["code-scanning/analyses"] = [
      analysis(1, "2026-10-17T11:59:00Z"),
      analysis(2, at, "refs/heads/main", "failed analysis"),
    ];
    const result = await reader((await source(records)).baseUrl)(claim);
    expect(evidence(result).security.codeScanning.analyses.items).toHaveLength(
      2,
    );
    expect(result.signals).toEqual([]);
    expect(result.observedAt).toBeNull();
  });
  it.each([
    [401, {}, "OPERATIONAL_UNAUTHORIZED", 60],
    [403, {}, "OPERATIONAL_UNAUTHORIZED", 60],
    [404, {}, "OPERATIONAL_NOT_FOUND", 60],
    [429, { "retry-after": "123" }, "OPERATIONAL_RATE_LIMITED", 123],
    [
      403,
      { "x-ratelimit-remaining": "0", "retry-after": "1" },
      "OPERATIONAL_RATE_LIMITED",
      30,
    ],
    [429, { "retry-after": "999999999999" }, "OPERATIONAL_RATE_LIMITED", 86400],
    [
      429,
      { "retry-after": "Sat, 17 Oct 2026 12:03:00 GMT" },
      "OPERATIONAL_RATE_LIMITED",
      120,
    ],
    [500, { "retry-after": "bad-private-body" }, "OPERATIONAL_UNAVAILABLE", 60],
  ] as const)(
    "records safe HTTP %s failure and bounded Retry-After",
    async (status, headers, code, retry) => {
      const f = await source(empty(), (_request, response, path) => {
        if (path !== "secret-scanning/alerts") return false;
        json(
          response,
          { message: `DO_NOT_DISCLOSE ${token}` },
          status,
          headers,
        );
        return true;
      });
      const result = await reader(f.baseUrl)(claim),
        dto = evidence(result);
      expect(dto.security.secretScanning).toMatchObject({
        complete: false,
        items: [],
        errorCode: code,
        retrySeconds: retry,
      });
      expect(dto.pullRequests.complete).toBe(true);
      expect(JSON.stringify(result)).not.toContain("DO_NOT_DISCLOSE");
      expect(JSON.stringify(result)).not.toContain(token);
    },
  );
  it.each([
    "repeated",
    "external",
    "wrong-endpoint",
    "wrong-filter",
    "missing-filter",
    "skipped-page",
    "duplicate-next",
    "duplicate-page",
    "last-without-next",
    "userinfo",
    "fragment",
  ])(
    "fails %s continuation closed before unauthorized or incomplete fetch",
    async (mode) => {
      let targetRequests = 0;
      const external = await server((_request, response) => {
        targetRequests++;
        json(response, []);
      });
      const records = empty();
      records.pulls = Array.from({ length: 100 }, (_, index) =>
        pull(index + 1),
      );
      const f = await source(records, (request, response, path) => {
        if (path !== "pulls") return false;
        const next = new URL(request.url!, `http://${request.headers.host}`);
        next.searchParams.set("page", "2");
        if (mode === "repeated") next.searchParams.set("page", "1");
        if (mode === "external") next.host = new URL(external).host;
        if (mode === "wrong-endpoint")
          next.pathname = `${prefix}dependabot/alerts`;
        if (mode === "wrong-filter") next.searchParams.set("state", "closed");
        if (mode === "missing-filter") next.searchParams.delete("state");
        if (mode === "skipped-page") next.searchParams.set("page", "3");
        if (mode === "duplicate-page") next.searchParams.append("page", "2");
        if (mode === "userinfo") next.username = "attacker";
        if (mode === "fragment") next.hash = "hidden";
        const link = `<${next.href}>; rel="${mode === "last-without-next" ? "last" : "next"}"`;
        json(response, records.pulls, 200, {
          link: mode === "duplicate-next" ? `${link}, ${link}` : link,
        });
        return true;
      });
      const result = await reader(f.baseUrl)(claim),
        dto = evidence(result);
      expect(dto.pullRequests).toMatchObject({
        state: "unavailable",
        complete: false,
        items: [],
        errorCode: "OPERATIONAL_INVALID_RESPONSE",
      });
      expect(
        f.requests.filter((request) =>
          new URL(request.url).pathname.endsWith("pulls"),
        ),
      ).toHaveLength(1);
      expect(targetRequests).toBe(0);
      expect(
        (result.rawPayload as Record<string, unknown>).pullRequests,
      ).toBeNull();
    },
  );
  it("never forwards authorization on a real HTTP redirect", async () => {
    let forwarded = 0;
    const destination = await server((_request, response) => {
      forwarded++;
      json(response, []);
    });
    const f = await source(empty(), (_request, response, path) => {
      if (path !== "pulls") return false;
      response.writeHead(302, { location: destination });
      response.end();
      return true;
    });
    const dto = evidence(await reader(f.baseUrl)(claim));
    expect(forwarded).toBe(0);
    expect(dto.pullRequests.errorCode).toBe("OPERATIONAL_UNAVAILABLE");
    expect(dto.security.secretScanning.complete).toBe(true);
  });
  it.each([
    "malformed",
    "not-array",
    "bad-mime",
    "jsonp-mime",
    "mislabeled-json",
    "invalid-utf8",
    "large-length",
    "large-stream",
    "truncated",
    "header-timeout",
    "body-timeout",
  ])("bounds and isolates %s HTTP responses", async (mode) => {
    const f = await source(empty(), (_request, response, path) => {
      if (path !== "code-scanning/analyses") return false;
      if (mode === "header-timeout") return true;
      const headers =
        mode === "bad-mime"
          ? { "content-type": "text/html" }
          : mode === "jsonp-mime"
            ? { "content-type": "application/jsonp" }
            : mode === "mislabeled-json"
              ? { "content-type": "application/json; arbitrary=parameter" }
              : { "content-type": "application/json" };
      response.writeHead(200, {
        ...headers,
        ...(mode === "large-length" ? { "content-length": "2097153" } : {}),
      });
      if (mode === "body-timeout") {
        response.write("[");
        return true;
      }
      if (mode === "malformed" || mode === "truncated") response.end('[{"id":');
      else if (mode === "not-array") response.end("{}");
      else if (mode === "invalid-utf8") response.end(Buffer.from([0xff, 0xfe]));
      else if (mode === "large-stream") {
        response.write("[");
        response.end(" ".repeat(2_097_153));
      } else response.end("[]");
      return true;
    });
    const result = await reader(f.baseUrl, 150)(claim),
      dto = evidence(result);
    expect(dto.security.codeScanning.analyses.errorCode).toBe(
      mode.endsWith("timeout")
        ? "OPERATIONAL_TIMEOUT"
        : mode.startsWith("large")
          ? "OPERATIONAL_RESPONSE_TOO_LARGE"
          : "OPERATIONAL_INVALID_RESPONSE",
    );
    expect(dto.security.codeScanning.analyses.items).toEqual([]);
    expect(dto.security.dependabot.complete).toBe(true);
  });
  it.each([
    "duplicate-id",
    "duplicate-number",
    "foreign-base",
    "foreign-url",
    "closed-state",
    "invalid-date",
    "incomplete-page",
  ])(
    "rejects %s PR data without erasing valid scanner evidence",
    async (mode) => {
      const records = empty();
      const a = pull(1),
        b = pull(2);
      if (mode === "duplicate-id") b.id = a.id;
      if (mode === "duplicate-number") b.number = a.number;
      if (mode === "foreign-base") b.base.repo.full_name = "other/repository";
      if (mode === "foreign-url")
        Object.assign(b, { html_url: "https://attacker.invalid/instructions" });
      if (mode === "closed-state") b.state = "closed";
      if (mode === "invalid-date") b.updated_at = "2026-02-30T12:00:00Z";
      records.pulls = [a, b];
      records["secret-scanning/alerts"] = [alert(1, "secret")];
      const f = await source(records, (request, response, path) => {
        if (mode !== "incomplete-page" || path !== "pulls") return false;
        const next = new URL(request.url!, `http://${request.headers.host}`);
        next.searchParams.set("page", "2");
        json(response, [a], 200, { link: `<${next.href}>; rel="next"` });
        return true;
      });
      const result = await reader(f.baseUrl)(claim),
        dto = evidence(result);
      expect(dto.pullRequests.errorCode).toBe("OPERATIONAL_INVALID_RESPONSE");
      expect(dto.security.secretScanning.items).toHaveLength(1);
      expect(result.signals).toHaveLength(1);
    },
  );
  it("discards every secret-scanning page before capture when a later page contains a literal secret", async () => {
    const records = empty();
    records.pulls = [pull(1)];
    records["secret-scanning/alerts"] = Array.from(
      { length: 101 },
      (_, index) => alert(index + 1, "secret"),
    );
    Object.assign(records["secret-scanning/alerts"]![100]!, {
      secret: "UNEXPECTED_LITERAL_SECRET_DO_NOT_PERSIST",
    });
    const f = await source(records),
      result = await reader(f.baseUrl)(claim),
      dto = evidence(result);
    expect(dto.security.secretScanning).toMatchObject({
      state: "unavailable",
      complete: false,
      items: [],
      errorCode: "OPERATIONAL_INVALID_RESPONSE",
    });
    expect(dto.pullRequests.items).toHaveLength(1);
    expect(
      (result.rawPayload as Record<string, unknown>).secretScanning,
    ).toBeNull();
    expect(JSON.stringify(result)).not.toContain("UNEXPECTED_LITERAL");
    expect(result.signals).toEqual([]);
  });
  it.each([null, "", undefined])(
    "accepts secret field %s only when no literal was returned",
    async (value) => {
      const records = empty();
      records["secret-scanning/alerts"] = [
        { ...alert(1, "secret"), secret: value },
      ];
      const result = await reader((await source(records)).baseUrl)(claim);
      expect(evidence(result).security.secretScanning.complete).toBe(true);
      expect(result.signals[0]?.state).toBe("findings");
      expect(
        evidence(result).security.secretScanning.items[0],
      ).not.toHaveProperty("secret");
    },
  );
  it("fails token echoes closed without returning the configured credential in accepted originals", async () => {
    const records = empty();
    records.pulls = [{ ...pull(1), body: token }];
    const result = await reader((await source(records)).baseUrl)(claim);
    expect(evidence(result).pullRequests.errorCode).toBe(
      "OPERATIONAL_INVALID_RESPONSE",
    );
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it.each([
    "exact-token-key",
    "nested-containing-token-key",
    "secretLiteral-alias",
    "standard-secret-control",
  ])(
    "isolates %s before private capture through the actual shared poller",
    async (mode) => {
      const records = empty();
      records.pulls = [pull(1)];
      records["dependabot/alerts"] = [alert(1, "dependency")];
      records["secret-scanning/alerts"] = Array.from(
        { length: 101 },
        (_, index) => alert(index + 1, "secret"),
      );
      const unsafe = records["secret-scanning/alerts"]![100]!;
      if (mode === "exact-token-key")
        Object.assign(unsafe, { [token]: "untrusted metadata" });
      if (mode === "nested-containing-token-key")
        Object.assign(unsafe, {
          unknown_metadata: { [`prefix_${token}_suffix`]: null },
        });
      if (mode === "secretLiteral-alias")
        Object.assign(unsafe, { secretLiteral: "UNSAFE_LITERAL_MARKER" });
      if (mode === "standard-secret-control")
        Object.assign(unsafe, { secret: "UNSAFE_LITERAL_MARKER" });
      const f = await source(records),
        { observations, port } = await pollRead(f.baseUrl);
      expect(port.fail).not.toHaveBeenCalled();
      expect(port.complete).toHaveBeenCalledTimes(1);
      const observation = observations[0]!,
        dto = evidence(observation);
      expect(dto.security.secretScanning).toMatchObject({
        state: "unavailable",
        complete: false,
        items: [],
        errorCode: "OPERATIONAL_INVALID_RESPONSE",
      });
      expect(dto.pullRequests.items).toHaveLength(1);
      expect(dto.security.dependabot.items).toHaveLength(1);
      expect(observation.signals).toHaveLength(1);
      expect(observation.signals[0]).toMatchObject({
        state: "findings",
        observedAt: at,
        sourceId: claim.id,
        resourceId: claim.resourceId,
      });
      const raw = observation.rawPayload as Record<string, unknown>;
      expect(raw.secretScanning).toBeNull();
      expect(raw.pullRequests).toEqual([records.pulls]);
      expect(raw.dependabot).toEqual([records["dependabot/alerts"]]);
      expect(JSON.stringify(observation)).not.toContain(token);
      expect(JSON.stringify(observation)).not.toContain(
        "UNSAFE_LITERAL_MARKER",
      );
      expect(
        f.requests.filter((request) =>
          new URL(request.url).pathname.endsWith("secret-scanning/alerts"),
        ),
      ).toHaveLength(2);
    },
  );
  it.each([58, 59, 60, 61, 62, 70])(
    "keeps depth-%s private originals compatible with the shared poller without losing independent scanner evidence",
    async (depth) => {
      const records = empty();
      let nested: unknown = null;
      for (let index = 0; index < depth; index++) nested = { next: nested };
      records.pulls = [{ ...pull(1), unused_nested: nested }];
      records["secret-scanning/alerts"] = [alert(1, "secret")];
      const { observations, port } = await pollRead(
        (await source(records)).baseUrl,
      );
      expect(port.fail).not.toHaveBeenCalled();
      expect(port.complete).toHaveBeenCalledTimes(1);
      const observation = observations[0]!,
        dto = evidence(observation);
      expect(dto.security.secretScanning).toMatchObject({
        state: "available",
        complete: true,
      });
      expect(observation.signals).toHaveLength(1);
      expect(observation.signals[0]).toMatchObject({
        facet: "security",
        state: "findings",
        observedAt: at,
      });
      const raw = observation.rawPayload as Record<string, unknown>;
      expect(raw.secretScanning).toEqual([records["secret-scanning/alerts"]]);
      if (depth <= 60) {
        expect(dto.pullRequests).toMatchObject({
          state: "available",
          complete: true,
        });
        expect(raw.pullRequests).toEqual([records.pulls]);
      } else {
        expect(dto.pullRequests).toMatchObject({
          state: "unavailable",
          complete: false,
          items: [],
          errorCode: "OPERATIONAL_INVALID_RESPONSE",
        });
        expect(raw.pullRequests).toBeNull();
      }
    },
  );
  it("rejects traversal claims and unsupported origins without any network access", async () => {
    const f = await source(),
      read = reader(f.baseUrl);
    for (const externalId of [
      "../repository",
      "owner/..",
      "owner/.",
      "owner/repo/extra",
      "owner/repo?key=secret",
      "owner/repo#fragment",
      "owner/%2e%2e",
      "owner\\repo",
      "https://github.com/owner/repo",
      "owner//repo",
      "owner--invalid/repo",
    ])
      await expect(read({ ...claim, externalId })).rejects.toMatchObject({
        code: "OPERATIONAL_INVALID_CLAIM",
      });
    await expect(
      read({ ...claim, kind: "infraagent-monitor" }),
    ).rejects.toMatchObject({ code: "OPERATIONAL_UNSUPPORTED_SOURCE" });
    expect(f.requests).toEqual([]);
    const fetcher = vi.fn();
    for (const baseUrl of [
      "https://api.github.com",
      "https://public.invalid",
      "http://127.0.0.1:1234/path",
      "http://127.0.0.1:1234?token=secret",
      "http://user:password@127.0.0.1:1234",
      "http://127.0.0.1:1234#fragment",
      "http://127.0.0.2:1234",
    ])
      expect(() =>
        createGitHubObservatoryReader({
          baseUrl,
          token,
          fetch: fetcher,
          allowLoopbackForTests: true,
        }),
      ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(() =>
      createGitHubObservatoryReader({ baseUrl: f.baseUrl, fetch: fetcher }),
    ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(() =>
      createGitHubObservatoryReader({ timeoutMs: 10001, fetch: fetcher }),
    ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(() =>
      createGitHubObservatoryReader({
        token: "bad\ncredential",
        fetch: fetcher,
      }),
    ).toThrow("OPERATIONAL_CONFIGURATION_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("captures constructor credential/origin and rejects conflicting scanner identities independently", async () => {
    const records = empty();
    records["code-scanning/alerts"] = [
      { ...alert(1), repository: { full_name: "other/repo" } },
    ];
    records["dependabot/alerts"] = [
      alert(1, "dependency"),
      alert(1, "dependency"),
    ];
    records["secret-scanning/alerts"] = [alert(1, "secret")];
    const f = await source(records),
      options = {
        baseUrl: f.baseUrl,
        token,
        allowLoopbackForTests: true,
        now: () => new Date(later),
      },
      read = createGitHubObservatoryReader(options);
    options.token = "mutated_credential";
    options.baseUrl = "https://unrelated.invalid";
    const result = await read(claim),
      dto = evidence(result);
    expect(
      f.requests.every(
        (request) => request.authorization === `Bearer ${token}`,
      ),
    ).toBe(true);
    expect(dto.security.codeScanning.alerts.errorCode).toBe(
      "OPERATIONAL_INVALID_RESPONSE",
    );
    expect(dto.security.dependabot.errorCode).toBe(
      "OPERATIONAL_INVALID_RESPONSE",
    );
    expect(dto.security.secretScanning.complete).toBe(true);
    expect(result.signals).toHaveLength(1);
  });
});
