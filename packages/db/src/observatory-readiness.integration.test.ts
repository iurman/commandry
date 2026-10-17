import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import {
  createObservatoryManagementService,
  createObservatoryReadService,
  createOperationalObservationPoller,
  type OperationalObservation,
  type OperationalSourceClaim,
} from "@commandry/application";
import { createDatabase } from "./client";
import { createObservatoryManagementRepository } from "./observatory-management-repository";
import { createObservatoryOwnerReadRepository } from "./observatory-read-repository";
import { createObservatorySourceRepository } from "./observatory-source-repository";
import {
  observatoryObservation,
  observatorySource,
} from "./observatory-schema";
import {
  project,
  projectResourceLink,
  resource,
  session,
  user,
} from "./schema";

// Test-only dynamic imports exercise the actual HTTP boundary without a DB -> platform dependency.
const { createCommandryReadinessReader } = (await import(
  new URL("../../platform/src/commandry-readiness.ts", import.meta.url).href
)) as {
  createCommandryReadinessReader(options: {
    appOrigin: string;
    allowLoopbackForTests: boolean;
    now: () => Date;
  }): (claim: OperationalSourceClaim) => Promise<OperationalObservation>;
};
const { createOperationalPayloadCipher } = (await import(
  new URL("../../platform/src/operational-payload-cipher.ts", import.meta.url)
    .href
)) as {
  createOperationalPayloadCipher(key: string): {
    seal(value: unknown): Record<string, unknown>;
    open(value: unknown): unknown;
  };
};

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = password;

test("reviewed readiness observes actual HTTP failure and recovery through leased encrypted persistence", async (t) => {
  const admin = createDatabase({ connectionString: adminUrl, max: 3 });
  const runtime = createDatabase({ connectionString: runtimeUrl.href, max: 4 });
  let time = Date.now();
  const now = () => new Date(time);
  const projectId = randomUUID(),
    resourceId = randomUUID(),
    sourceId = randomUUID(),
    hostId = randomUUID(),
    userId = randomUUID(),
    sessionId = randomUUID();
  let mode: "ready" | "not_ready" | "malformed" = "ready";
  const requests: string[] = [];
  const body = () =>
    mode === "ready"
      ? { status: "ready", service: "web", database: "ready" }
      : { status: "not_ready", service: "web", database: "unavailable" };
  const server = createServer((request, response) => {
    requests.push(request.url ?? "");
    assert.equal(request.method, "GET");
    assert.equal(request.headers.authorization, undefined);
    response.writeHead(mode === "not_ready" ? 503 : 200, {
      "content-type": "application/json",
    });
    response.end(
      mode === "malformed" ? "PRIVATE_ERROR_TEXT" : JSON.stringify(body()),
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await admin.db.insert(user).values({
      id: userId,
      name: "Readiness fixture owner",
      email: `${userId}@example.test`,
    });
    const expiresAt = new Date(time + 86400000);
    await admin.db
      .insert(session)
      .values({ id: sessionId, userId, token: randomUUID(), expiresAt });
    await admin.db
      .insert(project)
      .values({ id: projectId, name: "Readiness fixture" });
    await admin.db.insert(resource).values([
      { id: resourceId, name: "Explicit web service", kind: "service" },
      { id: hostId, name: "Unrelated host", kind: "host" },
    ]);
    await admin.db.insert(projectResourceLink).values(
      [resourceId, hostId].map((id) => ({
        id: randomUUID(),
        projectId,
        resourceId: id,
        type: "supports" as const,
        sourceKind: "resource" as const,
        targetKind: "project" as const,
        lifecycle: "active" as const,
      })),
    );
    const identity = {
      principalId: `user:${userId}`,
      sessionId,
      expiresAt: expiresAt.toISOString(),
    };
    const management = createObservatoryManagementService(
      createObservatoryManagementRepository(runtime.db, now),
    );
    const read = createObservatoryReadService(
      createObservatoryOwnerReadRepository(runtime.db, {
        environment: "test",
        now,
      }),
      { environment: "test", now },
    );
    const review = {
      evidenceRefs: ["fixture:explicit-web-binding"],
      note: "Reviewed this actual synthetic web service",
    };
    const binding = {
      id: sourceId,
      resourceId,
      projectId,
      environment: "test",
      expectedVersion: 0,
      kind: "http-readiness",
      externalId: "commandry-web-readiness",
      freshnessSeconds: 300,
      enabled: false,
      review,
    };
    const cipher = createOperationalPayloadCipher(
      "synthetic_32_character_readiness_encryption_key",
    );
    const repository = createObservatorySourceRepository(runtime.db, {
      kinds: ["http-readiness"],
      sealOriginal: cipher.seal,
      now,
      jitterSeconds: () => 0,
    });
    const reader = createCommandryReadinessReader({
      appOrigin: `http://127.0.0.1:${address.port}`,
      allowLoopbackForTests: true,
      now,
    });
    const poller = createOperationalObservationPoller(repository, reader, {
      now,
    });
    const evidence = () =>
      read.operationalEvidence(
        { identity, projectId },
        { projectId, resourceId, facet: "availability" },
      );
    const scene = () => read.scene({ identity, projectId }, { projectId });
    const history = () =>
      runtime.db
        .select()
        .from(observatoryObservation)
        .where(eq(observatoryObservation.sourceId, sourceId));
    const source = async () =>
      (
        await runtime.db
          .select()
          .from(observatorySource)
          .where(eq(observatorySource.id, sourceId))
      )[0]!;
    const due = async () => {
      time += 301000;
      await runtime.db
        .update(observatorySource)
        .set({ nextAttemptAt: now() })
        .where(eq(observatorySource.id, sourceId));
      assert.equal(await poller.pollNext(), true);
    };
    await t.test(
      "disabled and wrong target bindings cannot observe or declare availability",
      async () => {
        await assert.rejects(
          management.review(identity, "source", {
            ...binding,
            id: randomUUID(),
            resourceId: hostId,
          }),
          { code: "INVALID_REFERENCE" },
        );
        await management.review(identity, "source", binding);
        assert.equal(await poller.pollNext(), false);
        assert.equal(requests.length, 0);
        assert.equal((await evidence()).access, "disabled");
        assert.equal(
          (await scene()).scene.signals.filter(
            (item) => item.facet === "availability",
          ).length,
          0,
        );
      },
    );
    await management.review(identity, "source", {
      ...binding,
      expectedVersion: 1,
      enabled: true,
    });
    await t.test(
      "concurrent claims lease one source and persist its actual passing result once",
      async () => {
        const claims = (
          await Promise.all([
            repository.claim(),
            repository.claim(),
            repository.claim(),
          ])
        ).filter((item) => item !== null);
        assert.equal(claims.length, 1);
        const observed = await reader(claims[0]!);
        await repository.complete(claims[0]!, observed);
        const rows = await history();
        assert.equal(rows.length, 1);
        assert.deepEqual(cipher.open(rows[0]!.rawPayload), body());
        assert.notDeepEqual(rows[0]!.rawPayload, body());
        const result = await evidence();
        assert.equal(result.facet, "availability");
        assert.equal(result.items[0]!.kind, "http-readiness");
        assert.equal(result.items[0]!.freshness, "fresh");
        assert.equal(
          (await scene()).scene.signals.find(
            (item) => item.sourceId === sourceId,
          )?.state,
          "passing",
        );
      },
    );
    await t.test(
      "valid 503 establishes failure and a malformed later read retains that evidence with unavailable coverage",
      async () => {
        mode = "not_ready";
        await due();
        assert.equal(
          (await scene()).scene.signals.find(
            (item) => item.sourceId === sourceId,
          )?.state,
          "failing",
        );
        assert.equal((await history()).length, 2);
        const observedAt = (await evidence()).items[0]!.observedAt;
        mode = "malformed";
        await due();
        const failed = await evidence();
        assert.equal(failed.access, "unavailable");
        assert.equal(failed.items[0]!.observedAt, observedAt);
        assert.equal((await history()).length, 2);
        assert.equal(
          (await source()).lastError,
          "OPERATIONAL_INVALID_RESPONSE",
        );
        assert.ok(!JSON.stringify(failed).includes("PRIVATE_ERROR_TEXT"));
      },
    );
    await t.test(
      "recovery creates a new real passing check and later reads cannot freshen it",
      async () => {
        mode = "ready";
        await due();
        const recovered = await evidence();
        assert.equal(recovered.access, "available");
        assert.equal((await history()).length, 3);
        assert.equal(
          (await scene()).scene.signals.find(
            (item) => item.sourceId === sourceId,
          )?.state,
          "passing",
        );
        time += 301000;
        const stale = await evidence();
        assert.equal(stale.items[0]!.freshness, "stale");
        assert.equal(
          stale.items[0]!.observedAt,
          recovered.items[0]!.observedAt,
        );
        assert.ok(requests.every((path) => path === "/health/ready"));
      },
    );
    await t.test("reviewed deployment monitors remain claimable", async () => {
      const deploymentId = randomUUID();
      await admin.db.insert(resource).values({
        id: deploymentId,
        name: "Explicit synthetic deployment",
        kind: "deployment",
      });
      await admin.db.insert(projectResourceLink).values({
        id: randomUUID(),
        projectId,
        resourceId: deploymentId,
        type: "supports",
        sourceKind: "resource" as const,
        targetKind: "project" as const,
        lifecycle: "active",
      });
      await management.review(identity, "source", {
        ...binding,
        id: randomUUID(),
        resourceId: deploymentId,
        kind: "infraagent-monitor",
        externalId: "synthetic-monitor",
        enabled: true,
      });
      const monitorRepository = createObservatorySourceRepository(runtime.db, {
        kinds: ["infraagent-monitor"],
        sealOriginal: cipher.seal,
        now,
      });
      const claim = await monitorRepository.claim();
      assert.equal(claim?.resourceId, deploymentId);
      assert.equal(claim?.kind, "infraagent-monitor");
    });
  } finally {
    // This fixture's optional legacy monitor must not become work for another test's global poller.
    await admin.db
      .update(observatorySource)
      .set({ enabled: false, leaseId: null, leaseUntil: null })
      .where(eq(observatorySource.projectId, projectId));
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await runtime.close();
    await admin.close();
  }
});
