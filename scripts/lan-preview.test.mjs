import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import {
  createAppPreviewServer,
  createLabPreviewServer,
  isAllowedAppPath,
  isClientInSubnet,
  readOrCreateCredential,
  selectLanAddress,
} from "./lan-preview.mjs";

const directory = mkdtempSync(path.join(tmpdir(), "commandry-lan-preview-"));
after(() => rmSync(directory, { recursive: true, force: true }));

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function get(
  port,
  pathname,
  { method = "GET", credential, host = "127.0.0.1" } = {},
) {
  return new Promise((resolve, reject) => {
    const headers = { host: host + ":" + port };
    if (credential) {
      headers.authorization =
        "Basic " +
        Buffer.from(credential.user + ":" + credential.password).toString(
          "base64",
        );
    }
    const request = httpRequest(
      { hostname: "127.0.0.1", port, path: pathname, method, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: response.headers,
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

test("only active private interfaces can be selected and clients stay within the prefix", () => {
  const interfaces = {
    eth0: [
      {
        family: "IPv4",
        internal: false,
        address: "10.0.0.73",
        cidr: "10.0.0.73/24",
      },
    ],
    lo: [
      {
        family: "IPv4",
        internal: true,
        address: "127.0.0.1",
        cidr: "127.0.0.1/8",
      },
    ],
  };
  assert.equal(selectLanAddress("10.0.0.73", interfaces).prefix, 24);
  assert.throws(() => selectLanAddress("127.0.0.1", interfaces));
  assert.equal(isClientInSubnet("10.0.0.24", "10.0.0.73", 24), true);
  assert.equal(isClientInSubnet("10.0.1.24", "10.0.0.73", 24), false);
  assert.equal(isAllowedAppPath("/"), true);
  assert.equal(isAllowedAppPath("/_next/static/chunks/app.js"), true);
  assert.equal(isAllowedAppPath("/api/v1/resources"), false);
  assert.equal(isAllowedAppPath("/_next/static/../api/v1"), false);
});

test("credential is local, private, and stable", () => {
  const file = path.join(directory, ".env.lan-preview");
  const first = readOrCreateCredential(file);
  assert.equal(first.user, "preview");
  assert.ok(first.password.length >= 32);
  assert.deepEqual(readOrCreateCredential(file), first);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.ok(readFileSync(file, "utf8").includes("LAN_PREVIEW_PASSWORD="));
});

test("app preview requires auth and only proxies read-only shell assets", async () => {
  let receivedAuthorization = null;
  const upstream = createServer((request, response) => {
    receivedAuthorization = request.headers.authorization ?? null;
    response.setHeader("content-type", "text/plain");
    response.end("upstream:" + request.url);
  });
  const upstreamPort = await listen(upstream);
  const credential = { user: "preview", password: "local-test-secret" };
  const server = createAppPreviewServer({
    selected: { address: "127.0.0.1", prefix: 8 },
    port: 0,
    credential,
    upstreamPort,
  });
  const port = await listen(server);
  try {
    assert.equal((await get(port, "/")).status, 401);
    assert.equal(
      (
        await get(port, "/", {
          credential: { user: "preview", password: "wrong" },
        })
      ).status,
      401,
    );
    const home = await get(port, "/", { credential });
    assert.equal(home.status, 200);
    assert.equal(home.body, "upstream:/");
    assert.equal(receivedAuthorization, null);
    assert.equal(
      (await get(port, "/_next/static/chunks/app.js", { credential })).status,
      200,
    );
    assert.equal(
      (await get(port, "/", { credential, method: "HEAD" })).status,
      200,
    );
    assert.equal(
      (await get(port, "/api/v1/resources", { credential })).status,
      403,
    );
    assert.equal(
      (await get(port, "/auth/sign-in", { credential })).status,
      403,
    );
    assert.equal(
      (await get(port, "/", { credential, method: "POST" })).status,
      405,
    );
    assert.equal((await get(port, "/other", { credential })).status, 403);
  } finally {
    await close(server);
    await close(upstream);
  }
});

test("lab preview serves static files with auth and rejects API, writes, and escapes", async () => {
  const root = path.join(directory, "storybook-static");
  mkdirSync(root);
  writeFileSync(path.join(root, "index.html"), "<title>Lab</title>");
  writeFileSync(path.join(root, "index.json"), "{}");
  const outside = path.join(directory, "outside.txt");
  writeFileSync(outside, "private");
  symlinkSync(outside, path.join(root, "escape.txt"));
  const credential = { user: "preview", password: "local-test-secret" };
  const server = createLabPreviewServer({
    selected: { address: "127.0.0.1", prefix: 8 },
    port: 0,
    credential,
    root,
  });
  const port = await listen(server);
  try {
    assert.equal((await get(port, "/")).status, 401);
    assert.equal(
      (await get(port, "/", { credential })).body,
      "<title>Lab</title>",
    );
    assert.equal((await get(port, "/index.json", { credential })).status, 200);
    assert.equal(
      (await get(port, "/", { credential, method: "HEAD" })).body,
      "",
    );
    assert.equal(
      (await get(port, "/api/v1/resources", { credential })).status,
      403,
    );
    assert.equal(
      (await get(port, "/", { credential, method: "POST" })).status,
      405,
    );
    assert.equal((await get(port, "/escape.txt", { credential })).status, 403);
    assert.equal(
      (await get(port, "/%2e%2e/outside.txt", { credential })).status,
      403,
    );
  } finally {
    await close(server);
  }
});

test("request from outside the selected subnet is refused", async () => {
  const server = createAppPreviewServer({
    selected: { address: "10.0.0.73", prefix: 24 },
    port: 0,
    credential: { user: "preview", password: "local-test-secret" },
  });
  const port = await listen(server);
  try {
    assert.equal((await get(port, "/", { host: "10.0.0.73" })).status, 403);
  } finally {
    await close(server);
  }
});
