import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { createCatalogRepository } from "./catalog-repository";
import { createCaptureRepository } from "./capture-repository";
import { createDatabase } from "./client";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test("manual captures preserve source while filing and search stay linked", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 2 });
  try {
    const catalog = createCatalogRepository(database.db);
    const captures = createCaptureRepository(database.db);
    const token = `campaign${crypto.randomUUID().replaceAll("-", "")}`;
    const project = await catalog.createProject({
      id: crypto.randomUUID(),
      name: `${token} Garden`,
    });
    const otherProject = await catalog.createProject({
      id: crypto.randomUUID(),
      name: "Unrelated workspace",
    });
    const resource = await catalog.createResource({
      id: crypto.randomUUID(),
      kind: "document",
      name: `${token} reference`,
    });
    assert.equal(
      await catalog.insertProjectResourceLink({
        id: crypto.randomUUID(),
        projectId: project.id,
        resourceId: resource.id,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
      }),
      true,
    );

    const original = `  ${token} Replace the garden timer.\nKeep this exact line.  `;
    const firstCapture = await captures.createCapture({
      id: crypto.randomUUID(),
      inputType: "text",
      originalContent: original,
    });
    assert.equal(firstCapture.originalContent, original);
    assert.equal(firstCapture.source, "manual-local");
    assert.equal(firstCapture.state, "unfiled");
    const task = await captures.fileAsTask({
      captureId: firstCapture.id,
      recordId: crypto.randomUUID(),
      projectId: project.id,
      title: `${token} replace timer`,
      description: original,
    });
    assert.equal(task.record.sourceCaptureId, firstCapture.id);
    assert.equal(task.record.description, original);
    assert.equal(task.capture.originalContent, original);
    assert.equal(task.capture.filedRecord?.id, task.record.id);
    assert.equal(task.capture.projectId, project.id);
    assert.equal(task.capture.state, "filed");

    await assert.rejects(
      captures.fileAsTask({
        captureId: firstCapture.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "duplicate",
        description: original,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CAPTURE_ALREADY_FILED",
    );
    await assert.rejects(
      database.pool.query(
        "update capture set original_content = $1 where id = $2",
        ["rewritten", firstCapture.id],
      ),
      (error: unknown) =>
        error instanceof Error && "code" in error && error.code === "23514",
    );
    assert.equal(
      (await captures.getCapture(firstCapture.id))?.originalContent,
      original,
    );

    const originalUrl = `https://example.test/${token}?q=Original%20Case`;
    const urlCapture = await captures.createCapture({
      id: crypto.randomUUID(),
      inputType: "url",
      originalContent: originalUrl,
    });
    const note = await captures.fileAsNote({
      captureId: urlCapture.id,
      recordId: crypto.randomUUID(),
      projectId: project.id,
      title: `${token} source link`,
      content: originalUrl,
    });
    assert.equal(note.record.sourceCaptureId, urlCapture.id);
    assert.equal(note.record.content, originalUrl);
    assert.equal(note.capture.originalContent, originalUrl);

    const thirdCapture = await captures.createCapture({
      id: crypto.randomUUID(),
      inputType: "text",
      originalContent: `${token} check wiring`,
    });
    await captures.fileAsTask({
      captureId: thirdCapture.id,
      recordId: crypto.randomUUID(),
      projectId: project.id,
      title: `${token} wiring`,
      description: thirdCapture.originalContent,
    });

    const inboxFirst = await captures.listCaptures({ limit: 1 });
    assert.equal(inboxFirst.items.length, 1);
    assert.ok(inboxFirst.nextCursor);
    const inboxSecond = await captures.listCaptures({
      limit: 1,
      cursor: inboxFirst.nextCursor,
    });
    assert.equal(inboxSecond.items.length, 1);
    assert.notEqual(inboxSecond.items[0]?.id, inboxFirst.items[0]?.id);

    const firstWorkPage = await captures.listProjectWork(project.id, {
      limit: 1,
    });
    assert.equal(firstWorkPage.items.length, 1);
    assert.ok(firstWorkPage.nextCursor);
    const nextWorkPage = await captures.listProjectWork(project.id, {
      limit: 1,
      cursor: firstWorkPage.nextCursor,
    });
    assert.equal(nextWorkPage.items.length, 1);
    assert.notEqual(nextWorkPage.items[0]?.id, firstWorkPage.items[0]?.id);
    assert.equal(
      (await captures.listProjectKnowledge(project.id, { limit: 10 })).items[0]
        ?.id,
      note.record.id,
    );

    const found = [];
    let cursor: string | null = null;
    do {
      const page = await captures.search({
        q: token,
        projectId: project.id,
        limit: 1,
        ...(cursor && { cursor }),
      });
      found.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(new Set(found.map((result) => result.id)).size, found.length);
    for (const kind of ["capture", "task", "note", "project", "resource"]) {
      assert.ok(
        found.some((result) => result.kind === kind),
        `missing ${kind}`,
      );
    }
    assert.ok(found.every((result) => result.projectId === project.id));
    assert.deepEqual(
      (
        await captures.search({
          q: token,
          projectId: otherProject.id,
          limit: 25,
        })
      ).items,
      [],
    );
  } finally {
    await database.close();
  }
});
