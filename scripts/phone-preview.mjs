import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const credentialPath = path.join(
  repositoryRoot,
  ".agent",
  "phone-preview-credential",
);
const username = "review";
const maximumBodyBytes = 1024 * 1024;
const removedRequestHeaders = new Set([
  "authorization",
  "connection",
  "forwarded",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
]);
const removedResponseHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function sendPlain(response, status, message, extra = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  });
  response.end(message);
}

function hasCredential(header, credential) {
  const match = /^Basic ([A-Za-z0-9+/=]+)$/.exec(header ?? "");
  if (!match) return false;
  const received = createHash("sha256")
    .update(Buffer.from(match[1], "base64"))
    .digest();
  const expected = createHash("sha256")
    .update(`${username}:${credential}`)
    .digest();
  return timingSafeEqual(received, expected);
}

function permittedPath(rawUrl) {
  if (!rawUrl?.startsWith("/") || rawUrl.startsWith("//")) return false;
  const rawPath = rawUrl.split("?", 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return false;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.split("/").includes("..")
  )
    return false;
  if (/^\/(?:auth|health|version)(?:\/|$)/i.test(decoded)) return false;
  if (/^\/api(?:\/|$)/i.test(decoded))
    return /^\/api\/v1(?:\/|$)/i.test(decoded);
  return true;
}

function isWrite(method) {
  return method !== "GET" && method !== "HEAD";
}

function tailnetIPv4(address) {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
    return false;
  const bytes = parts.map(Number);
  return (
    bytes.every((byte) => byte >= 0 && byte <= 255) &&
    bytes[0] === 100 &&
    bytes[1] >= 64 &&
    bytes[1] <= 127
  );
}

export function createPhonePreviewServer({
  credential,
  expectedOrigin,
  allowedClientIp,
  upstreamPort = 3010,
}) {
  const origin = new URL(expectedOrigin);
  const tailnetDirect =
    origin.protocol === "http:" &&
    tailnetIPv4(origin.hostname) &&
    tailnetIPv4(allowedClientIp ?? "");
  if (
    (origin.protocol !== "https:" && !tailnetDirect) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    !/^[A-Za-z0-9_-]{24,}$/.test(credential)
  ) {
    throw new Error(
      "Phone preview needs HTTPS or a restricted Tailnet origin, plus a strong credential",
    );
  }

  return createServer({ maxHeaderSize: 16384 }, (request, response) => {
    if (
      allowedClientIp &&
      request.socket.remoteAddress?.replace(/^::ffff:/, "") !== allowedClientIp
    )
      return sendPlain(response, 403, "Client denied.\n");
    if (request.headers.host !== origin.host)
      return sendPlain(response, 400, "Host denied.\n");
    if (!hasCredential(request.headers.authorization, credential))
      return sendPlain(response, 401, "Review credential required.\n", {
        "www-authenticate":
          'Basic realm="Commandry temporary phone review", charset="UTF-8"',
      });
    if (!permittedPath(request.url))
      return sendPlain(response, 403, "Path denied.\n");
    if (
      !["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"].includes(
        request.method ?? "",
      )
    )
      return sendPlain(response, 405, "Method denied.\n");

    if (isWrite(request.method)) {
      if (!/^\/api\/v1(?:\/|\?)/i.test(request.url ?? ""))
        return sendPlain(
          response,
          405,
          "Only versioned API writes are allowed.\n",
        );
      if (
        request.headers.origin !== origin.origin ||
        (request.headers["sec-fetch-site"] &&
          request.headers["sec-fetch-site"] !== "same-origin")
      )
        return sendPlain(response, 403, "Write origin denied.\n");
      const contentLength = request.headers["content-length"];
      if (contentLength === undefined || !/^\d+$/.test(contentLength))
        return sendPlain(response, 411, "Content length required.\n");
      if (Number(contentLength) > maximumBodyBytes)
        return sendPlain(response, 413, "Request too large.\n");
    }

    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(
        ([name]) => !removedRequestHeaders.has(name),
      ),
    );
    headers.host = `127.0.0.1:${upstreamPort}`;
    headers["x-forwarded-host"] = origin.host;
    headers["x-forwarded-proto"] = origin.protocol.slice(0, -1);

    const upstream = httpRequest(
      {
        hostname: "127.0.0.1",
        port: upstreamPort,
        path: request.url,
        method: request.method,
        headers,
        timeout: 30000,
      },
      (received) => {
        const responseHeaders = Object.fromEntries(
          Object.entries(received.headers).filter(
            ([name]) => !removedResponseHeaders.has(name),
          ),
        );
        const location = responseHeaders.location;
        if (typeof location === "string") {
          const localOrigin = `http://127.0.0.1:${upstreamPort}`;
          if (location.startsWith(localOrigin)) {
            responseHeaders.location =
              origin.origin + location.slice(localOrigin.length);
          } else if (!location.startsWith("/")) {
            received.resume();
            return sendPlain(response, 502, "Upstream redirect denied.\n");
          }
        }
        responseHeaders["cache-control"] = "no-store";
        responseHeaders["referrer-policy"] = "no-referrer";
        responseHeaders["x-content-type-options"] = "nosniff";
        responseHeaders["x-frame-options"] = "DENY";
        response.writeHead(received.statusCode ?? 502, responseHeaders);
        if (request.method === "HEAD") {
          received.resume();
          response.end();
        } else {
          received.pipe(response);
        }
      },
    );
    upstream.on("timeout", () =>
      upstream.destroy(new Error("Upstream timeout")),
    );
    upstream.on("error", () => {
      if (!response.headersSent)
        sendPlain(response, 502, "Local MVP unavailable.\n");
      else response.destroy();
    });
    request.on("aborted", () => upstream.destroy());
    request.pipe(upstream);
  });
}

function credentialFromFile() {
  mkdirSync(path.dirname(credentialPath), { recursive: true, mode: 0o700 });
  try {
    return readFileSync(credentialPath, "utf8").trim();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const credential = randomBytes(24).toString("base64url");
    writeFileSync(credentialPath, credential + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    return credential;
  }
}

function main() {
  if (
    process.argv.length !== 6 ||
    process.argv[2] !== "--origin" ||
    process.argv[4] !== "--client"
  ) {
    throw new Error(
      "Usage: pnpm preview:phone --origin http://TAILNET_IP:3011 --client PHONE_TAILNET_IP",
    );
  }
  const expectedOrigin = process.argv[3];
  const allowedClientIp = process.argv[5];
  const server = createPhonePreviewServer({
    credential: credentialFromFile(),
    expectedOrigin,
    allowedClientIp,
  });
  server.listen(3011, new URL(expectedOrigin).hostname, () => {
    console.log("Temporary phone preview: " + expectedOrigin);
    console.log("Review user: " + username);
    console.log("Review credential file: " + credentialPath);
    console.log("Allowed Tailnet client: " + allowedClientIp);
  });
  const stop = () => server.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
