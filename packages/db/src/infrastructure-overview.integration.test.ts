import assert from "node:assert/strict";
import { test } from "node:test";
import { createInfrastructureOverviewService } from "@commandry/application";
import { createDatabase } from "./client";
import { createInfrastructureOverviewRepository } from "./infrastructure-overview-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createRealIntegrationRepository } from "./real-integration-repository";
import { createResourceTopologyRepository } from "./resource-topology-repository";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!adminUrl) throw new Error("Run through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD!;
test("overview preserves real evidence, cross-project identity, typed edges and complete scoped pagination", async () => {
  const database = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 3,
  });
  const catalog = createCatalogRepository(database.db);
  const sources = createRealIntegrationRepository(database.db);
  const topology = createResourceTopologyRepository(database.db);
  const service = createInfrastructureOverviewService(
    createInfrastructureOverviewRepository(database.db),
  );
  try {
    const first = await catalog.createProject({
      id: crypto.randomUUID(),
      name: "Network scope A",
    });
    const second = await catalog.createProject({
      id: crypto.randomUUID(),
      name: "Network scope B",
    });
    const host = await catalog.createResource({
      id: crypto.randomUUID(),
      name: "Network host 100%_exact",
      kind: "host",
    });
    const web = await catalog.createResource({
      id: crypto.randomUUID(),
      name: "Network web",
      kind: "service",
    });
    for (const project of [first, second])
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: project.id,
        resourceId: host.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
    await catalog.insertProjectResourceLink({
      id: crypto.randomUUID(),
      projectId: first.id,
      resourceId: web.id,
      type: "supports",
      sourceKind: "resource",
      targetKind: "project",
    });
    await topology.setParent(web.id, {
      parentResourceId: host.id,
      expectedParentResourceId: null,
    });
    await topology.addDependency(web.id, { requiredResourceId: host.id });
    const source = (await sources.create(
      {
        name: "Network real host",
        kind: "linux-host",
        projectId: first.id,
        resourceId: host.id,
        identifier: "network-host",
        freshnessWindowMinutes: 5,
      },
      "test:overview",
    ))!;
    const token = await sources.rotateToken(source.id, "test:overview");
    await sources.receive(source.id, token.token, {
      hostname: "network-host",
      sampleId: crypto.randomUUID(),
      observedAt: new Date(Date.now() - 1000).toISOString(),
      memory: { totalBytes: 1000, availableBytes: 500 },
      disk: { totalBytes: 1000, availableBytes: 250 },
      uptimeSeconds: 500,
      load1Milli: 1500,
    });
    // An older arriving sample must not replace current metrics.
    await sources.receive(source.id, token.token, {
      hostname: "network-host",
      sampleId: crypto.randomUUID(),
      observedAt: new Date(Date.now() - 3600000).toISOString(),
      memory: { totalBytes: 1000, availableBytes: 100 },
      disk: { totalBytes: 1000, availableBytes: 100 },
      uptimeSeconds: 100,
      load1Milli: 500,
    });
    const all = await service.read({ limit: 12, q: "", projectId: first.id });
    assert.equal(all.total, 2);
    const observed = all.items.find((item) => item.id === host.id)!;
    assert.equal(observed.projects.length, 2);
    assert.equal(observed.telemetry, "reporting");
    assert.equal(observed.health, "unknown");
    assert.equal(
      observed.metrics.find((metric) => metric.name === "host_memory_used")
        ?.value,
      50,
    );
    assert.ok(
      observed.metrics.every((metric) =>
        metric.evidenceHref.startsWith("/api/v1/source-envelopes/"),
      ),
    );
    assert.equal(
      all.items.find((item) => item.id === web.id)?.telemetry,
      "unknown",
    );
    assert.ok(
      all.edges.some(
        (edge) =>
          edge.from === host.id &&
          edge.to === web.id &&
          edge.type === "contains",
      ),
    );
    assert.ok(
      all.edges.some(
        (edge) =>
          edge.from === web.id &&
          edge.to === host.id &&
          edge.type === "depends_on",
      ),
    );
    assert.equal(all.events.length, 2);
    const page1 = await service.read({ limit: 1, q: "", projectId: first.id });
    assert.ok(page1.nextCursor);
    const page2 = await service.read({
      limit: 1,
      q: "",
      projectId: first.id,
      cursor: page1.nextCursor,
    });
    assert.equal(page2.nextCursor, null);
    assert.equal(
      new Set([...page1.items, ...page2.items].map((item) => item.id)).size,
      2,
    );
    assert.equal(
      (await service.read({ limit: 12, q: "", projectId: second.id })).total,
      1,
    );
    assert.equal(
      (await service.read({ limit: 12, q: "100%_exact", projectId: first.id }))
        .total,
      1,
    );
    assert.equal(
      (
        await service.read({
          limit: 12,
          q: "No such service",
          projectId: first.id,
        })
      ).total,
      0,
    );
    await sources.setEnabled(source.id, false, "test:overview");
    assert.equal(
      (
        await service.read({ limit: 12, q: "", projectId: first.id })
      ).items.find((item) => item.id === host.id)?.telemetry,
      "disabled",
    );
  } finally {
    await database.close();
  }
});
