import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCaptureService,
  createSavedViewService,
} from "@commandry/application";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createSavedViewRepository } from "./saved-view-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("saved Work and Knowledge views keep current scoped queries and an audited lifecycle", async () => {
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const catalog = createCatalogRepository(database.db);
    const captures = createCaptureService(createCaptureRepository(database.db));
    const views = createSavedViewService(
      createSavedViewRepository(database.db),
    );
    const project = await catalog.createProject({
      id: crypto.randomUUID(),
      name: `Saved view project ${crypto.randomUUID()}`,
    });
    const source = await captures.createCapture({
      inputType: "text",
      originalContent: "One local runbook and one task",
    });
    const runbook = await captures.fileCapture(source.id, {
      projectId: project.id,
      kind: "note",
      knowledgeType: "runbook",
      title: "Restart procedure",
      body: "Local source-backed steps",
    });
    assert.equal("kind" in runbook.record && runbook.record.kind, "runbook");
    const taskSource = await captures.createCapture({
      inputType: "text",
      originalContent: "Review the restart procedure",
    });
    const task = await captures.fileCapture(taskSource.id, {
      projectId: project.id,
      kind: "task",
      title: "Review procedure",
    });
    const work = await views.create({
      name: "My open board",
      definition: {
        surface: "work",
        projectId: project.id,
        presentation: "board",
        status: "open",
        priority: "all",
        assignee: "all",
        due: "all",
      },
    });
    const knowledge = await views.create({
      name: "Runbooks",
      definition: {
        surface: "knowledge",
        projectId: project.id,
        kind: "runbook",
      },
    });
    assert.equal(
      (await views.list({ surface: "work", limit: 10 })).items.some(
        (item) => item.id === work.id,
      ),
      true,
    );
    assert.equal(
      (await views.list({ surface: "knowledge", limit: 10 })).items.some(
        (item) => item.id === knowledge.id,
      ),
      true,
    );
    assert.equal(
      (
        await captures.listKnowledge({
          projectId: knowledge.definition.projectId ?? undefined,
          kind: "runbook",
          limit: 10,
        })
      ).items.some((item) => item.id === runbook.record.id),
      true,
    );
    assert.equal(
      (
        await captures.listWork({
          projectId: work.definition.projectId ?? undefined,
          status: "open",
          limit: 10,
        })
      ).items.some((item) => item.id === task.record.id),
      true,
    );
    if (work.definition.surface !== "work")
      throw new Error("Expected a saved Work query");
    const updated = await views.update(work.id, {
      expectedVersion: work.version,
      name: "All project work",
      definition: { ...work.definition, presentation: "list", status: "all" },
    });
    assert.equal(updated.version, 2);
    await assert.rejects(
      views.update(work.id, {
        expectedVersion: work.version,
        name: "Stale",
        definition: work.definition,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "SAVED_VIEW_CONFLICT",
    );
    const archived = await views.archive(work.id, updated.version);
    assert.equal(archived.lifecycle, "archived");
    assert.equal(
      (await views.list({ surface: "work", limit: 100 })).items.some(
        (item) => item.id === work.id,
      ),
      false,
    );
    const history = await views.listAudit({ id: work.id, limit: 10 });
    assert.deepEqual(
      history.items.map((entry) => entry.operation),
      ["archived", "updated", "created"],
    );
    assert.deepEqual(
      history.items.map((entry) => entry.version),
      [3, 2, 1],
    );
  } finally {
    await database.close();
  }
});
