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

test("pasted email, conversation, and entered transcript retain their exact typed source through filing and search", async () => {
  await migrateDatabase({
    connectionString,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const catalog = createCatalogRepository(database.db);
    const captures = createCaptureRepository(database.db);
    const project = await catalog.createProject({
      id: crypto.randomUUID(),
      name: "Local source channels",
    });
    for (const inputType of [
      "email",
      "conversation",
      "voice_transcript",
    ] as const) {
      const token = `source${crypto.randomUUID().replaceAll("-", "")}`;
      const originalContent = `  ${token} First line.\nKeep exact spacing for ${inputType}.  `;
      const created = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType,
        originalContent,
      });
      assert.equal(created.inputType, inputType);
      assert.equal(created.originalContent, originalContent);
      const filed = await captures.fileAsNote({
        captureId: created.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: `${inputType} source`,
        content: originalContent,
      });
      assert.equal(filed.capture.inputType, inputType);
      assert.equal(filed.capture.originalContent, originalContent);
      assert.equal(filed.record.sourceCaptureId, created.id);
      const results = await captures.search({
        q: token,
        projectId: project.id,
        limit: 20,
      });
      assert.ok(
        results.items.some(
          (item) => item.kind === "capture" && item.id === created.id,
        ),
      );
      assert.ok(
        results.items.some(
          (item) => item.kind === "note" && item.id === filed.record.id,
        ),
      );
    }
  } finally {
    await database.close();
  }
});
