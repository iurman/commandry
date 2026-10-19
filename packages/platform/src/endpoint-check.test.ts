import { mkdtemp, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { describe, expect, it } from "vitest";
import {
  createEndpointCheckReader,
  readEndpointCheckCatalogue,
  endpointCheckCatalogueSchema,
} from "./endpoint-check";
import type { OperationalSourceClaim } from "@commandry/application";

const resourceId = "11111111-1111-4111-8111-111111111111";
const claim: OperationalSourceClaim = {
  id: "check-source",
  leaseId: "leased",
  resourceId,
  kind: "endpoint-check",
  externalId: "web",
  environment: "production",
  freshnessSeconds: 60,
};
const http = {
  id: "web",
  resourceId,
  environment: "production",
  protocol: "http" as const,
  vantage: "Electra worker",
  timeoutMs: 100,
  url: "https://example.test/",
  acceptedStatuses: [200],
};
const catalogue = { schemaVersion: 1 as const, checks: [http] };

describe("operator-configured endpoint probes", () => {
  it("reads actual HTTP status without credentials or following redirects and discards bodies", async () => {
    let requestPath = "";
    let cookie: string | undefined;
    let authorization: string | undefined;
    let status = 302;
    const server = createServer((request, response) => {
      requestPath = request.url ?? "";
      cookie = request.headers.cookie;
      authorization = request.headers.authorization;
      response.writeHead(status, { location: "/never-follow" });
      response.end("PRIVATE_BODY_IS_NOT_EVIDENCE");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test listener");
    try {
      const read = createEndpointCheckReader({
        catalogue: {
          ...catalogue,
          checks: [
            {
              ...http,
              timeoutMs: 3000,
              url: `http://127.0.0.1:${address.port}/check`,
            },
          ],
        },
      });
      const redirect = await read(claim);
      expect(redirect.signals[0]?.state).toBe("failing");
      expect(redirect.details.latestCheck).toMatchObject({ statusCode: 302 });
      expect(requestPath).toBe("/check");
      expect(cookie).toBeUndefined();
      expect(authorization).toBeUndefined();
      expect(JSON.stringify(redirect)).not.toContain("PRIVATE_BODY");
      status = 200;
      const up = await read(claim);
      expect(up.signals[0]?.state).toBe("passing");
      expect(up.details.probe).toMatchObject({
        protocol: "http",
        vantage: "Electra worker",
      });
      expect(up.observedAt).toBe(
        (up.details.latestCheck as { checkedAt: string }).checkedAt,
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it("rejects unknown identity, wrong resource or environment before any network call", async () => {
    let calls = 0;
    const read = createEndpointCheckReader({
      catalogue,
      fetch: async () => {
        calls++;
        return new Response();
      },
    });
    for (const modified of [
      { externalId: "other" },
      { resourceId: "22222222-2222-4222-8222-222222222222" },
      { environment: "development" },
    ])
      await expect(read({ ...claim, ...modified })).rejects.toMatchObject({
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    expect(calls).toBe(0);
  });

  it("bounds a stalled fetch even when abort is ignored, and retains a failed timed check", async () => {
    const read = createEndpointCheckReader({
      catalogue,
      fetch: () => new Promise(() => {}),
    });
    const start = Date.now();
    const result = await read(claim);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(result.signals[0]?.state).toBe("failing");
    expect(result.details.latestCheck).toMatchObject({
      statusCode: null,
      status: "down",
    });
  });

  it("redacts transport errors and leaves DNS/TLS failures unavailable", async () => {
    const read = createEndpointCheckReader({
      catalogue,
      fetch: async () => {
        throw new Error("PRIVATE_TARGET_SECRET");
      },
    });
    await expect(read(claim)).rejects.toMatchObject({
      message: "OPERATIONAL_UNAVAILABLE",
    });
  });

  it("observes actual TCP acceptance and refusal without calling it application readiness", async () => {
    const server = createTcpServer((socket) => socket.end());
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing test listener");
    const read = createEndpointCheckReader({
      catalogue: {
        schemaVersion: 1,
        checks: [
          {
            id: "web",
            resourceId,
            environment: "production",
            protocol: "tcp",
            host: "127.0.0.1",
            port: address.port,
            vantage: "Loopback fixture",
            timeoutMs: 1000,
          },
        ],
      },
    });
    try {
      expect((await read(claim)).signals[0]?.state).toBe("passing");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
    const refused = await read(claim);
    expect(refused.signals[0]?.state).toBe("failing");
    expect(refused.details.probe).toMatchObject({ protocol: "tcp" });
    expect(refused.details.latestCheck).toMatchObject({ statusCode: null });
  });

  it("rejects credentials, query secrets, invalid protocols and duplicate identities", () => {
    for (const url of [
      "file:///etc/passwd",
      "https://user:password@example.test",
      "https://example.test/?token=secret",
      "https://example.test/#secret",
    ])
      expect(
        endpointCheckCatalogueSchema.safeParse({
          ...catalogue,
          checks: [{ ...http, url }],
        }).success,
      ).toBe(false);
    expect(
      endpointCheckCatalogueSchema.safeParse({
        ...catalogue,
        checks: [http, http],
      }).success,
    ).toBe(false);
  });

  it("requires a private regular startup file and refuses links and malformed catalogues", async () => {
    const directory = await mkdtemp(join(tmpdir(), "commandry-endpoint-test-"));
    const path = join(directory, "checks.json");
    try {
      await writeFile(path, JSON.stringify(catalogue), { mode: 0o600 });
      expect((await readEndpointCheckCatalogue(path)).checks).toHaveLength(1);
      const link = join(directory, "link");
      await symlink(path, link);
      await expect(readEndpointCheckCatalogue(link)).rejects.toMatchObject({
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
      await chmod(path, 0o644);
      await expect(readEndpointCheckCatalogue(path)).rejects.toMatchObject({
        code: "OPERATIONAL_CONFIGURATION_INVALID",
      });
      await chmod(path, 0o600);
      await writeFile(path, "private malformed text");
      await expect(readEndpointCheckCatalogue(path)).rejects.toMatchObject({
        message: "OPERATIONAL_CONFIGURATION_INVALID",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

it("records a configured checking origin only in backward-compatible original metadata", async () => {
  const originResourceId = "22222222-2222-4222-8222-222222222222";
  for (const status of [200, 502]) {
    const result = await createEndpointCheckReader({
      catalogue,
      originResourceId,
      fetch: async () => new Response(null, { status }),
    })(claim);
    expect(result.rawPayload).toMatchObject({
      probeTransport: {
        originResourceId,
        protocol: "http",
        responseReceived: true,
        responseTimeMs: expect.any(Number),
      },
    });
    expect(result.signals[0]).not.toHaveProperty("probe");
    expect(result.details.probe).not.toHaveProperty("originResourceId");
  }
  const timeout = await createEndpointCheckReader({
    catalogue,
    originResourceId,
    fetch: () => new Promise(() => {}),
  })(claim);
  expect(timeout.rawPayload).toMatchObject({
    probeTransport: { responseReceived: false },
  });
});
