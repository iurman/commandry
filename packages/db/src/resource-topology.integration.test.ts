import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createResourceTopologyService } from "@commandry/application";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { createResourceTopologyRepository } from "./resource-topology-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "resource topology is cycle safe, paged, typed, and keeps one canonical project-shared resource",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const topology = createResourceTopologyService(
        createResourceTopologyRepository(database.db),
      );
      const provider = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "provider",
        name: "Local provider",
      });
      const host = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "host",
        name: "Local host",
      });
      const service = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "service",
        name: "Local service",
      });
      const databaseResource = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "database",
        name: "Local database",
      });
      const projectA = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Topology project A",
      });
      const projectB = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Topology project B",
      });
      for (const project of [projectA, projectB]) {
        assert.equal(
          await catalog.insertProjectResourceLink({
            id: crypto.randomUUID(),
            projectId: project.id,
            resourceId: service.id,
            type: "supports",
            sourceKind: "resource",
            targetKind: "project",
          }),
          true,
        );
        const page = await catalog.listProjectResourceLinks(project.id, {
          limit: 10,
        });
        assert.equal(page.items[0]?.resource.id, service.id);
      }

      assert.equal(
        (
          await topology.setParent(host.id, {
            expectedParentResourceId: null,
            parentResourceId: provider.id,
          })
        ).parentResourceId,
        provider.id,
      );
      await topology.setParent(service.id, {
        expectedParentResourceId: null,
        parentResourceId: host.id,
      });
      await topology.setParent(databaseResource.id, {
        expectedParentResourceId: null,
        parentResourceId: host.id,
      });
      await assert.rejects(
        topology.setParent(provider.id, {
          expectedParentResourceId: null,
          parentResourceId: service.id,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "HIERARCHY_CYCLE",
      );
      await assert.rejects(
        topology.setParent(host.id, {
          expectedParentResourceId: null,
          parentResourceId: databaseResource.id,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "PARENT_CONFLICT",
      );
      await assert.rejects(
        database.pool.query(
          "update resource set parent_resource_id = $1 where id = $2",
          [service.id, provider.id],
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "23514",
      );
      assert.equal(
        (await catalog.getResource(provider.id))?.parentResourceId,
        null,
      );

      const childIds: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await topology.listChildren(host.id, {
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        childIds.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(
        new Set(childIds),
        new Set([service.id, databaseResource.id]),
      );
      assert.equal(
        (await topology.listChildren(service.id, { limit: 1 })).items.length,
        0,
      );
      const rootIds: string[] = [];
      cursor = null;
      do {
        const page = await topology.listRoots({
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        rootIds.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.ok(rootIds.includes(provider.id));
      assert.equal(rootIds.includes(host.id), false);

      const relation = await topology.addDependency(service.id, {
        requiredResourceId: databaseResource.id,
      });
      assert.equal(relation.type, "depends_on");
      assert.equal(relation.inverseType, "required_by");
      assert.equal(relation.resource.id, databaseResource.id);
      await topology.addDependency(service.id, {
        requiredResourceId: provider.id,
      });
      const requiredIds: string[] = [];
      cursor = null;
      do {
        const page = await topology.listDependencies(service.id, {
          direction: "outgoing",
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        requiredIds.push(...page.items.map((item) => item.resource.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(
        new Set(requiredIds),
        new Set([databaseResource.id, provider.id]),
      );
      const incoming = await topology.listDependencies(databaseResource.id, {
        direction: "incoming",
        limit: 1,
      });
      assert.equal(incoming.items[0]?.resource.id, service.id);
      const frontend = await catalog.createResource({
        id: crypto.randomUUID(),
        kind: "service",
        name: "Local frontend",
      });
      await topology.addDependency(frontend.id, {
        requiredResourceId: service.id,
      });
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: projectA.id,
        resourceId: frontend.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
      const firstImpact = await topology.listImpact(databaseResource.id, {
        limit: 1,
      });
      assert.equal(firstImpact.maxHops, 6);
      assert.equal(firstImpact.realHealth, "unknown");
      assert.equal(firstImpact.latestSyntheticDrop, null);
      assert.ok(firstImpact.nextCursor);
      const secondImpact = await topology.listImpact(databaseResource.id, {
        limit: 1,
        cursor: firstImpact.nextCursor!,
      });
      assert.equal(secondImpact.nextCursor, null);
      const impacted = [...firstImpact.items, ...secondImpact.items];
      assert.deepEqual(
        new Set(impacted.map((item) => item.resource.id)),
        new Set([service.id, frontend.id]),
      );
      assert.deepEqual(
        impacted
          .find((item) => item.resource.id === frontend.id)
          ?.path.map((node) => node.id),
        [databaseResource.id, service.id, frontend.id],
      );
      assert.equal(
        impacted.find((item) => item.resource.id === service.id)?.projects
          .length,
        2,
      );
      await topology.addDependency(databaseResource.id, {
        requiredResourceId: frontend.id,
      });
      const cyclicImpact = await topology.listImpact(databaseResource.id, {
        limit: 10,
      });
      assert.equal(cyclicImpact.items.length, 2);
      await assert.rejects(
        topology.addDependency(service.id, {
          requiredResourceId: databaseResource.id,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "DEPENDENCY_EXISTS",
      );
      await assert.rejects(
        topology.addDependency(service.id, { requiredResourceId: service.id }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "DEPENDENCY_SELF",
      );
      assert.equal((await catalog.getResource(service.id))?.state, null);
      assert.equal(
        (await catalog.getResource(service.id))?.lastObservedAt,
        null,
      );
    } finally {
      await database.close();
    }
  },
);
