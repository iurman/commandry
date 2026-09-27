import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createCaptureService,
  createExecutionPacketService,
  createProjectBriefService,
} from "@commandry/application";
import { KNOWLEDGE_TEXT_TYPES } from "@commandry/domain";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createKnowledgeRevisionRepository } from "./knowledge-revision-repository";
import { migrateDatabase } from "./migrate";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

test(
  "typed Knowledge files every proposed text category from one original and carries the type into search, brief, and packet",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const catalog = createCatalogRepository(database.db);
      const captures = createCaptureRepository(database.db);
      const service = createCaptureService(captures);
      const revisions = createKnowledgeRevisionRepository(database.db);
      const briefs = createProjectBriefService(
        createBriefRepository(database.db),
      );
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Typed Knowledge integration",
      });
      const filed = new Map<string, { id: string; sourceId: string }>();
      for (const knowledgeType of KNOWLEDGE_TEXT_TYPES) {
        const source = await captures.createCapture({
          id: crypto.randomUUID(),
          inputType: "text",
          originalContent: `Original ${knowledgeType} thought`,
        });
        const response = await service.fileCapture(source.id, {
          projectId: project.id,
          kind: "note",
          knowledgeType,
          title: `${knowledgeType} memory`,
          body: `${knowledgeType} project context`,
        });
        assert.ok("kind" in response.record);
        assert.equal(response.record.kind, knowledgeType);
        filed.set(knowledgeType, {
          id: response.record.id,
          sourceId: source.id,
        });
        assert.equal(
          (await captures.getCapture(source.id))?.originalContent,
          `Original ${knowledgeType} thought`,
        );
      }
      const ids = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await captures.listProjectKnowledge(project.id, {
          limit: 4,
          ...(cursor ? { cursor } : {}),
        });
        page.items.forEach((item) => ids.add(item.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(ids.size, KNOWLEDGE_TEXT_TYPES.length);

      const runbook = filed.get("runbook")!;
      const search = await captures.search({
        q: "runbook",
        projectId: project.id,
        limit: 10,
      });
      assert.ok(
        search.items.some(
          (item) => item.id === runbook.id && item.kind === "runbook",
        ),
      );
      const brief = await briefs.getBrief(project.id);
      const runbookFact = brief?.sections.knowledge.items.find(
        (item) => item.id === runbook.id,
      );
      assert.ok(runbookFact?.detail.startsWith("Runbook."));
      assert.ok(
        runbookFact?.evidence.some(
          (item) => item.kind === "capture" && item.id === runbook.sourceId,
        ),
      );

      const taskSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Use project memory",
      });
      const task = await captures.fileAsTask({
        captureId: taskSource.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Use project memory",
        description: "Review the runbook",
      });
      const packet = await packets.create(task.record.id, {
        selectedKnowledgeIds: [runbook.id, filed.get("idea")!.id],
        selectedResourceIds: [],
      });
      assert.deepEqual(
        packet.snapshot.selectedKnowledge.map((item) => item.kind).sort(),
        ["idea", "runbook"],
      );
      const revised = await revisions.revise(runbook.id, {
        expectedVersion: 1,
        title: "Current runbook",
        content: "Updated steps",
      });
      assert.equal(revised.kind, "runbook");
      assert.equal(
        (await captures.getCapture(runbook.sourceId))?.originalContent,
        "Original runbook thought",
      );
      assert.equal(
        (await packets.getById(packet.id))?.contentDigest,
        packet.contentDigest,
      );

      const invalidSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: "Cannot tag a task as knowledge",
      });
      await assert.rejects(
        service.fileCapture(invalidSource.id, {
          projectId: project.id,
          kind: "task",
          knowledgeType: "idea",
          title: "Invalid mixed type",
        }),
        { code: "CAPTURE_KIND_INVALID" },
      );
      assert.equal(
        (await captures.getCapture(invalidSource.id))?.state,
        "unfiled",
      );
    } finally {
      await database.close();
    }
  },
);
