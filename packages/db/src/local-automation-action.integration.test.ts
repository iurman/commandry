import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createLocalAutomationProcessor,
  createProjectBriefService,
} from "@commandry/application";
import { eq, sql } from "drizzle-orm";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createLocalAutomationRepository } from "./local-automation-repository";
import { migrateDatabase } from "./migrate";
import { automationDefinition, automationRun, knowledgeItem } from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "an opted-in local automation files one synthetic source-backed note and audit",
  { timeout: 30_000 },
  async () => {
    await migrateDatabase({
      connectionString,
      migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
    });
    const database = createDatabase({ connectionString, max: 3 });
    try {
      const project = await createCatalogRepository(database.db).createProject({
        id: crypto.randomUUID(),
        name: "Local note action project",
      });
      const definitionId = crypto.randomUUID();
      await database.db.insert(automationDefinition).values({
        id: definitionId,
        projectId: project.id,
        name: "Review local evidence",
        enabled: true,
        localActionKind: "create_project_note",
        capabilityReference: "commandry.project.knowledge.create",
      });
      const runId = crypto.randomUUID();
      await database.db.insert(automationRun).values({
        id: runId,
        definitionId,
        projectId: project.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "manual",
      });
      const repository = createLocalAutomationRepository(database.db);
      const processor = createLocalAutomationProcessor(
        repository,
        createProjectBriefService(createBriefRepository(database.db)),
      );
      const first = await processor({ version: 1, runId, definitionId });
      assert.equal(first.state, "succeeded");
      assert.equal(first.result?.verificationStatus, "unverified");
      assert.deepEqual(first.result?.externalActions, []);
      const action = first.result?.localAction;
      assert.ok(action);
      assert.equal(action.kind, "create_project_note");
      assert.equal(
        action.capabilityReference,
        "commandry.project.knowledge.create",
      );
      assert.equal(action.href, `/knowledge-items/${action.recordId}`);
      const capture = await createCaptureRepository(database.db).getCapture(
        action.captureId,
      );
      assert.equal(capture?.source, "automation-local-synthetic");
      assert.equal(capture?.author, "system:local-automation-worker");
      assert.equal(capture?.state, "filed");
      assert.deepEqual(capture?.filedRecord, {
        kind: "note",
        id: action.recordId,
      });
      assert.match(capture?.originalContent ?? "", /generated content/);
      assert.match(capture?.originalContent ?? "", new RegExp(runId));
      const [note] = await database.db
        .select()
        .from(knowledgeItem)
        .where(eq(knowledgeItem.id, action.recordId));
      assert.equal(note?.projectId, project.id);
      assert.equal(note?.sourceCaptureId, action.captureId);
      assert.equal(note?.content, capture?.originalContent);
      const projectKnowledge = await createCaptureRepository(
        database.db,
      ).listProjectKnowledge(project.id, { limit: 10 });
      assert.ok(
        projectKnowledge.items.some((item) => item.id === action.recordId),
      );
      const audit = await repository.listAudit(definitionId, { limit: 20 });
      assert.equal(
        audit.items.filter(
          (item) => item.operation === "automation.local_note_created",
        ).length,
        1,
      );
      const replay = await processor({ version: 1, runId, definitionId });
      assert.equal(replay.result?.localAction?.recordId, action.recordId);
      const [count] = await database.db
        .select({ total: sql<number>`count(*)::int` })
        .from(knowledgeItem)
        .where(eq(knowledgeItem.sourceCaptureId, action.captureId));
      assert.equal(count?.total, 1);

      const readOnlyDefinitionId = crypto.randomUUID();
      await database.db.insert(automationDefinition).values({
        id: readOnlyDefinitionId,
        projectId: project.id,
        name: "Read-only guard",
        enabled: true,
      });
      const readOnlyRunId = crypto.randomUUID();
      await database.db.insert(automationRun).values({
        id: readOnlyRunId,
        definitionId: readOnlyDefinitionId,
        projectId: project.id,
        occurrenceId: crypto.randomUUID(),
        trigger: "manual",
      });
      const guardedAttempt = await repository.beginAttempt(readOnlyRunId);
      assert.ok(guardedAttempt);
      await assert.rejects(
        repository.completeWithLocalNote(
          readOnlyRunId,
          guardedAttempt,
          first.result!,
          { title: "Unauthorized note", content: "Must not be saved" },
        ),
        /not enabled/,
      );
    } finally {
      await database.close();
    }
  },
);
