import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { test } from "node:test";
import { localPreviewCredential } from "./lan-preview.mjs";
import { createPhonePreviewServer } from "./phone-preview.mjs";

const loopback = { address: "127.0.0.1", prefix: 8 };

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function request(port, pathname, options = {}) {
  const body = options.body ?? "";
  const method = options.method ?? "GET";
  const origin = `http://127.0.0.1:${port}`;
  const credential = options.credential ?? localPreviewCredential;
  const headers = {
    host: `127.0.0.1:${port}`,
    ...(credential
      ? {
          authorization:
            "Basic " +
            Buffer.from(`${credential.user}:${credential.password}`).toString(
              "base64",
            ),
        }
      : {}),
    ...(method !== "GET"
      ? {
          "content-length": Buffer.byteLength(body),
          origin,
          "sec-fetch-site": "same-origin",
        }
      : {}),
    ...options.headers,
  };
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers,
      },
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
    outgoing.on("error", (error) =>
      reject(
        new Error(
          `${method} ${pathname} (${Buffer.byteLength(body)} bytes): ${error.message}`,
          { cause: error },
        ),
      ),
    );
    outgoing.end(body);
  });
}

test("full LAN gateway uses test/pass, strips the gate credential, and limits paths", async () => {
  const received = [];
  const upstream = createServer((incoming, response) => {
    received.push({
      path: incoming.url,
      authorization: incoming.headers.authorization,
      host: incoming.headers.host,
      forwardedHost: incoming.headers["x-forwarded-host"],
      forwardedProto: incoming.headers["x-forwarded-proto"],
    });
    response.setHeader("content-type", "text/plain");
    response.end(`MVP ${incoming.url}`);
  });
  const upstreamPort = await listen(upstream);
  const gateway = createPhonePreviewServer({
    selected: loopback,
    port: 0,
    upstreamPort,
  });
  const port = await listen(gateway);
  try {
    assert.equal(
      (await request(port, "/projects", { credential: false })).status,
      401,
    );
    assert.equal(
      (
        await request(port, "/projects", {
          credential: { user: "test", password: "wrong" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(port, "/projects", {
          headers: { host: "unexpected.example" },
        })
      ).status,
      400,
    );
    const page = await request(port, "/projects");
    assert.equal(page.status, 200);
    assert.equal(page.body, "MVP /projects");
    assert.equal(page.headers["cache-control"], "no-store");
    assert.equal((await request(port, "/api/v1/projects")).status, 200);
    assert.equal((await request(port, "/_next/static/chunk.js")).status, 200);
    for (const forbidden of [
      "/api/internal",
      "/auth/sign-in",
      "/health/ready",
      "/version",
      "/api/v1/../health/ready",
    ]) {
      assert.equal((await request(port, forbidden)).status, 403);
    }
    assert.equal(received.length, 3);
    assert.equal(received[0].authorization, undefined);
    assert.equal(received[0].host, `127.0.0.1:${upstreamPort}`);
    assert.equal(received[0].forwardedHost, `127.0.0.1:${port}`);
    assert.equal(received[0].forwardedProto, "http");
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test("full LAN gateway accepts same-origin API writes and rejects cross-origin requests", async () => {
  const received = [];
  const upstream = createServer((incoming, response) => {
    const chunks = [];
    incoming.on("data", (chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      received.push({
        method: incoming.method,
        path: incoming.url,
        body: Buffer.concat(chunks).toString("utf8"),
        authorization: incoming.headers.authorization,
      });
      response.writeHead(201, { "content-type": "application/json" });
      response.end('{"id":"local"}');
    });
  });
  const upstreamPort = await listen(upstream);
  const gateway = createPhonePreviewServer({
    selected: loopback,
    port: 0,
    upstreamPort,
  });
  const port = await listen(gateway);
  try {
    const valid = await request(port, "/api/v1/projects", {
      method: "POST",
      body: '{"name":"Phone review"}',
      headers: { "content-type": "application/json" },
    });
    assert.equal(valid.status, 201);
    assert.equal(valid.body, '{"id":"local"}');
    const fileUpload = await request(port, "/api/v1/captures/files", {
      method: "POST",
      body: "x".repeat(1024 * 1024 + 1),
      headers: { "content-type": "multipart/form-data; boundary=local" },
    });
    assert.equal(fileUpload.status, 201);
    assert.deepEqual(received, [
      {
        method: "POST",
        path: "/api/v1/projects",
        body: '{"name":"Phone review"}',
        authorization: undefined,
      },
      {
        method: "POST",
        path: "/api/v1/captures/files",
        body: "x".repeat(1024 * 1024 + 1),
        authorization: undefined,
      },
    ]);
    assert.equal(
      (
        await request(port, "/api/v1/projects", {
          method: "POST",
          body: "{}",
          headers: { origin: "http://other.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(port, "/api/v1/projects", {
          method: "POST",
          body: "{}",
          headers: { "sec-fetch-site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(port, "/projects", {
          method: "POST",
          body: "{}",
        })
      ).status,
      405,
    );
    assert.equal(
      (
        await request(port, "/mcp", {
          method: "POST",
          body: "{}",
        })
      ).status,
      405,
    );
    assert.equal(
      (
        await request(port, "/api/v1/projects", {
          method: "POST",
          body: "{}",
          headers: { "content-length": "1048577" },
        })
      ).status,
      413,
    );
    assert.equal(received.length, 2);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test("full LAN gateway rejects clients outside its selected subnet", async () => {
  const gateway = createPhonePreviewServer({
    selected: { address: "10.0.0.73", prefix: 24 },
    port: 0,
  });
  const port = await listen(gateway);
  try {
    assert.equal(
      (
        await request(port, "/", {
          headers: { host: `10.0.0.73:${port}` },
        })
      ).status,
      403,
    );
  } finally {
    await close(gateway);
  }
});
