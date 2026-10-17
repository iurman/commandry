import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, request as httpRequest } from "node:http";
import {
  createUsabilityPreview,
  loadPreviewPair,
  parseArguments,
} from "./observatory-usability-preview.mjs";
import {
  infrastructureOverviewSchema,
  observatorySceneReadResultSchema,
  observatoryMembershipPageSchema,
  observatorySignalEvidenceResultSchema,
  observatoryProviderExplanationResultSchema,
  observatoryOperationalEvidenceResultSchema,
} from "../packages/contracts/src/index.ts";
import {
  operationalObservatoryFixture,
  observatoryFixtureTime,
} from "../packages/test-support/src/observatory.ts";

const sourceSha = "a".repeat(40);
const base = "/api/v1/infrastructure/observatory/";
const fixture = operationalObservatoryFixture();

async function disposableBackend(options = {}) {
  const seen = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({
      path: req.url,
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    if (options.redirect === req.url) {
      res.writeHead(302, { location: "http://192.0.2.1/forbidden" });
      res.end();
    } else if (req.url === "/version") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          sha: sourceSha,
          imageDigest: null,
          buildTime: null,
          schemaCompatibility: "1",
          environment: "test",
          ...options.version,
        }),
      );
    } else if (req.url === "/api/auth/sign-in/email") {
      res.writeHead(options.loginStatus ?? 200, {
        "content-type": "application/json",
        "set-cookie": "owned-session=backend-only; HttpOnly; Path=/",
      });
      res.end("{}");
    } else if (req.url.startsWith("/_next/static/")) {
      res.writeHead(200, {
        "content-type": options.assetHtml ? "text/html" : "text/javascript",
        "set-cookie": "must-not-reach-browser=secret; Path=/",
        "x-private-secret": "not-public",
      });
      res.end("globalThis.actualBuiltAsset = true;");
    } else {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "must-not-reach-browser=secret; Path=/",
        "x-private-secret": "not-public",
      });
      res.end(
        '<html><body><main id="owned-built-page">Owned built page marker</main><script src="/_next/static/app.js"></script></body></html>',
      );
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = "http://127.0.0.1:" + server.address().port;
  return {
    seen,
    origin,
    receipt: {
      origin,
      sourceSha,
      schema: "disposable PostgreSQL18",
      externalPolling: false,
      runtimeAssets: "Private copy of the built Next standalone output",
    },
    credential: {
      origin,
      email: "synthetic-owner@example.test",
      password: "owned-test-password",
    },
    close: async () => {
      server.closeIdleConnections();
      await new Promise((done) => server.close(done));
    },
  };
}

async function withReview(run, options = {}) {
  const backend = await disposableBackend(options);
  let preview;
  try {
    assert.equal(backend.seen.length, 0);
    preview = await createUsabilityPreview(backend);
    await run(preview, backend);
  } finally {
    await preview?.close();
    await backend.close();
  }
}

async function post(preview, suffix, body) {
  return fetch(preview.origin + base + suffix, {
    method: "POST",
    headers: { origin: preview.origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function raw(preview, path, options = {}) {
  const url = new URL(preview.origin);
  return new Promise((done, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port: url.port,
        path,
        method: options.method ?? "GET",
        headers: options.rawHeaders ?? {
          host: url.host,
          connection: "close",
          ...options.headers,
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("end", () =>
          done({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.once("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

test("preserves the fixed built HTML/assets, visible review limits and private header boundary", async () => {
  await withReview(async (preview, backend) => {
    assert.match(preview.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal(preview.sourceSha, sourceSha);
    assert.equal(backend.seen.length, 2);
    assert.deepEqual(
      backend.seen.map((r) => r.path),
      ["/version", "/api/auth/sign-in/email"],
    );
    assert.deepEqual(JSON.parse(backend.seen[1].body), {
      email: backend.credential.email,
      password: backend.credential.password,
    });
    for (const path of ["/infrastructure", "/infrastructure/wallboard"]) {
      const result = await raw(preview, path, {
        headers: {
          cookie: "browser-cookie=never-forward",
          authorization: "Bearer browser-secret",
          "x-arbitrary": "never-forward",
          origin: preview.origin,
        },
      });
      assert.equal(result.status, 200);
      assert.match(result.body, /id="owned-built-page"/);
      assert.match(result.body, /SYNTHETIC LOCAL REVIEW/);
      assert.ok(result.body.includes(sourceSha));
      assert.ok(result.body.includes(observatoryFixtureTime));
      assert.match(result.body, /no live ingestion/i);
      assert.match(
        result.body,
        /Work records, private views and the public provider feed are unavailable/,
      );
      assert.equal(result.headers["set-cookie"], undefined);
      assert.equal(result.headers["x-private-secret"], undefined);
      assert.match(
        result.headers["content-security-policy"],
        /connect-src 'self'/,
      );
      assert.match(
        result.headers["content-security-policy"],
        /form-action 'none'/,
      );
      assert.ok(!result.headers["content-security-policy"].includes("https:"));
      assert.ok(!result.body.includes(backend.credential.password));
      const last = backend.seen.at(-1);
      assert.equal(last.headers.cookie, "owned-session=backend-only");
      assert.equal(last.headers.authorization, undefined);
      assert.equal(last.headers["x-arbitrary"], undefined);
      assert.equal(last.headers.origin, undefined);
    }
    const asset = await raw(preview, "/_next/static/app.js", {
      headers: { cookie: "browser-cookie=never-forward" },
    });
    assert.equal(asset.status, 200);
    assert.equal(asset.body, "globalThis.actualBuiltAsset = true;");
    assert.equal(asset.headers["set-cookie"], undefined);
    assert.equal(asset.headers["x-private-secret"], undefined);
    const head = await raw(preview, "/infrastructure", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    assert.deepEqual(Object.keys(preview).sort(), [
      "close",
      "fixtureClock",
      "origin",
      "sourceSha",
      "url",
    ]);
  });
});

test("conserves all 18 canonical IDs through actual strict service reads, grouping, search and member continuation", async () => {
  await withReview(async (preview, backend) => {
    const initialBackendReads = backend.seen.length;
    const result = await post(preview, "scene", {});
    assert.equal(result.status, 200);
    const { scene } = observatorySceneReadResultSchema.parse(
      await result.json(),
    );
    assert.equal(scene.population.canonicalResourceCount, 18);
    assert.deepEqual(
      [...scene.membershipIndex.resourceIds].sort(),
      fixture.resources.map((r) => r.id).sort(),
    );
    const all = new Set();
    let pagesRead = 0;
    for (const groupId of scene.rootRepresentationIds) {
      let cursor = null;
      do {
        const response = await post(preview, "members", {
          groupId,
          scopeDigest: scene.scopeDigest,
          projectionRevision: scene.projectionRevision,
          limit: 2,
          cursor,
        });
        assert.equal(response.status, 200);
        const page = observatoryMembershipPageSchema.parse(
          await response.json(),
        );
        assert.ok(page.items.length <= 2);
        for (const item of page.items) all.add(item.resourceId);
        cursor = page.nextCursor;
        pagesRead++;
        assert.ok(pagesRead < 100);
      } while (cursor !== null);
    }
    assert.deepEqual(
      [...all].sort(),
      fixture.resources.map((r) => r.id).sort(),
    );
    assert.ok(pagesRead > scene.rootRepresentationIds.length);
    const searched = observatorySceneReadResultSchema.parse(
      await (
        await post(preview, "scene", {
          grouping: "projects",
          search: "Shared database",
        })
      ).json(),
    ).scene;
    assert.equal(searched.population.canonicalResourceCount, 18);
    assert.ok(
      searched.searchResults.some(
        (r) => r.resourceId === fixture.services[4].id,
      ),
    );
    const failing = observatorySignalEvidenceResultSchema.parse(
      await (
        await post(preview, "signals", {
          resourceId: fixture.services[4].id,
          facet: "availability",
        })
      ).json(),
    );
    assert.ok(failing.signals.some((s) => s.state === "failing"));
    const missing = observatorySignalEvidenceResultSchema.parse(
      await (
        await post(preview, "signals", {
          resourceId: fixture.services[5].id,
          facet: "availability",
        })
      ).json(),
    );
    assert.equal(missing.signals.length, 0);
    const exposure = observatoryProviderExplanationResultSchema.parse(
      await (
        await post(preview, "providers", { resourceId: fixture.services[4].id })
      ).json(),
    );
    assert.ok(exposure.items.length > 0);
    assert.ok(
      exposure.items.some(
        (item) => item.noticeId === "fixture:provider-incident",
      ),
    );
    const unavailable = observatoryOperationalEvidenceResultSchema.parse(
      await (
        await post(preview, "operational", {
          resourceId: fixture.hosts[0].id,
          facet: "availability",
        })
      ).json(),
    );
    assert.equal(unavailable.access, "unavailable");
    const feed = await post(preview, "provider-feed", {});
    assert.equal(feed.status, 503);
    assert.match((await feed.json()).message, /unavailable/);
    assert.equal(backend.seen.length, initialBackendReads);
  });
});

test("projects and strict overview provide complete continuation, scoped search and unknown-cursor rejection", async () => {
  await withReview(async (preview, backend) => {
    const before = backend.seen.length;
    const ids = [];
    let cursor = null;
    do {
      const query = new URLSearchParams({ limit: "2" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(
        preview.origin + "/api/v1/infrastructure/overview?" + query,
      );
      assert.equal(response.status, 200);
      const page = infrastructureOverviewSchema
        .strict()
        .parse(await response.json());
      assert.equal(page.total, 18);
      ids.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(ids).size, 18);
    assert.deepEqual(ids.sort(), fixture.resources.map((r) => r.id).sort());
    const projectIds = [];
    cursor = null;
    do {
      const query = new URLSearchParams({ limit: "1" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(
        preview.origin + "/api/v1/projects?" + query,
      );
      assert.equal(response.status, 200);
      const page = await response.json();
      projectIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(
      projectIds.sort(),
      fixture.projects.map((p) => p.id).sort(),
    );
    const search = await fetch(
      preview.origin + "/api/v1/infrastructure/overview?q=Shared%20database",
    );
    const matching = infrastructureOverviewSchema
      .strict()
      .parse(await search.json());
    assert.deepEqual(
      matching.items.map((r) => r.id),
      [fixture.services[4].id],
    );
    const scoped = await fetch(
      preview.origin +
        "/api/v1/infrastructure/overview?projectId=" +
        fixture.projects[0].id,
    );
    const scopedPage = infrastructureOverviewSchema
      .strict()
      .parse(await scoped.json());
    assert.ok(
      scopedPage.items.every((r) =>
        r.projects.some((p) => p.id === fixture.projects[0].id),
      ),
    );
    for (const path of [
      "/api/v1/projects?cursor=" + fixture.services[0].id,
      "/api/v1/infrastructure/overview?cursor=" + fixture.projects[0].id,
      "/api/v1/infrastructure/overview?unexpected=1",
      "/api/v1/projects?limit=1&limit=2",
    ])
      assert.equal((await raw(preview, path)).status, 400);
    assert.equal(backend.seen.length, before);
  });
});

test("denies foreign Host/Origin, cross-site, traversal, arbitrary URLs and every write before forwarding", async () => {
  await withReview(async (preview, backend) => {
    const before = backend.seen.length;
    for (const headers of [
      { host: "example.test" },
      { origin: "http://127.0.0.1:1" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
    ])
      assert.equal(
        (await raw(preview, "/infrastructure", { headers })).status,
        403,
      );
    for (const path of [
      "/%2e%2e/version",
      "/_next/static/%2e%2e/version",
      "/_next/static/../version",
      "//example.test/infrastructure",
      "http://example.test/infrastructure",
      "/_next/static/app.js?url=https://example.test",
    ])
      assert.equal((await raw(preview, path)).status, 400);
    for (const [method, path] of [
      ["POST", "/infrastructure"],
      ["DELETE", "/_next/static/app.js"],
      ["GET", "/version"],
      ["POST", "/api/auth/sign-in/email"],
      ["POST", base + "reviews/annotation"],
      ["POST", base + "views/read"],
      ["POST", base + "views/create"],
      ["PATCH", "/api/v1/resources/id"],
      ["GET", "/api/v1/work"],
      ["POST", base + "scene/extra"],
      ["GET", base + "scene"],
    ])
      assert.equal(
        (await raw(preview, path, { method, body: "{}" })).status,
        403,
      );
    assert.equal(backend.seen.length, before);
  });
});

test("rejects malformed, non-strict and oversized command bodies without a backend read", async () => {
  await withReview(async (preview, backend) => {
    const before = backend.seen.length;
    for (const body of [
      "{",
      "[]",
      "null",
      '{"unknown":true}',
      '{"grouping":"invented"}',
    ]) {
      const result = await raw(preview, base + "scene", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      assert.equal(result.status, 400);
    }
    assert.equal(
      (
        await raw(preview, base + "scene", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        })
      ).status,
      415,
    );
    for (const headers of [
      { "content-type": "application/json" },
      { "content-type": "application/json", "content-length": "32769" },
    ])
      assert.equal(
        (
          await raw(preview, base + "scene", {
            method: "POST",
            headers,
            body: "x".repeat(32769),
          })
        ).status,
        413,
      );
    assert.equal(backend.seen.length, before);
  });
});

test("requires an explicit matching disposable loopback pair and exact actual source/environment", async () => {
  const backend = await disposableBackend();
  try {
    for (const change of [
      { receipt: { ...backend.receipt, origin: "https://example.test" } },
      { receipt: { ...backend.receipt, schema: "production" } },
      { receipt: { ...backend.receipt, externalPolling: true } },
      {
        receipt: { ...backend.receipt, runtimeAssets: "shared current build" },
      },
      { credential: { ...backend.credential, origin: "http://127.0.0.1:1" } },
      { credential: { ...backend.credential, sourceSha: "b".repeat(40) } },
    ])
      await assert.rejects(createUsabilityPreview({ ...backend, ...change }));
    assert.equal(backend.seen.length, 0);
  } finally {
    await backend.close();
  }
  for (const options of [
    { version: { sha: "b".repeat(40) } },
    { version: { environment: "production" } },
    { redirect: "/version" },
    { redirect: "/api/auth/sign-in/email" },
    { loginStatus: 401 },
  ]) {
    const target = await disposableBackend(options);
    try {
      await assert.rejects(createUsabilityPreview(target));
      assert.ok(target.seen.length <= 2);
    } finally {
      await target.close();
    }
  }
  await withReview(
    async (preview, target) => {
      const page = await raw(preview, "/infrastructure");
      assert.equal(page.status, 502);
      assert.equal(page.headers.location, undefined);
      assert.equal(target.seen.at(-1).path, "/infrastructure");
    },
    { redirect: "/infrastructure" },
  );
});

test("CLI requires one explicit preview directory and never reads global current receipts", async () => {
  assert.throws(() => parseArguments([]));
  assert.throws(() => parseArguments(["--origin", "http://127.0.0.1:1"]));
  assert.throws(() =>
    parseArguments(["--preview-dir", "a", "--preview-dir", "b"]),
  );
  assert.throws(() => parseArguments(["--preview-dir", "a", "--port", "NaN"]));
  assert.deepEqual(
    parseArguments(["--preview-dir", "/owned/explicit", "--port", "0"]),
    {
      previewDirectory: "/owned/explicit",
      port: 0,
    },
  );
  await assert.rejects(loadPreviewPair(undefined));
});

test("rejects ambiguous Host headers, HTML disguised as an asset and oversized attestation", async () => {
  await withReview(async (preview, backend) => {
    const before = backend.seen.length;
    const host = new URL(preview.origin).host;
    assert.equal(
      (
        await raw(preview, "/infrastructure", {
          rawHeaders: [
            "Host",
            host,
            "Host",
            "example.test",
            "Connection",
            "close",
          ],
        })
      ).status,
      403,
    );
    assert.equal(backend.seen.length, before);
  });
  await withReview(
    async (preview) => {
      const asset = await raw(preview, "/_next/static/app.js");
      assert.equal(asset.status, 502);
      assert.match(asset.body, /unavailable/);
    },
    { assetHtml: true },
  );
  const backend = await disposableBackend({
    version: { oversized: "x".repeat(17000) },
  });
  try {
    await assert.rejects(createUsabilityPreview(backend));
    assert.equal(backend.seen.length, 1);
  } finally {
    await backend.close();
  }
});

test("accepts the actual client project limit=100 while conserving complete continuation and rejecting invalid limits", async () => {
  await withReview(async (preview, backend) => {
    const before = backend.seen.length;
    for (const limit of [100, 1]) {
      const ids = [];
      let cursor = null;
      do {
        const query = new URLSearchParams({ limit: String(limit) });
        if (cursor) query.set("cursor", cursor);
        const response = await raw(preview, "/api/v1/projects?" + query);
        assert.equal(response.status, 200);
        const page = JSON.parse(response.body);
        ids.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor !== null);
      assert.deepEqual(
        ids.sort(),
        fixture.projects.map((item) => item.id).sort(),
      );
      assert.equal(new Set(ids).size, fixture.projects.length);
    }
    const remainder = await raw(
      preview,
      "/api/v1/projects?" +
        new URLSearchParams({
          limit: "100",
          cursor: fixture.projects[0].id,
        }),
    );
    assert.equal(remainder.status, 200);
    const page = JSON.parse(remainder.body);
    assert.deepEqual(
      page.items.map((item) => item.id),
      fixture.projects.slice(1).map((item) => item.id),
    );
    assert.equal(page.nextCursor, null);
    for (const value of [
      "0",
      "-1",
      "101",
      "1.5",
      "1e2",
      "01",
      "",
      "NaN",
      "Infinity",
      " 100 ",
    ]) {
      const response = await raw(
        preview,
        "/api/v1/projects?" + new URLSearchParams({ limit: value }),
      );
      assert.equal(
        response.status,
        400,
        "Invalid project limit: " + JSON.stringify(value),
      );
    }
    assert.equal(
      (await raw(preview, "/api/v1/projects?limit=100&limit=1")).status,
      400,
    );
    assert.equal(backend.seen.length, before);
  });
});

test("preserves actual scoped Open/Exit wallboard page paths and private forwarding headers", async () => {
  await withReview(async (preview, backend) => {
    const scopes = [
      new URLSearchParams({ projectId: fixture.projects[0].id }),
      new URLSearchParams({ q: "Shared database" }),
      new URLSearchParams({
        projectId: fixture.projects[0].id,
        q: "Shared database + Queue? & 18%",
      }),
      new URLSearchParams({ q: "" }),
    ];
    for (const page of ["/infrastructure/wallboard", "/infrastructure"]) {
      for (const query of scopes) {
        for (const method of ["GET", "HEAD"]) {
          const path = page + "?" + query;
          const count = backend.seen.length;
          const result = await raw(preview, path, {
            method,
            headers: {
              origin: preview.origin,
              cookie: "browser-scope-cookie=never-forward",
              authorization: "Bearer never-forward",
            },
          });
          assert.equal(result.status, 200, path);
          assert.equal(backend.seen.length, count + 1);
          const upstream = backend.seen.at(-1);
          assert.equal(upstream.path, path);
          assert.equal(upstream.method, method);
          assert.equal(upstream.headers.cookie, "owned-session=backend-only");
          assert.equal(upstream.headers.authorization, undefined);
          assert.equal(upstream.headers.origin, undefined);
          assert.equal(result.headers["set-cookie"], undefined);
          if (method === "GET") {
            assert.match(result.body, /id="owned-built-page"/);
            assert.match(result.body, /SYNTHETIC LOCAL REVIEW/);
          } else assert.equal(result.body, "");
        }
      }
    }
  });
});

test("scoped pages reject unknown, duplicate and target-injection fields while assets reject every query", async () => {
  await withReview(async (preview, backend) => {
    const before = backend.seen.length;
    for (const page of ["/infrastructure/wallboard", "/infrastructure"]) {
      for (const query of [
        "projectId=",
        "projectId=not-a-uuid",
        "projectId=" +
          encodeURIComponent("https://example.test/infrastructure"),
        "projectId=" +
          fixture.projects[0].id +
          "&projectId=" +
          fixture.projects[1].id,
        "q=API&q=Queue",
        "url=" + encodeURIComponent("https://example.test/infrastructure"),
        "q=API&origin=" + encodeURIComponent("http://127.0.0.1:1"),
        "q=API&target=" + encodeURIComponent("//example.test/infrastructure"),
        new URLSearchParams({ q: "x".repeat(161) }).toString(),
      ]) {
        for (const method of ["GET", "HEAD"])
          assert.equal(
            (await raw(preview, page + "?" + query, { method })).status,
            400,
          );
      }
    }
    for (const path of ["/_next/static/app.js", "/favicon.ico"]) {
      for (const query of [
        "q=Shared+database",
        "projectId=" + fixture.projects[0].id,
        "url=https%3A%2F%2Fexample.test",
      ])
        assert.equal((await raw(preview, path + "?" + query)).status, 400);
    }
    assert.equal(backend.seen.length, before);
  });
});

test("executes the injected banner behavior across simulated fullscreen entry and exit without changing page controls", async () => {
  const { JSDOM, VirtualConsole } = await import("jsdom");
  await withReview(async (preview, backend) => {
    const response = await raw(preview, "/infrastructure/wallboard");
    assert.equal(response.status, 200);
    assert.ok(!response.body.includes(backend.credential.email));
    assert.ok(!response.body.includes(backend.credential.password));
    assert.ok(!response.body.includes("owned-session=backend-only"));
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (error) => errors.push(error.message));
    const dom = new JSDOM(response.body, {
      url: preview.origin,
      runScripts: "dangerously",
      virtualConsole,
    });
    try {
      const { document, Event } = dom.window;
      const banner = document.getElementById("synthetic-local-review");
      assert.ok(banner);
      const originalParent = banner.parentNode;
      const originalNext = banner.nextSibling;
      const originalStyle = banner.getAttribute("style");
      const originalText = banner.textContent;
      assert.ok(originalText.includes(sourceSha));
      assert.ok(originalText.includes(observatoryFixtureTime));
      assert.match(originalText, /SYNTHETIC LOCAL REVIEW/);
      assert.match(originalText, /no live ingestion/);
      assert.match(
        originalText,
        /private views and the public provider feed are unavailable/,
      );

      const console = document.createElement("div");
      console.className =
        "cmd-network-console cmd-network-wallboard cmd-network-tv";
      const canvas = document.createElement("canvas");
      const button = document.createElement("button");
      button.textContent = "Fullscreen";
      console.append(canvas, button);
      document.getElementById("owned-built-page").append(console);
      let fullscreenElement = null;
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreenElement,
      });
      assert.equal(console.contains(banner), false);
      for (let cycle = 0; cycle < 2; cycle++) {
        fullscreenElement = console;
        document.dispatchEvent(new Event("fullscreenchange"));
        assert.ok(
          console.contains(banner),
          "The active native fullscreen subtree must include the review identity and limits",
        );
        assert.equal(document.getElementById("synthetic-local-review"), banner);
        assert.equal(
          document.querySelectorAll("#synthetic-local-review").length,
          1,
        );
        assert.equal(banner.textContent, originalText);
        assert.notEqual(dom.window.getComputedStyle(banner).display, "none");
        assert.notEqual(
          dom.window.getComputedStyle(banner).visibility,
          "hidden",
        );
        assert.equal(canvas.parentNode, console);
        assert.equal(button.parentNode, console);
        assert.equal(button.textContent, "Fullscreen");
        assert.equal(button.disabled, false);

        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
        assert.equal(banner.parentNode, originalParent);
        assert.equal(banner.nextSibling, originalNext);
        assert.equal(banner.getAttribute("style"), originalStyle);
        assert.equal(banner.textContent, originalText);
        assert.equal(console.contains(banner), false);
        assert.equal(canvas.parentNode, console);
        assert.equal(button.parentNode, console);
      }
      assert.deepEqual(errors, []);
    } finally {
      dom.window.close();
    }
  });
});

test("reserves measured banner height in the fullscreen content box and restores container layout on exit", async () => {
  const { JSDOM, VirtualConsole } = await import("jsdom");
  await withReview(async (preview) => {
    const response = await raw(preview, "/infrastructure/wallboard");
    const observers = [];
    const errors = [];
    const virtualConsole = new VirtualConsole();
    virtualConsole.on("jsdomError", (error) => errors.push(error.message));
    const dom = new JSDOM(response.body, {
      url: preview.origin,
      runScripts: "dangerously",
      virtualConsole,
      beforeParse(window) {
        window.ResizeObserver = class {
          constructor(callback) {
            this.callback = callback;
            this.disconnected = false;
            observers.push(this);
          }
          observe(element) {
            this.element = element;
          }
          disconnect() {
            this.disconnected = true;
          }
        };
      },
    });
    try {
      const { document, Event } = dom.window;
      const banner = document.getElementById("synthetic-local-review");
      const originalParent = banner.parentNode;
      const originalNext = banner.nextSibling;
      const originalBannerStyle = banner.getAttribute("style");
      const originalText = banner.textContent;
      const target = document.createElement("div");
      target.className =
        "cmd-network-console cmd-network-wallboard cmd-network-tv";
      target.style.cssText =
        "padding:12px 16px 20px;box-sizing:content-box;height:600px;display:flex;flex-direction:column";
      const originalTargetStyle = target.getAttribute("style");
      const control = document.createElement("button");
      control.textContent = "Fullscreen";
      const canvas = document.createElement("canvas");
      target.append(control, canvas);
      document.getElementById("owned-built-page").append(target);
      let fullscreenElement = null;
      let bannerHeight = 64;
      banner.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        width: 1440,
        height: bannerHeight,
        right: 1440,
        bottom: bannerHeight,
      });
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        get: () => fullscreenElement,
      });
      for (let cycle = 0; cycle < 2; cycle++) {
        bannerHeight = 64;
        fullscreenElement = target;
        document.dispatchEvent(new Event("fullscreenchange"));
        assert.ok(target.contains(banner));
        const contentTop = () =>
          Number.parseFloat(dom.window.getComputedStyle(target).paddingTop);
        assert.ok(
          contentTop() >= bannerHeight + 12,
          "Fullscreen content must begin below the measured review band and original padding",
        );
        assert.equal(
          dom.window.getComputedStyle(target).boxSizing,
          "border-box",
        );
        const reservedTop = contentTop();
        document.dispatchEvent(new Event("fullscreenchange"));
        assert.equal(
          contentTop(),
          reservedTop,
          "Repeated fullscreen events must not accumulate extra space",
        );
        bannerHeight = 112;
        const observer = observers.at(-1);
        assert.equal(observer.element, banner);
        observer.callback();
        assert.ok(
          contentTop() >= bannerHeight + 12,
          "Wrapped review text must keep its full measured space",
        );
        bannerHeight = 64;
        dom.window.dispatchEvent(new Event("resize"));
        assert.equal(contentTop(), reservedTop);
        assert.equal(control.parentNode, target);
        assert.equal(canvas.parentNode, target);
        assert.equal(control.textContent, "Fullscreen");
        assert.equal(control.disabled, false);
        assert.equal(banner.textContent, originalText);

        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
        assert.equal(observer.disconnected, true);
        assert.equal(target.getAttribute("style"), originalTargetStyle);
        assert.equal(banner.parentNode, originalParent);
        assert.equal(banner.nextSibling, originalNext);
        assert.equal(banner.getAttribute("style"), originalBannerStyle);
        assert.equal(banner.textContent, originalText);
        observer.callback();
        dom.window.dispatchEvent(new Event("resize"));
        assert.equal(target.getAttribute("style"), originalTargetStyle);
        assert.equal(control.parentNode, target);
        assert.equal(canvas.parentNode, target);
      }
      assert.deepEqual(errors, []);
    } finally {
      dom.window.close();
    }
  });
});
