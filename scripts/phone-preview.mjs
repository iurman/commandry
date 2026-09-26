import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isClientInSubnet,
  localPreviewCredential,
  selectLanAddress,
} from "./lan-preview.mjs";

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
    .update(`${credential.user}:${credential.password}`)
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

export function createPhonePreviewServer({
  selected,
  port = 3011,
  credential = localPreviewCredential,
  upstreamPort = 3010,
}) {
  if (!selected?.address || !Number.isInteger(selected.prefix))
    throw new Error("Select an active private LAN interface for phone review");

  const server = createServer({ maxHeaderSize: 16384 }, (request, response) => {
    const exposedHost = `${selected.address}:${port || server.address()?.port}`;
    const exposedOrigin = `http://${exposedHost}`;
    if (
      !isClientInSubnet(
        request.socket.remoteAddress ?? "",
        selected.address,
        selected.prefix,
      )
    )
      return sendPlain(response, 403, "Client subnet denied.\n");
    if (request.headers.host !== exposedHost)
      return sendPlain(response, 400, "Host denied.\n");
    if (!hasCredential(request.headers.authorization, credential))
      return sendPlain(response, 401, "Review credential required.\n", {
        "www-authenticate":
          'Basic realm="Commandry local phone review", charset="UTF-8"',
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
        request.headers.origin !== exposedOrigin ||
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
    headers["x-forwarded-host"] = exposedHost;
    headers["x-forwarded-proto"] = "http";

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
              exposedOrigin + location.slice(localOrigin.length);
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
  return server;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--host"))
    throw new Error("Usage: pnpm preview:phone [--host PRIVATE_LAN_IPV4]");
  const selected = selectLanAddress(args[1]);
  const server = createPhonePreviewServer({ selected });
  server.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(3011, selected.address, () => {
    console.log(
      `Full local MVP phone preview: http://${selected.address}:3011/`,
    );
    console.log("Local review gate: test / pass");
    console.log("The gate is not product authentication.");
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
