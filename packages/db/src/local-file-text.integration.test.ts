import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCaptureService,
  createFileCaptureService,
  createLocalFileTextService,
} from "@commandry/application";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createFileCaptureRepository } from "./file-capture-repository";
import { createLocalFileTextRepository } from "./local-file-text-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test("worker-derived Markdown becomes searchable evidence without changing original bytes", async () => {
  const database = createDatabase({ connectionString, max: 3 });
  try {
    const catalog = createCatalogRepository(database.db);
    const captures = createCaptureService(createCaptureRepository(database.db));
    const files = createFileCaptureService(
      createFileCaptureRepository(database.db),
    );
    const text = createLocalFileTextService(
      createLocalFileTextRepository(database.db),
    );
    const project = await catalog.createProject({
      id: crypto.randomUUID(),
      name: `Derived text ${crypto.randomUUID()}`,
    });
    const other = await catalog.createProject({
      id: crypto.randomUUID(),
      name: `Unrelated ${crypto.randomUUID()}`,
    });
    const phrase = `copperfalcon${crypto.randomUUID().replaceAll("-", "")}`;
    const bytes = new TextEncoder().encode(
      `# Local field log\nThe ${phrase} signal was measured locally.`,
    );
    const source = await files.create({
      originalName: "field-log.md",
      mediaType: "text/markdown",
      bytes,
    });
    const pending = await text.get(source.id);
    assert.equal(pending?.status, "pending");
    assert.equal(pending?.extractedText, null);
    const extracted = await text.process(source.id);
    assert.equal(extracted.status, "extracted");
    assert.match(extracted.extractedText ?? "", new RegExp(phrase));
    assert.equal(extracted.sourceSha256, source.file?.sha256);
    assert.deepEqual(await text.process(source.id), extracted);

    const filed = await captures.fileCapture(source.id, {
      projectId: project.id,
      kind: "document",
      title: "Field log",
      body: "Manually filed context is separate from extracted content.",
    });
    const hits = await captures.search({
      q: phrase,
      projectId: project.id,
      limit: 10,
    });
    assert.ok(
      hits.items.some(
        (item) =>
          item.id === filed.record.id &&
          item.kind === "document" &&
          item.sourceCaptureId === source.id &&
          item.excerpt.startsWith("Derived local file text:"),
      ),
    );
    assert.equal(
      (await captures.search({ q: phrase, projectId: other.id, limit: 10 }))
        .items.length,
      0,
    );
    assert.deepEqual(
      Array.from((await files.getOriginal(source.id)).bytes),
      Array.from(bytes),
    );

    const unsupported = await files.create({
      originalName: "image.png",
      mediaType: "image/png",
      bytes: Uint8Array.from([137, 80, 78, 71]),
    });
    const unextracted = await text.process(unsupported.id);
    assert.equal(unextracted.status, "unsupported");
    assert.equal(unextracted.extractedText, null);
    assert.deepEqual(
      Array.from((await files.getOriginal(unsupported.id)).bytes),
      [137, 80, 78, 71],
    );
  } finally {
    await database.close();
  }
});
