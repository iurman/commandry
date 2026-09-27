import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { CatalogError, createCatalogService } from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("Run this file through pnpm test:integration");
}

test("project edits update one current record and retain immutable paged versions", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const catalog = createCatalogService(createCatalogRepository(database.db));
    const created = await catalog.createProject({
      name: "Garden plan",
      summary: "Collect ideas",
      type: "personal",
    });
    assert.equal(created.version, 1);
    const revised = await catalog.updateProject(created.id, {
      expectedVersion: 1,
      name: "Autumn garden",
      summary: "Plant and track supplies",
      type: "personal",
      lifecycle: "active",
    });
    assert.equal(revised.version, 2);
    assert.equal(revised.name, "Autumn garden");

    const noChange = await catalog.updateProject(created.id, {
      expectedVersion: 2,
      name: revised.name,
      summary: revised.summary,
      type: revised.type,
      lifecycle: revised.lifecycle,
    });
    assert.equal(noChange.version, 2);
    await assert.rejects(
      catalog.updateProject(created.id, {
        expectedVersion: 1,
        name: "Stale name",
        summary: "Would overwrite",
        type: "personal",
        lifecycle: "paused",
      }),
      (error: unknown) =>
        error instanceof CatalogError &&
        error.code === "PROJECT_VERSION_CONFLICT",
    );
    const final = await catalog.updateProject(created.id, {
      expectedVersion: 2,
      name: revised.name,
      summary: null,
      type: "home",
      lifecycle: "paused",
    });
    assert.equal(final.version, 3);

    const page = await catalog.listProjectMetadataEvents(created.id, {
      limit: 1,
    });
    assert.deepEqual(
      page.items.map((item) => item.version),
      [3],
    );
    assert.equal(page.nextCursor, 3);
    assert.ok(page.nextCursor);
    assert.deepEqual(page.items[0]?.changedFields, [
      "summary",
      "type",
      "lifecycle",
    ]);
    const older = await catalog.listProjectMetadataEvents(created.id, {
      limit: 1,
      beforeVersion: page.nextCursor,
    });
    assert.deepEqual(
      older.items.map((item) => item.version),
      [2],
    );
    assert.equal(older.nextCursor, null);
    const exact = await catalog.getProjectMetadataEvent(created.id, 2);
    assert.equal(exact?.previous.name, "Garden plan");
    assert.equal(exact?.current.name, "Autumn garden");
    assert.equal(exact?.actor, "local-user:unattributed");

    const current = await catalog.getProject(created.id);
    assert.equal(current?.name, "Autumn garden");
    assert.equal(current?.version, 3);
    const listing = await catalog.listProjects({ limit: 100 });
    assert.equal(
      listing.items.find((item) => item.id === created.id)?.lifecycle,
      "paused",
    );
    const snapshot = await createBriefRepository(
      database.db,
    ).readProjectSnapshot(created.id, { limit: 5 });
    assert.equal(snapshot?.project.name, "Autumn garden");
    assert.equal(snapshot?.project.summary, null);
    assert.equal(snapshot?.project.lifecycle, "paused");

    await assert.rejects(
      database.pool.query(
        "UPDATE project_metadata_event SET actor = 'tampered' WHERE id = $1",
        [exact?.id],
      ),
      /append-only/,
    );
    await assert.rejects(
      database.pool.query("DELETE FROM project_metadata_event WHERE id = $1", [
        exact?.id,
      ]),
      /append-only/,
    );
  } finally {
    await database.close();
  }
});
