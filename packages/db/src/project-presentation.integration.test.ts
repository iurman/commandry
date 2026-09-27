import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { CatalogError, createCatalogService } from "@commandry/application";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("Run this file through pnpm test:integration");
}

test("project view settings keep hidden records, serialize edits, and retain immutable history", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 4 });
  try {
    const catalog = createCatalogService(createCatalogRepository(database.db));
    const project = await catalog.createProject({
      name: "Garden",
      type: "personal",
    });
    const defaultView = await catalog.getProjectPresentation(project.id);
    assert.equal(defaultView.version, 1);
    assert.ok(defaultView.visibleAreas.includes("work"));
    const revised = await catalog.updateProjectPresentation(project.id, {
      expectedVersion: 1,
      overviewCards: ["work", "state"],
      visibleAreas: ["knowledge", "work"],
    });
    assert.equal(revised.version, 2);
    assert.deepEqual(revised.overviewCards, ["work", "state"]);
    const unchanged = await catalog.updateProjectPresentation(project.id, {
      expectedVersion: 2,
      overviewCards: ["work", "state"],
      visibleAreas: ["knowledge", "work"],
    });
    assert.equal(unchanged.version, 2);
    const races = await Promise.allSettled([
      catalog.updateProjectPresentation(project.id, {
        expectedVersion: 2,
        overviewCards: ["state"],
        visibleAreas: ["work"],
      }),
      catalog.updateProjectPresentation(project.id, {
        expectedVersion: 2,
        overviewCards: ["knowledge"],
        visibleAreas: ["knowledge"],
      }),
    ]);
    assert.equal(races.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(races.filter((item) => item.status === "rejected").length, 1);
    const rejected = races.find((item) => item.status === "rejected");
    assert.ok(rejected?.reason instanceof CatalogError);
    assert.equal(rejected.reason.code, "PROJECT_VERSION_CONFLICT");
    const current = await catalog.getProjectPresentation(project.id);
    assert.equal(current.version, 3);
    assert.equal((await catalog.getProject(project.id))?.name, "Garden");

    const newest = await catalog.listProjectPresentationEvents(project.id, {
      limit: 1,
    });
    assert.deepEqual(
      newest.items.map((item) => item.version),
      [3],
    );
    assert.equal(newest.nextCursor, 3);
    const older = await catalog.listProjectPresentationEvents(project.id, {
      limit: 1,
      beforeVersion: 3,
    });
    assert.deepEqual(
      older.items.map((item) => item.version),
      [2],
    );
    assert.equal(older.nextCursor, null);
    const exact = await catalog.getProjectPresentationEvent(project.id, 2);
    assert.equal(exact?.previous.version, 1);
    assert.deepEqual(exact?.current.visibleAreas, ["knowledge", "work"]);
    assert.equal(exact?.actor, "local-user:unattributed");
    await assert.rejects(
      database.pool.query(
        "UPDATE project_presentation_event SET actor = 'tampered' WHERE id = $1",
        [exact?.id],
      ),
      /append-only/,
    );
    await assert.rejects(
      database.pool.query(
        "DELETE FROM project_presentation_event WHERE id = $1",
        [exact?.id],
      ),
      /append-only/,
    );
  } finally {
    await database.close();
  }
});
