import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createObservatoryReadService } from "../packages/application/src/observatory.ts";
import {
  infrastructureOverviewQuerySchema,
  infrastructureOverviewSchema,
  infrastructureResourceSchema,
  versionResponseSchema,
} from "../packages/contracts/src/index.ts";
import {
  operationalObservatoryFixture,
  observatoryFixtureTime,
} from "../packages/test-support/src/observatory.ts";

const MAX_BODY = 32768;
const MAX_BACKEND_BODY = 16 * 1024 * 1024;
const shaPattern = /^[a-f0-9]{40}$/;
const pages = new Set(["/infrastructure", "/infrastructure/wallboard"]);
const apiBase = "/api/v1/infrastructure/observatory/";
const readMethods = new Map([
  ["scene", "scene"],
  ["members", "members"],
  ["relations", "relations"],
  ["signals", "signalEvidence"],
  ["providers", "providerExplanation"],
  ["operational", "operationalEvidence"],
  ["catalogue", "catalogue"],
  ["provider-feed", "providerFeed"],
]);
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

class PreviewError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const invalid = (message = "Invalid synthetic review request.") =>
  new PreviewError(400, message);

function loopbackOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalid("Preview must use an explicit loopback origin.");
  }
  if (
    typeof value !== "string" ||
    value !== url.origin ||
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password
  )
    throw invalid("Preview must use an explicit loopback origin.");
  return url.origin;
}

function validatePair(receipt, credential) {
  if (
    !receipt ||
    typeof receipt !== "object" ||
    !credential ||
    typeof credential !== "object" ||
    receipt.schema !== "disposable PostgreSQL18" ||
    receipt.externalPolling !== false ||
    receipt.runtimeAssets !==
      "Private copy of the built Next standalone output" ||
    !shaPattern.test(receipt.sourceSha ?? "")
  )
    throw invalid("A disposable private-build receipt is required.");
  const origin = loopbackOrigin(receipt.origin);
  if (
    credential.origin !== origin ||
    (credential.sourceSha !== undefined &&
      credential.sourceSha !== receipt.sourceSha) ||
    typeof credential.email !== "string" ||
    !credential.email.length ||
    credential.email.length > 320 ||
    typeof credential.password !== "string" ||
    !credential.password.length ||
    credential.password.length > 4096
  )
    throw invalid(
      "The supplied preview receipt and credential pair do not match.",
    );
  return { origin, sourceSha: receipt.sourceSha };
}

async function boundedResponse(response, maximum) {
  if (Number(response.headers.get("content-length")) > maximum) {
    await response.body?.cancel();
    throw new PreviewError(
      502,
      "Owned preview response exceeded its size limit.",
    );
  }
  const chunks = [];
  let size = 0;
  if (response.body)
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maximum)
        throw new PreviewError(
          502,
          "Owned preview response exceeded its size limit.",
        );
      chunks.push(chunk);
    }
  return Buffer.concat(chunks);
}

function retainReviewInFullscreen() {
  const document = globalThis.document;
  const review = document.getElementById("synthetic-local-review");
  if (!review) return;
  const home = document.createComment("synthetic-local-review-home");
  review.after(home);
  const normalStyle = review.getAttribute("style");
  let active = null;
  let activeStyle = null;
  let normalPadding = 0;
  let observer = null;
  const reserve = () => {
    if (!active) return;
    const height = Math.ceil(review.getBoundingClientRect().height);
    const padding = normalPadding + Math.max(0, height);
    const value = padding + "px";
    if (active.style.paddingTop !== value) active.style.paddingTop = value;
  };
  const release = () => {
    observer?.disconnect();
    observer = null;
    globalThis.removeEventListener("resize", reserve);
    if (active) {
      if (activeStyle === null) active.removeAttribute("style");
      else active.setAttribute("style", activeStyle);
      active = null;
    }
  };
  const sync = () => {
    const fullscreen = document.fullscreenElement;
    if (fullscreen && !review.contains(fullscreen)) {
      if (active !== fullscreen) {
        release();
        active = fullscreen;
        activeStyle = fullscreen.getAttribute("style");
        normalPadding =
          Number.parseFloat(
            globalThis.getComputedStyle(fullscreen).paddingTop,
          ) || 0;
        fullscreen.style.boxSizing = "border-box";
        globalThis.addEventListener("resize", reserve);
      }
      if (!fullscreen.contains(review)) fullscreen.prepend(review);
      review.style.position = "fixed";
      review.style.inset = "0 0 auto 0";
      reserve();
      if (!observer && typeof globalThis.ResizeObserver === "function") {
        observer = new globalThis.ResizeObserver(reserve);
        observer.observe(review);
      }
    } else {
      release();
      if (home.parentNode) home.parentNode.insertBefore(review, home);
      else document.body.prepend(review);
      if (normalStyle === null) review.removeAttribute("style");
      else review.setAttribute("style", normalStyle);
    }
  };
  document.addEventListener("fullscreenchange", sync);
  sync();
}

function banner(sourceSha) {
  return (
    '<aside id="synthetic-local-review" role="note" style="position:sticky;top:0;z-index:2147483647;padding:10px 16px;background:#fff4ce;color:#171717;border-bottom:2px solid #171717;font:14px/1.5 system-ui">' +
    "<strong>SYNTHETIC LOCAL REVIEW</strong> | Source SHA: " +
    sourceSha +
    " | Fixture clock: " +
    observatoryFixtureTime +
    ". Synthetic recorded evidence only; no live ingestion. Operational sources, Work records, private views and the public provider feed are unavailable. Provider exposures are fixture mappings, not confirmation of a local outage.</aside>"
  );
}

function injectBanner(html, sourceSha) {
  if (!/<body\b[^>]*>/i.test(html))
    throw new PreviewError(
      502,
      "Owned preview did not return the built HTML page.",
    );
  return html.replace(
    /<body\b[^>]*>/i,
    (body) =>
      body +
      banner(sourceSha) +
      "<script>(" +
      retainReviewInFullscreen.toString() +
      ")();</script>",
  );
}

function requestPath(raw, origin) {
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    raw.includes("#")
  )
    throw invalid();
  const path = raw.split("?")[0];
  if (
    path.includes("%") ||
    path.includes("//") ||
    path.split("/").some((part) => part === "." || part === "..")
  )
    throw invalid("Encoded or traversing paths are unavailable.");
  const url = new URL(raw, origin);
  if (url.origin !== origin) throw invalid();
  return url;
}

function queryFields(url, allowed) {
  const fields = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(fields, key)) throw invalid();
    fields[key] = value;
  }
  return fields;
}

function pageAfter(items, cursor, limit) {
  const index = cursor ? items.findIndex((item) => item.id === cursor) : -1;
  if (cursor && index < 0) throw invalid("Unknown fixture continuation.");
  const page = items.slice(index + 1, index + 1 + limit);
  return {
    items: page,
    nextCursor: index + 1 + page.length < items.length ? page.at(-1).id : null,
  };
}

async function jsonBody(request) {
  if (
    !/^application\/json(?:;\s*charset=utf-8)?$/i.test(
      request.headers["content-type"] ?? "",
    )
  )
    throw new PreviewError(415, "Read commands require application/json.");
  if (Number(request.headers["content-length"]) > MAX_BODY)
    throw new PreviewError(413, "Read command body exceeded its size limit.");
  const buffer = await new Promise((done, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    request.on("data", (chunk) => {
      if (exceeded) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        exceeded = true;
        reject(
          new PreviewError(413, "Read command body exceeded its size limit."),
        );
      } else chunks.push(chunk);
    });
    request.once("end", () => {
      if (!exceeded) done(Buffer.concat(chunks));
    });
    request.once("error", () => reject(invalid("Incomplete read command.")));
    request.once("aborted", () => reject(invalid("Incomplete read command.")));
  });
  try {
    const value = JSON.parse(buffer.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw invalid();
    return value;
  } catch {
    throw invalid("Malformed read command.");
  }
}

/** Import-safe: only this explicit call authenticates or starts a task-owned server. */
export async function createUsabilityPreview({
  receipt,
  credential,
  port = 0,
  deadlineMs = 5000,
}) {
  const backend = validatePair(receipt, credential);
  if (
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535 ||
    !Number.isInteger(deadlineMs) ||
    deadlineMs < 1 ||
    deadlineMs > 30000
  )
    throw invalid("Invalid local review port or deadline.");
  let cookie = "";
  const backendRead = async (
    path,
    options = {},
    maximum = MAX_BACKEND_BODY,
  ) => {
    let response;
    try {
      response = await fetch(backend.origin + path, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(deadlineMs),
      });
    } catch {
      throw new PreviewError(502, "Owned preview request failed.");
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new PreviewError(502, "Owned preview redirects are unavailable.");
    }
    const body = await boundedResponse(response, maximum);
    return { response, body };
  };
  const version = await backendRead("/version", {}, 16384);
  let attestation;
  try {
    attestation = versionResponseSchema.parse(
      JSON.parse(version.body.toString("utf8")),
    );
  } catch {
    throw invalid("Owned preview source attestation is invalid.");
  }
  if (
    version.response.status !== 200 ||
    attestation.sha !== backend.sourceSha ||
    attestation.environment !== "test"
  )
    throw invalid(
      "Owned preview source or environment does not match the receipt.",
    );

  const login = await backendRead(
    "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { origin: backend.origin, "content-type": "application/json" },
      body: JSON.stringify({
        email: credential.email,
        password: credential.password,
      }),
    },
    16384,
  );
  if (login.response.status !== 200)
    throw new PreviewError(502, "Disposable owner sign-in failed.");
  cookie = login.response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  if (!cookie || cookie.length > 16384 || /[\r\n]/.test(cookie))
    throw new PreviewError(502, "Disposable session unavailable.");

  const fixture = operationalObservatoryFixture();
  const resourceRows = fixture.resources
    .map((item) =>
      infrastructureResourceSchema
        .strict()
        .parse({ ...item, health: "unknown" }),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const projectRows = fixture.projects
    .map((item) => ({
      ...item,
      summary: "Synthetic operational fixture. No live records.",
      type: "project",
      lifecycle: "active",
      version: 1,
      domain: null,
      createdAt: observatoryFixtureTime,
      updatedAt: observatoryFixtureTime,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const fixtureRequest = Object.freeze({ syntheticLocalReview: true });
  const access = Object.freeze({
    owner: true,
    projectIds: fixture.projects.map((item) => item.id),
    resourceIds: null,
    scopeDigest: "synthetic:owner:operational-review",
    operations: [],
    environment: "test",
  });
  const service = createObservatoryReadService(
    {
      async withRead(request, read) {
        if (request !== fixtureRequest) throw invalid();
        return read(access, { readObservatory: async () => fixture });
      },
    },
    { environment: "test", now: () => new Date(fixture.now) },
  );

  let origin;
  const server = createServer(async (request, response) => {
    const send = (
      status,
      body,
      contentType = "application/json; charset=utf-8",
    ) => {
      response.writeHead(status, {
        "content-type": contentType,
        "cache-control": "no-store",
        "content-security-policy": csp,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "cross-origin-resource-policy": "same-origin",
        "x-commandry-review": "synthetic-local",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    };
    try {
      if (
        request.rawHeaders.filter(
          (value, index) => index % 2 === 0 && value.toLowerCase() === "host",
        ).length !== 1 ||
        request.headers.host !== new URL(origin).host ||
        (request.headers.origin !== undefined &&
          request.headers.origin !== origin) ||
        (request.headers["sec-fetch-site"] !== undefined &&
          !["same-origin", "none"].includes(request.headers["sec-fetch-site"]))
      )
        throw new PreviewError(
          403,
          "Cross-origin review requests are unavailable.",
        );
      const url = requestPath(request.url, origin);
      const path = url.pathname;
      const method = request.method;
      if (path === "/api/v1/projects" && method === "GET") {
        const fields = queryFields(url, ["limit", "cursor"]);
        if (fields.limit !== undefined && !/^[1-9]\d*$/.test(fields.limit))
          throw invalid();
        const limit = Number(fields.limit ?? 20);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
          throw invalid();
        if (fields.cursor !== undefined)
          infrastructureResourceSchema.shape.id.parse(fields.cursor);
        send(200, JSON.stringify(pageAfter(projectRows, fields.cursor, limit)));
        return;
      }
      if (path === "/api/v1/infrastructure/overview" && method === "GET") {
        const query = infrastructureOverviewQuerySchema
          .strict()
          .parse(queryFields(url, ["limit", "cursor", "projectId", "q"]));
        const population = resourceRows.filter(
          (item) =>
            (!query.projectId ||
              item.projects.some((p) => p.id === query.projectId)) &&
            (!query.q ||
              item.name.toLowerCase().includes(query.q.toLowerCase())),
        );
        const page = pageAfter(population, query.cursor, query.limit);
        send(
          200,
          JSON.stringify(
            infrastructureOverviewSchema.strict().parse({
              ...page,
              readAt: fixture.now,
              total: population.length,
              edges: population
                .filter((item) => item.parentResourceId)
                .map((item) => ({
                  id: "fixture:contains:" + item.id,
                  from: item.parentResourceId,
                  to: item.id,
                  type: "contains",
                })),
              events: [],
            }),
          ),
        );
        return;
      }
      if (
        path.startsWith(apiBase) &&
        readMethods.has(path.slice(apiBase.length)) &&
        method === "POST"
      ) {
        if (url.search) throw invalid();
        const input = await jsonBody(request);
        const value = await service[
          readMethods.get(path.slice(apiBase.length))
        ](fixtureRequest, input);
        send(200, JSON.stringify(value));
        return;
      }
      const asset =
        /^\/_next\/static\/[A-Za-z0-9._~/-]+$/.test(path) ||
        path === "/favicon.ico";
      if ((pages.has(path) || asset) && ["GET", "HEAD"].includes(method)) {
        if (pages.has(path))
          infrastructureOverviewQuerySchema
            .pick({ projectId: true, q: true })
            .strict()
            .parse(queryFields(url, ["projectId", "q"]));
        else if (request.url.includes("?")) throw invalid();
        // Preserve the validated public scope without changing the fixed target.
        const result = await backendRead(path + url.search, {
          method,
          headers: {
            cookie,
            accept: pages.has(path) ? "text/html" : "*/*",
            "accept-encoding": "identity",
          },
        });
        if (result.response.status !== 200)
          throw new PreviewError(
            502,
            "Owned built page or asset is unavailable.",
          );
        const type =
          result.response.headers.get("content-type") ??
          "application/octet-stream";
        if (asset && type.toLowerCase().startsWith("text/html"))
          throw new PreviewError(
            502,
            "HTML assets are unavailable in synthetic review.",
          );
        if (pages.has(path) && !type.toLowerCase().startsWith("text/html"))
          throw new PreviewError(502, "Owned preview did not return HTML.");
        const body =
          pages.has(path) && method !== "HEAD"
            ? injectBanner(result.body.toString("utf8"), backend.sourceSha)
            : result.body;
        send(200, body, type);
        return;
      }
      throw new PreviewError(
        403,
        "This route is unavailable in read-only synthetic review.",
      );
    } catch (error) {
      const status =
        error instanceof PreviewError
          ? error.status
          : error?.name === "ZodError" || error?.code === "INVALID_REFERENCE"
            ? 400
            : 503;
      const message =
        error instanceof PreviewError
          ? error.message
          : status === 400
            ? "Invalid strict fixture read or continuation."
            : "This fixture read is unavailable. No live data was requested.";
      if (!response.headersSent) send(status, JSON.stringify({ message }));
      else response.end();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 40;
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", done);
  });
  origin = "http://127.0.0.1:" + server.address().port;
  return {
    origin,
    url: origin + "/infrastructure",
    sourceSha: backend.sourceSha,
    fixtureClock: observatoryFixtureTime,
    close: async () => {
      cookie = "";
      server.closeIdleConnections();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}

export async function loadPreviewPair(previewDirectory) {
  if (typeof previewDirectory !== "string" || !previewDirectory.length)
    throw invalid("--preview-dir is required.");
  let receipt, credential;
  try {
    [receipt, credential] = await Promise.all([
      readFile(join(resolve(previewDirectory), "receipt.json"), "utf8").then(
        JSON.parse,
      ),
      readFile(
        join(resolve(previewDirectory), "credentials.json"),
        "utf8",
      ).then(JSON.parse),
    ]);
  } catch {
    throw invalid(
      "Unable to read the explicitly supplied preview receipt pair.",
    );
  }
  validatePair(receipt, credential);
  return { receipt, credential };
}

export function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (
      !["--preview-dir", "--port"].includes(name) ||
      value === undefined ||
      Object.hasOwn(options, name)
    )
      throw invalid("Use --preview-dir PATH and optional --port NUMBER.");
    options[name] = value;
  }
  if (
    !options["--preview-dir"] ||
    (options["--port"] !== undefined && !/^\d+$/.test(options["--port"]))
  )
    throw invalid("Use --preview-dir PATH and optional --port NUMBER.");
  return {
    previewDirectory: options["--preview-dir"],
    port: Number(options["--port"] ?? 0),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const pair = await loadPreviewPair(args.previewDirectory);
    const preview = await createUsabilityPreview({ ...pair, port: args.port });
    console.log(
      JSON.stringify({
        review: "SYNTHETIC LOCAL REVIEW",
        ...preview,
        close: undefined,
        limits:
          "Synthetic recorded evidence; no operational ingestion, Work, private views or public provider feed.",
      }),
    );
    await new Promise((done) => {
      const stop = async () => {
        process.removeListener("SIGINT", stop);
        process.removeListener("SIGTERM", stop);
        await preview.close();
        done();
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
  } catch (error) {
    console.error(
      error instanceof PreviewError
        ? error.message
        : "Synthetic local review startup failed.",
    );
    process.exitCode = 1;
  }
}
