import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  createCaptureTriageProcessor,
  createExecutionPacketService,
} from "@commandry/application";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCaptureTriageRepository } from "./capture-triage-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { migrateDatabase } from "./migrate";
import { createWorkItemStatusRepository } from "./work-item-status-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "local triage review preserves source, and task status changes update live briefs without rewriting packets",
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
      const triage = createCaptureTriageRepository(database.db);
      const processCapture = createCaptureTriageProcessor(triage);
      const status = createWorkItemStatusRepository(database.db);
      const briefs = createBriefRepository(database.db);
      const packets = createExecutionPacketService(
        createExecutionPacketRepository(database.db),
      );
      const project = await catalog.createProject({
        id: crypto.randomUUID(),
        name: "Triage integration project",
      });
      const original =
        "  Need to fix the garden timer.\nKeep this exact line.  ";
      const source = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "text",
        originalContent: original,
      });

      const suggestion = await processCapture(source.id);
      assert.ok(suggestion);
      assert.equal(suggestion.kind, "task");
      assert.equal(suggestion.ruleVersion, "capture-triage/v1");
      assert.equal(suggestion.sourceLabel, "Local deterministic rule");
      assert.equal((await processCapture(source.id))?.id, suggestion.id);
      assert.equal((await triage.getReview(source.id)).decision, null);

      await assert.rejects(
        triage.review(source.id, {
          decision: "approve",
          projectId: crypto.randomUUID(),
          kind: "task",
          title: "Wrong project",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "PROJECT_NOT_FOUND",
      );
      assert.equal((await triage.getReview(source.id)).decision, null);
      assert.equal((await captures.getCapture(source.id))?.state, "unfiled");

      const reviewed = await triage.review(source.id, {
        decision: "approve",
        projectId: project.id,
        kind: "task",
        title: "Replace garden timer after inspection",
      });
      assert.equal(reviewed.capture.originalContent, original);
      assert.equal(reviewed.capture.state, "filed");
      assert.equal(reviewed.record?.sourceCaptureId, source.id);
      assert.equal(
        reviewed.decision.selectedTitle,
        "Replace garden timer after inspection",
      );
      assert.equal(reviewed.decision.selectedBody, original);
      assert.equal(reviewed.suggestion.title, suggestion.title);
      assert.ok(reviewed.record && "status" in reviewed.record);
      const taskId = reviewed.record.id;
      assert.equal(await processCapture(source.id), null);
      await assert.rejects(
        triage.review(source.id, { decision: "reject" }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "CAPTURE_ALREADY_FILED",
      );

      const before = await briefs.readProjectSnapshot(project.id, {
        limit: 10,
      });
      assert.ok(before?.work.items.some((item) => item.id === taskId));
      const packet = await packets.create(taskId, {
        selectedKnowledgeIds: [],
        selectedResourceIds: [],
      });
      assert.equal(packet.snapshot.objective.status, "open");
      assert.equal(packet.snapshot.objective.evidence[1]?.id, source.id);

      const done = await status.changeStatus(taskId, {
        expectedStatus: "open",
        status: "done",
      });
      assert.equal(done.status, "done");
      await assert.rejects(
        status.changeStatus(taskId, {
          expectedStatus: "open",
          status: "done",
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "STATUS_CONFLICT",
      );
      const after = await briefs.readProjectSnapshot(project.id, { limit: 10 });
      assert.equal(
        after?.work.items.some((item) => item.id === taskId),
        false,
      );
      assert.equal(
        (await packets.getById(packet.id))?.contentDigest,
        packet.contentDigest,
      );
      assert.equal(
        (await packets.getById(packet.id))?.snapshot.objective.status,
        "open",
      );

      await status.changeStatus(taskId, {
        expectedStatus: "done",
        status: "open",
      });
      const restored = await briefs.readProjectSnapshot(project.id, {
        limit: 10,
      });
      assert.ok(restored?.work.items.some((item) => item.id === taskId));
      const firstEventPage = await status.listStatusEvents(taskId, {
        limit: 1,
      });
      assert.equal(firstEventPage.items.length, 1);
      assert.ok(firstEventPage.nextCursor);
      const secondEventPage = await status.listStatusEvents(taskId, {
        limit: 1,
        cursor: firstEventPage.nextCursor,
      });
      assert.equal(secondEventPage.items.length, 1);
      assert.notEqual(
        secondEventPage.items[0]?.id,
        firstEventPage.items[0]?.id,
      );

      await assert.rejects(
        database.pool.query(
          "update capture_triage_suggestion set title = $1 where id = $2",
          ["Rewritten suggestion", suggestion.id],
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "23514",
      );
      await assert.rejects(
        database.pool.query(
          "delete from work_item_status_event where id = $1",
          [firstEventPage.items[0]!.id],
        ),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "23514",
      );
      assert.equal(
        (await captures.getCapture(source.id))?.originalContent,
        original,
      );

      const rejectedSource = await captures.createCapture({
        id: crypto.randomUUID(),
        inputType: "url",
        originalContent: "https://example.test/review-source",
      });
      const rejectedSuggestion = await processCapture(rejectedSource.id);
      assert.equal(rejectedSuggestion?.kind, "note");
      const rejected = await triage.review(rejectedSource.id, {
        decision: "reject",
      });
      assert.equal(rejected.record, null);
      assert.equal(rejected.capture.state, "unfiled");
      assert.equal(rejected.decision.decision, "reject");
      assert.equal(rejected.decision.selectedTitle, null);
      assert.equal(
        (await triage.getReview(rejectedSource.id)).decision?.id,
        rejected.decision.id,
      );
      const manuallyFiled = await captures.fileAsNote({
        captureId: rejectedSource.id,
        recordId: crypto.randomUUID(),
        projectId: project.id,
        title: "Reviewed source",
        content: rejectedSource.originalContent,
      });
      assert.equal(
        manuallyFiled.capture.originalContent,
        rejectedSource.originalContent,
      );
    } finally {
      await database.close();
    }
  },
);
