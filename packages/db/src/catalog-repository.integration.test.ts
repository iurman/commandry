import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test("PostgreSQL catalog keeps canonical resources and typed links", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  try {
    const catalog = createCatalogRepository(database.db);
    const projectIds = [crypto.randomUUID(), crypto.randomUUID()].sort();
    const resourceIds = [crypto.randomUUID(), crypto.randomUUID()].sort();
    for (const [index, id] of projectIds.entries()) {
      const created = await catalog.createProject({
        id,
        name: `Catalog test project ${index + 1}`,
      });
      assert.equal(created.type, "general");
      assert.equal(created.lifecycle, "active");
    }
    for (const [index, id] of resourceIds.entries()) {
      const created = await catalog.createResource({
        id,
        kind: "document",
        name: `Catalog test resource ${index + 1}`,
      });
      assert.equal(created.state, null);
      assert.equal(created.lastObservedAt, null);
    }

    assert.deepEqual(
      (await catalog.getProject(projectIds[0]!))?.id,
      projectIds[0],
    );
    assert.deepEqual(
      (await catalog.getResource(resourceIds[0]!))?.id,
      resourceIds[0],
    );

    const firstProjects = await catalog.listProjects({ limit: 1 });
    assert.equal(firstProjects.items.length, 1);
    assert.ok(firstProjects.nextCursor);
    const laterProjects = await catalog.listProjects({
      limit: 1,
      cursor: firstProjects.nextCursor,
    });
    assert.equal(laterProjects.items.length, 1);
    assert.notEqual(laterProjects.items[0]!.id, firstProjects.items[0]!.id);

    const firstResources = await catalog.listResources({ limit: 1 });
    assert.equal(firstResources.items.length, 1);
    assert.ok(firstResources.nextCursor);
    const laterResources = await catalog.listResources({
      limit: 1,
      cursor: firstResources.nextCursor,
    });
    assert.equal(laterResources.items.length, 1);
    assert.notEqual(laterResources.items[0]!.id, firstResources.items[0]!.id);

    const firstLink = {
      id: crypto.randomUUID(),
      projectId: projectIds[0]!,
      resourceId: resourceIds[0]!,
      type: "supports" as const,
      sourceKind: "resource" as const,
      targetKind: "project" as const,
    };
    assert.equal(await catalog.insertProjectResourceLink(firstLink), true);
    assert.equal(
      await catalog.insertProjectResourceLink({
        ...firstLink,
        id: crypto.randomUUID(),
      }),
      false,
    );
    assert.equal(
      await catalog.insertProjectResourceLink({
        ...firstLink,
        id: crypto.randomUUID(),
        projectId: projectIds[1]!,
      }),
      true,
    );
    assert.equal(
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: projectIds[0]!,
        resourceId: resourceIds[1]!,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
      }),
      true,
    );

    const firstLinks = await catalog.listProjectResourceLinks(projectIds[0]!, {
      limit: 1,
    });
    assert.equal(firstLinks.items.length, 1);
    assert.ok(firstLinks.nextCursor);
    const laterLinks = await catalog.listProjectResourceLinks(projectIds[0]!, {
      limit: 1,
      cursor: firstLinks.nextCursor,
    });
    assert.equal(laterLinks.items.length, 1);
    assert.notEqual(firstLinks.items[0]!.id, laterLinks.items[0]!.id);
    const secondProjectLinks = await catalog.listProjectResourceLinks(
      projectIds[1]!,
      { limit: 10 },
    );
    assert.equal(secondProjectLinks.items[0]?.resource.id, resourceIds[0]);
    assert.equal(secondProjectLinks.items[0]?.inverseType, "supported_by");

    await assert.rejects(
      catalog.insertProjectResourceLink({
        ...firstLink,
        id: crypto.randomUUID(),
        resourceId: crypto.randomUUID(),
      }),
      (error: unknown) => {
        const cause = error instanceof Error ? error.cause : null;
        return (
          cause instanceof Error && "code" in cause && cause.code === "23503"
        );
      },
    );
    await assert.rejects(
      catalog.insertProjectResourceLink({
        ...firstLink,
        id: crypto.randomUUID(),
        sourceKind: "project",
      }),
      /direction does not match/,
    );
  } finally {
    await database.close();
  }
});
