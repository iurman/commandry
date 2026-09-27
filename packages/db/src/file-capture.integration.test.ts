import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createCaptureService,
  createExecutionPacketService,
  createFileCaptureService,
  createProjectBriefService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createFileCaptureRepository } from "./file-capture-repository";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "original file bytes remain immutable while a document joins project knowledge, search, brief, and packet",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const captures = createCaptureService(
        createCaptureRepository(database.db),
      );
      const files = createFileCaptureService(
        createFileCaptureRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "File evidence project",
      });
      const other = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Other file context",
      });
      const bytes = Uint8Array.from([0, 13, 10, 255, 128, 1, 99]);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const source = await files.create({
        originalName: "Measured field log.bin",
        mediaType: "application/octet-stream",
        bytes,
      });
      assert.equal(source.inputType, "file");
      assert.equal(source.file?.sha256, checksum);
      assert.equal(source.file?.byteSize, bytes.length);
      assert.equal(source.file?.originalName, "Measured field log.bin");
      assert.equal(source.originalContent, `capture-file://${source.id}`);
      assert.deepEqual(
        Array.from((await files.getOriginal(source.id)).bytes),
        Array.from(bytes),
      );
      assert.equal(
        (await captures.getCapture(source.id))?.file?.sha256,
        checksum,
      );
      assert.equal(
        (await captures.listCaptures({ limit: 10 })).items.find(
          (item) => item.id === source.id,
        )?.file?.downloadHref,
        `/api/v1/captures/${source.id}/original-file`,
      );

      await assert.rejects(
        captures.fileCapture(source.id, {
          projectId: project.id,
          kind: "task",
          title: "Wrong filing",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CAPTURE_KIND_INVALID",
      );
      const filed = await captures.fileCapture(source.id, {
        projectId: project.id,
        kind: "document",
        title: "Measured field log",
        body: "Local device observations, pending live connector.",
      });
      assert.deepEqual(filed.capture.filedRecord, {
        kind: "document",
        id: filed.record.id,
      });
      if (!("kind" in filed.record))
        throw new Error("Expected a Knowledge document");
      assert.equal(filed.record.sourceCaptureId, source.id);
      assert.equal(filed.record.kind, "document");
      assert.equal(
        (
          await captures.listProjectKnowledge(project.id, { limit: 10 })
        ).items.find((item) => item.id === filed.record.id)?.content,
        "Local device observations, pending live connector.",
      );
      assert.equal(
        (
          await captures.listKnowledge({ limit: 10, projectId: other.id })
        ).items.some((item) => item.id === filed.record.id),
        false,
      );
      const filenameHits = await captures.search({
        q: "Measured field log.bin",
        projectId: project.id,
        limit: 20,
      });
      assert.ok(
        filenameHits.items.some(
          (item) => item.kind === "capture" && item.id === source.id,
        ),
      );
      const documentHits = await captures.search({
        q: "Local device observations",
        projectId: project.id,
        limit: 20,
      });
      assert.ok(
        documentHits.items.some(
          (item) => item.kind === "document" && item.id === filed.record.id,
        ),
      );
      assert.equal(
        (
          await captures.search({
            q: "Measured field log",
            projectId: other.id,
            limit: 20,
          })
        ).items.length,
        0,
      );
      const brief = await createProjectBriefService(
        createBriefRepository(database.db),
      ).getBrief(project.id);
      assert.ok(
        brief?.sections.knowledge.items.some(
          (item) =>
            item.id === filed.record.id &&
            item.sourceLabel === "Manual local knowledge document" &&
            item.evidence.some((evidence) => evidence.id === source.id),
        ),
      );

      const taskCapture = await captures.createCapture({
        inputType: "text",
        originalContent: "Review the measured field log",
      });
      const task = await captures.fileCapture(taskCapture.id, {
        projectId: project.id,
        kind: "task",
        title: "Review field log",
      });
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const packet = await packets.create(task.record.id, {
        selectedKnowledgeIds: [filed.record.id],
        selectedResourceIds: [],
      });
      assert.ok(
        packet.snapshot.selectedKnowledge.some(
          (item) =>
            item.id === filed.record.id &&
            item.evidence.sourceLabel === "Manual local knowledge document",
        ),
      );

      await assert.rejects(
        database.pool.query(
          "update capture_file set content_base64 = $1 where capture_id = $2",
          [Buffer.from("tampered").toString("base64"), source.id],
        ),
      );
      await assert.rejects(
        database.pool.query(
          "update capture set original_content = $1 where id = $2",
          ["tampered", source.id],
        ),
      );
      assert.deepEqual(
        Array.from((await files.getOriginal(source.id)).bytes),
        Array.from(bytes),
      );
    } finally {
      await database.close();
    }
  },
);
