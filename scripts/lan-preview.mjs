import { spawnSync } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const staticRoot = path.join(repositoryRoot, "apps/lab/storybook-static");
export const localPreviewCredential = Object.freeze({
  user: "test",
  password: "pass",
});

function ipv4Number(address) {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return null;
  }
  const bytes = parts.map(Number);
  if (bytes.some((byte) => byte > 255)) return null;
  return (
    (((bytes[0] << 24) >>> 0) +
      (bytes[1] << 16) +
      (bytes[2] << 8) +
      bytes[3]) >>>
    0
  );
}

function isPrivateIPv4(address) {
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export function isClientInSubnet(clientAddress, selectedAddress, prefix) {
  const client = ipv4Number(clientAddress.replace(/^::ffff:/, ""));
  const selected = ipv4Number(selectedAddress);
  if (client === null || selected === null || prefix < 1 || prefix > 32) {
    return false;
  }
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (client & mask) === (selected & mask);
}

export function selectLanAddress(override, interfaces = networkInterfaces()) {
  const candidates = Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter(
        (entry) =>
          entry.family === "IPv4" &&
          !entry.internal &&
          isPrivateIPv4(entry.address),
      )
      .map((entry) => ({
        name,
        address: entry.address,
        prefix: Number(entry.cidr?.split("/")[1]),
      }))
      .filter((entry) => entry.prefix >= 1 && entry.prefix <= 32),
  );

  if (override) {
    const selected = candidates.find((entry) => entry.address === override);
    if (!selected) {
      throw new Error(
        "--host must be an active private IPv4 address on this laptop.",
      );
    }
    return selected;
  }

  const wireless = candidates.filter((entry) =>
    existsSync(path.join("/sys/class/net", entry.name, "wireless")),
  );
  if (wireless.length !== 1) {
    throw new Error(
      "Expected one active private Wi-Fi IPv4 address. Pass --host with the address to use.",
    );
  }
  return wireless[0];
}

function sendPlain(response, status, message, extra = {}) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  response.end(message);
}

function authenticated(header, credential) {
  const match = /^Basic ([A-Za-z0-9+/=]+)$/.exec(header ?? "");
  if (!match) return false;
  const received = createHash("sha256")
    .update(Buffer.from(match[1], "base64"))
    .digest();
  const expected = createHash("sha256")
    .update(credential.user + ":" + credential.password)
    .digest();
  return timingSafeEqual(received, expected);
}

function rawPathOf(url) {
  if (!url?.startsWith("/") || url.startsWith("//")) return null;
  return url.split("?", 1)[0];
}

function forbiddenPath(rawPath) {
  return /^(?:\/api(?:\/|$)|\/auth(?:\/|$)|\/health(?:\/|$)|\/version(?:\/|$))/i.test(
    rawPath,
  );
}

export function isAllowedAppPath(rawUrl) {
  const rawPath = rawPathOf(rawUrl);
  if (!rawPath || forbiddenPath(rawPath)) return false;
  if (rawPath === "/") return true;
  if (!/^\/_next\/static\/[A-Za-z0-9_./@\-\[\]]+$/.test(rawPath)) {
    return false;
  }
  return !rawPath.split("/").includes("..");
}

function safeStaticFile(rawUrl, root) {
  const rawPath = rawPathOf(rawUrl);
  if (!rawPath || forbiddenPath(rawPath)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (
    decoded.includes("\\") ||
    decoded.includes("\0") ||
    decoded.split("/").includes("..")
  ) {
    return null;
  }
  const destination = path.resolve(root, "." + decoded);
  if (destination !== root && !destination.startsWith(root + path.sep)) {
    return null;
  }
  return destination;
}

const mime = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveStatic(request, response, root) {
  let destination = safeStaticFile(request.url, root);
  if (!destination) return sendPlain(response, 403, "Path denied.\n");
  if (destination === root || request.url.split("?", 1)[0].endsWith("/")) {
    destination = path.join(destination, "index.html");
  }
  try {
    const actual = realpathSync(destination);
    const base = realpathSync(root);
    if (!actual.startsWith(base + path.sep)) {
      return sendPlain(response, 403, "Path denied.\n");
    }
    const info = statSync(actual);
    if (!info.isFile()) return sendPlain(response, 404, "Not found.\n");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-length": info.size,
      "content-type":
        mime[path.extname(actual).toLowerCase()] ?? "application/octet-stream",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") return response.end();
    const stream = createReadStream(actual);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return sendPlain(response, 404, "Not found.\n");
    }
    return sendPlain(response, 500, "Static preview failed.\n");
  }
}

function proxyApp(request, response, upstreamPort) {
  const forwarded = {};
  for (const key of [
    "accept",
    "accept-language",
    "if-modified-since",
    "if-none-match",
    "user-agent",
  ]) {
    if (request.headers[key]) forwarded[key] = request.headers[key];
  }
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: request.url,
      method: request.method,
      headers: forwarded,
      timeout: 15000,
    },
    (received) => {
      if (
        (received.statusCode ?? 500) >= 300 &&
        (received.statusCode ?? 500) < 400
      ) {
        received.resume();
        return sendPlain(response, 502, "Upstream redirect denied.\n");
      }
      const headers = {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      };
      for (const key of [
        "content-type",
        "content-length",
        "content-encoding",
        "etag",
        "vary",
      ]) {
        if (received.headers[key]) headers[key] = received.headers[key];
      }
      response.writeHead(received.statusCode ?? 502, headers);
      if (request.method === "HEAD") {
        received.resume();
        response.end();
      } else {
        received.pipe(response);
      }
    },
  );
  upstream.on("timeout", () => upstream.destroy(new Error("Upstream timeout")));
  upstream.on("error", () => {
    if (!response.headersSent)
      sendPlain(response, 502, "Local app unavailable.\n");
    else response.destroy();
  });
  request.on("aborted", () => upstream.destroy());
  upstream.end();
}

function createPreviewServer(kind, options) {
  const {
    selected,
    port,
    credential,
    root = staticRoot,
    upstreamPort = 3000,
  } = options;
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    if (
      !isClientInSubnet(
        request.socket.remoteAddress ?? "",
        selected.address,
        selected.prefix,
      )
    ) {
      return sendPlain(response, 403, "Client subnet denied.\n");
    }
    if (
      request.headers.host !==
      selected.address + ":" + (port || server.address()?.port)
    ) {
      return sendPlain(response, 400, "Host denied.\n");
    }
    if (!authenticated(request.headers.authorization, credential)) {
      return sendPlain(response, 401, "Authentication required.\n", {
        "www-authenticate":
          'Basic realm="Commandry local preview", charset="UTF-8"',
      });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendPlain(response, 405, "Read-only preview.\n", {
        allow: "GET, HEAD",
      });
    }
    if (kind === "app") {
      if (!isAllowedAppPath(request.url)) {
        return sendPlain(response, 403, "Path denied.\n");
      }
      return proxyApp(request, response, upstreamPort);
    }
    return serveStatic(request, response, root);
  });
  return server;
}

export function createAppPreviewServer(options) {
  return createPreviewServer("app", options);
}

export function createLabPreviewServer(options) {
  return createPreviewServer("lab", options);
}

function parseArgs(args) {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === "--host") return { host: args[1] };
  throw new Error("Usage: pnpm preview:lan [--host PRIVATE_LAN_IPV4]");
}

function listen(server, address, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, address, resolve);
  });
}

async function main() {
  const { host } = parseArgs(process.argv.slice(2));
  const selected = selectLanAddress(host);
  const build = spawnSync(
    "pnpm",
    [
      "--filter",
      "@commandry/lab",
      "exec",
      "storybook",
      "build",
      "--output-dir",
      "storybook-static",
      "--disable-telemetry",
      "--quiet",
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
  );
  if (build.error || build.status !== 0) {
    throw new Error("Storybook static build failed.");
  }
  const app = createAppPreviewServer({
    selected,
    port: 3001,
    credential: localPreviewCredential,
  });
  const lab = createLabPreviewServer({
    selected,
    port: 3002,
    credential: localPreviewCredential,
  });
  try {
    await listen(app, selected.address, 3001);
    await listen(lab, selected.address, 3002);
  } catch (error) {
    app.close();
    lab.close();
    throw error;
  }
  console.log(
    "LAN preview on " +
      selected.name +
      " (" +
      selected.address +
      "/" +
      selected.prefix +
      "):",
  );
  console.log("App shell: http://" + selected.address + ":3001/");
  console.log("Design lab: http://" + selected.address + ":3002/");
  console.log("Local preview login: test / pass");
  console.log(
    "Start the local app on 127.0.0.1:3000 before opening the app shell URL.",
  );
  const stop = () => {
    app.close();
    lab.close();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
