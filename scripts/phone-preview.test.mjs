import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { test } from "node:test";
import { createPhonePreviewServer } from "./phone-preview.mjs";

const origin = "https://kronos.example.ts.net:8443";
const credential = "temporary-review-gate-credential-12345";

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
  const headers = {
    host: new URL(origin).host,
    ...(options.auth
      ? {
          authorization:
            "Basic " + Buffer.from(`review:${options.auth}`).toString("base64"),
        }
      : {}),
    ...(options.method && options.method !== "GET"
      ? { "content-length": Buffer.byteLength(body) }
      : {}),
    ...options.headers,
  };
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: options.method ?? "GET",
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
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

test("phone gateway requires its own credential and confines full reads to the local MVP", async () => {
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
    credential,
    expectedOrigin: origin,
    upstreamPort,
  });
  const port = await listen(gateway);
  try {
    assert.equal((await request(port, "/projects")).status, 401);
    assert.equal(
      (await request(port, "/projects", { auth: "wrong" })).status,
      401,
    );
    assert.equal(
      (
        await request(port, "/projects", {
          auth: credential,
          headers: { host: "unexpected.example" },
        })
      ).status,
      400,
    );
    const page = await request(port, "/projects", { auth: credential });
    assert.equal(page.status, 200);
    assert.equal(page.body, "MVP /projects");
    assert.equal(page.headers["cache-control"], "no-store");
    assert.equal(
      (await request(port, "/api/v1/projects", { auth: credential })).status,
      200,
    );
    assert.equal(
      (await request(port, "/_next/static/chunk.js", { auth: credential }))
        .status,
      200,
    );
    for (const forbidden of [
      "/api/internal",
      "/auth/sign-in",
      "/health/ready",
      "/version",
      "/api/v1/../health/ready",
    ]) {
      assert.equal(
        (await request(port, forbidden, { auth: credential })).status,
        403,
      );
    }
    assert.equal(received.length, 3);
    assert.equal(received[0].authorization, undefined);
    assert.equal(received[0].host, `127.0.0.1:${upstreamPort}`);
    assert.equal(received[0].forwardedHost, new URL(origin).host);
    assert.equal(received[0].forwardedProto, "https");
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test("phone gateway accepts same-origin API writes and rejects cross-origin and oversized requests", async () => {
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
    credential,
    expectedOrigin: origin,
    upstreamPort,
  });
  const port = await listen(gateway);
  try {
    const valid = await request(port, "/api/v1/projects", {
      auth: credential,
      method: "POST",
      body: '{"name":"Phone review"}',
      headers: {
        "content-type": "application/json",
        origin,
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(valid.status, 201);
    assert.equal(valid.body, '{"id":"local"}');
    assert.deepEqual(received, [
      {
        method: "POST",
        path: "/api/v1/projects",
        body: '{"name":"Phone review"}',
        authorization: undefined,
      },
    ]);
    assert.equal(
      (
        await request(port, "/api/v1/projects", {
          auth: credential,
          method: "POST",
          body: "{}",
          headers: { origin: "https://other.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(port, "/api/v1/projects", {
          auth: credential,
          method: "POST",
          body: "{}",
          headers: { origin, "sec-fetch-site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(port, "/projects", {
          auth: credential,
          method: "POST",
          body: "{}",
          headers: { origin },
        })
      ).status,
      405,
    );
    assert.equal(
      (
        await request(port, "/api/v1/projects", {
          auth: credential,
          method: "POST",
          body: "{}",
          headers: { origin, "content-length": "1048577" },
        })
      ).status,
      413,
    );
    assert.equal(received.length, 1);
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test("phone gateway permits only restricted Tailnet HTTP or HTTPS and strong credentials", async () => {
  assert.throws(() =>
    createPhonePreviewServer({
      credential,
      expectedOrigin: "http://kronos.example.ts.net:8443",
    }),
  );
  assert.throws(() =>
    createPhonePreviewServer({
      credential,
      expectedOrigin: "http://10.0.0.73:3011",
      allowedClientIp: "100.106.127.23",
    }),
  );
  assert.throws(() =>
    createPhonePreviewServer({
      credential,
      expectedOrigin: "http://100.67.164.61:3011",
    }),
  );
  assert.throws(() =>
    createPhonePreviewServer({
      credential: "pass",
      expectedOrigin: origin,
    }),
  );
  const restricted = createPhonePreviewServer({
    credential,
    expectedOrigin: "http://100.67.164.61:3011",
    allowedClientIp: "100.106.127.23",
  });
  const port = await listen(restricted);
  try {
    assert.equal(
      (
        await request(port, "/", {
          auth: credential,
          headers: { host: "100.67.164.61:3011" },
        })
      ).status,
      403,
    );
  } finally {
    await close(restricted);
  }
});
