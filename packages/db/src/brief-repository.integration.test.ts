import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { createBriefRepository } from "./brief-repository";
import { createCaptureRepository } from "./capture-repository";
import { createCatalogRepository } from "./catalog-repository";
import { createDatabase } from "./client";
import { createRecordDetailRepository } from "./record-detail-repository";
import {
  alertCondition,
  alertEvidence,
  capture,
  knowledgeItem,
  normalizedEvent,
  project,
  projectResourceLink,
  resource,
  sourceEnvelope,
  syntheticEventImport,
  workItem,
} from "./schema";
import { createSyntheticEventImportRepository } from "./synthetic-event-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run this file through pnpm test:integration");

test(
  "brief snapshot keeps source citations and every preview remainder reachable",
  { timeout: 30_000 },
  async () => {
    const database = createDatabase({ connectionString, max: 3 });
    const db = database.db;
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const taskIds: string[] = [];
    const noteIds: string[] = [];
    const resourceIds: string[] = [];
    const eventIds: string[] = [];
    try {
      await db.insert(project).values([
        { id: projectId, name: "Brief integration project" },
        { id: otherProjectId, name: "Other brief project" },
      ]);

      for (let index = 0; index < 7; index += 1) {
        const taskCaptureId = crypto.randomUUID();
        const taskId = crypto.randomUUID();
        const noteCaptureId = crypto.randomUUID();
        const noteId = crypto.randomUUID();
        const resourceId = crypto.randomUUID();
        const linkId = crypto.randomUUID();
        const createdAt = new Date(Date.UTC(2026, 8, 25, 10, index));
        taskIds.push(taskId);
        noteIds.push(noteId);
        resourceIds.push(resourceId);
        await db.insert(capture).values([
          {
            id: taskCaptureId,
            inputType: "text",
            originalContent: `Original task ${index}`,
            source: "manual-local",
            author: "local-user",
            state: "filed",
            projectId,
            filedRecordKind: "task",
            filedRecordId: taskId,
            filedAt: createdAt,
            createdAt,
          },
          {
            id: noteCaptureId,
            inputType: "text",
            originalContent: `Original note ${index}`,
            source: "manual-local",
            author: "local-user",
            state: "filed",
            projectId,
            filedRecordKind: "note",
            filedRecordId: noteId,
            filedAt: createdAt,
            createdAt,
          },
        ]);
        await db.insert(workItem).values({
          id: taskId,
          projectId,
          sourceCaptureId: taskCaptureId,
          title: `Open task ${index}`,
          description: `Task detail ${index}`,
          status: "open",
          createdAt,
          updatedAt: createdAt,
        });
        await db.insert(knowledgeItem).values({
          id: noteId,
          projectId,
          sourceCaptureId: noteCaptureId,
          title: `Project note ${index}`,
          content: `Note detail ${index}`,
          createdAt,
          updatedAt: createdAt,
        });
        await db.insert(resource).values({
          id: resourceId,
          kind: "service",
          name: `Linked service ${index}`,
          state: null,
        });
        await db.insert(projectResourceLink).values({
          id: linkId,
          projectId,
          resourceId,
          type: "supports",
          sourceKind: "resource",
          targetKind: "project",
          lifecycle: "active",
          createdAt,
        });

        const importId = crypto.randomUUID();
        const envelopeId = crypto.randomUUID();
        const eventId = crypto.randomUUID();
        eventIds.push(eventId);
        await db.insert(syntheticEventImport).values({
          id: importId,
          occurrenceId: `brief-development:${importId}`,
          requestFingerprint: "brief-test-fingerprint",
          scenarioId: "development.pr-merged",
          projectId,
          state: "succeeded",
        });
        await db.insert(sourceEnvelope).values({
          id: envelopeId,
          importId,
          sourceKind: "synthetic-development",
          sourceLabel: "Synthetic development fixture",
          sourceSchemaVersion: "synthetic-fixture/v1",
          sourceEventId: `brief-development:${importId}`,
          rawPayload: { scenarioId: "development.pr-merged" },
          occurredAt: createdAt,
          isSynthetic: true,
        });
        await db.insert(normalizedEvent).values({
          id: eventId,
          importId,
          sourceEnvelopeId: envelopeId,
          type: "git.pull_request.merged",
          projectId,
          resourceId: null,
          severity: "info",
          summary: `Synthetic merged pull request ${index}`,
          occurredAt: createdAt,
          sourceKind: "synthetic-development",
          sourceLabel: "Synthetic development fixture",
          processingVersion: "synthetic-projection/v1",
          isSynthetic: true,
        });
      }

      const monitorImportId = crypto.randomUUID();
      const monitorEnvelopeId = crypto.randomUUID();
      const monitorEventId = crypto.randomUUID();
      const alertId = crypto.randomUUID();
      const monitorAt = new Date("2026-09-25T10:07:00.000Z");
      const alertRecordedAt = new Date("2026-09-25T10:08:00.000Z");
      await db.insert(syntheticEventImport).values({
        id: monitorImportId,
        occurrenceId: `brief-monitor:${monitorImportId}`,
        requestFingerprint: "brief-monitor-fingerprint",
        scenarioId: "operations.monitor-down",
        projectId,
        resourceId: resourceIds[0]!,
        state: "succeeded",
      });
      await db.insert(sourceEnvelope).values({
        id: monitorEnvelopeId,
        importId: monitorImportId,
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        sourceSchemaVersion: "synthetic-fixture/v1",
        sourceEventId: `brief-monitor:${monitorImportId}`,
        rawPayload: { scenarioId: "operations.monitor-down" },
        occurredAt: monitorAt,
        isSynthetic: true,
      });
      await db.insert(normalizedEvent).values({
        id: monitorEventId,
        importId: monitorImportId,
        sourceEnvelopeId: monitorEnvelopeId,
        type: "monitor.down",
        projectId,
        resourceId: resourceIds[0]!,
        severity: "critical",
        summary: "Synthetic monitor down",
        occurredAt: monitorAt,
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        processingVersion: "synthetic-projection/v1",
        isSynthetic: true,
      });
      await db.insert(alertCondition).values({
        id: alertId,
        ruleId: "synthetic.monitor.availability.v1",
        projectId,
        resourceId: resourceIds[0]!,
        state: "open",
        severity: "critical",
        reason: "Synthetic monitor evidence requires attention",
        firstObservedAt: monitorAt,
        lastObservedAt: monitorAt,
        lastEventId: monitorEventId,
        sourceKind: "synthetic-operations",
        sourceLabel: "Synthetic operational fixture",
        isSynthetic: true,
        updatedAt: alertRecordedAt,
      });
      await db.insert(alertEvidence).values({
        id: crypto.randomUUID(),
        alertId,
        eventId: monitorEventId,
      });

      const [otherCaptureId, otherTaskId] = [
        crypto.randomUUID(),
        crypto.randomUUID(),
      ];
      await db.insert(capture).values({
        id: otherCaptureId,
        inputType: "text",
        originalContent: "Other project task source",
        source: "manual-local",
        author: "local-user",
        state: "filed",
        projectId: otherProjectId,
        filedRecordKind: "task",
        filedRecordId: otherTaskId,
        filedAt: new Date(),
      });
      await db.insert(workItem).values({
        id: otherTaskId,
        projectId: otherProjectId,
        sourceCaptureId: otherCaptureId,
        title: "Other project task",
        description: "Must not leak into brief",
      });

      const briefRepository = createBriefRepository(db);
      const snapshot = await briefRepository.readProjectSnapshot(projectId, {
        limit: 5,
      });
      assert.ok(snapshot);
      assert.equal(snapshot.project.id, projectId);
      assert.ok(Date.parse(snapshot.asOf) > 0);
      assert.equal(snapshot.work.items.length, 5);
      assert.equal(snapshot.knowledge.items.length, 5);
      assert.equal(snapshot.resources.items.length, 5);
      assert.equal(snapshot.events.items.length, 5);
      assert.equal(snapshot.attention.items.length, 1);
      for (const section of [
        snapshot.work,
        snapshot.knowledge,
        snapshot.resources,
        snapshot.events,
      ]) {
        assert.ok(section.nextCursor);
      }
      assert.ok(
        snapshot.work.items.every((item) => item.projectId === projectId),
      );
      assert.ok(
        snapshot.knowledge.items.every((item) => item.projectId === projectId),
      );
      assert.ok(
        snapshot.events.items.every((item) => item.projectId === projectId),
      );
      assert.ok(
        snapshot.resources.items.every(
          (item) => item.link.resource.state === null,
        ),
      );
      assert.equal(
        snapshot.attention.items[0]?.evidenceEventIds[0],
        monitorEventId,
      );
      assert.equal(
        snapshot.attention.items[0]?.recordedAt,
        alertRecordedAt.toISOString(),
      );
      assert.equal(
        snapshot.attention.items[0]?.lastObservedAt,
        monitorAt.toISOString(),
      );
      assert.equal(
        snapshot.events.items[0]?.sourceLabel,
        "Synthetic operational fixture",
      );
      assert.equal(
        snapshot.events.items[0]?.evidenceHref,
        `/api/v1/source-envelopes/${monitorEnvelopeId}`,
      );

      const details = createRecordDetailRepository(db);
      const exactWork = await details.getWorkItemById(
        snapshot.work.items[0]!.id,
      );
      const exactNote = await details.getKnowledgeItemById(
        snapshot.knowledge.items[0]!.id,
      );
      assert.equal(
        exactWork?.sourceCaptureId,
        snapshot.work.items[0]!.sourceCaptureId,
      );
      assert.equal(
        exactNote?.sourceCaptureId,
        snapshot.knowledge.items[0]!.sourceCaptureId,
      );
      assert.deepEqual(
        await details.getProjectResourceLinkById(
          snapshot.resources.items[0]!.link.id,
        ),
        {
          id: snapshot.resources.items[0]!.link.id,
          projectId,
          resourceId: snapshot.resources.items[0]!.link.resource.id,
          type: snapshot.resources.items[0]!.link.type,
          lifecycle: "active",
          createdAt: snapshot.resources.items[0]!.linkedAt,
        },
      );
      assert.equal(
        (
          await db
            .select()
            .from(capture)
            .where(eq(capture.id, exactWork!.sourceCaptureId))
            .limit(1)
        ).length,
        1,
      );
      assert.equal(
        (
          await db
            .select()
            .from(capture)
            .where(eq(capture.id, exactNote!.sourceCaptureId))
            .limit(1)
        ).length,
        1,
      );
      assert.equal(await details.getWorkItemById(crypto.randomUUID()), null);
      assert.equal(
        await details.getKnowledgeItemById(crypto.randomUUID()),
        null,
      );
      assert.equal(
        await details.getProjectResourceLinkById(crypto.randomUUID()),
        null,
      );

      const event = await createSyntheticEventImportRepository(db).getEventById(
        snapshot.events.items[0]!.id,
      );
      assert.equal(event?.sourceEnvelopeId, monitorEnvelopeId);
      assert.equal(event?.alertId, alertId);
      const fullWork = createCaptureRepository(db);
      const workPage = await fullWork.listProjectWork(projectId, { limit: 5 });
      const remainingWork = await fullWork.listProjectWork(projectId, {
        limit: 5,
        cursor: workPage.nextCursor!,
      });
      assert.equal(workPage.items.length + remainingWork.items.length, 7);
      const notePage = await fullWork.listProjectKnowledge(projectId, {
        limit: 5,
      });
      const remainingNotes = await fullWork.listProjectKnowledge(projectId, {
        limit: 5,
        cursor: notePage.nextCursor!,
      });
      assert.equal(notePage.items.length + remainingNotes.items.length, 7);
      const resourceList = createCatalogRepository(db);
      const linkPage = await resourceList.listProjectResourceLinks(projectId, {
        limit: 5,
      });
      const remainingLinks = await resourceList.listProjectResourceLinks(
        projectId,
        {
          limit: 5,
          cursor: linkPage.nextCursor!,
        },
      );
      assert.equal(linkPage.items.length + remainingLinks.items.length, 7);
      const eventList = createSyntheticEventImportRepository(db);
      const eventPage = await eventList.listEvents({ projectId, limit: 5 });
      const remainingEvents = await eventList.listEvents({
        projectId,
        limit: 5,
        cursor: eventPage.nextCursor!,
      });
      assert.equal(eventPage.items.length + remainingEvents.items.length, 8);
      assert.equal(eventIds.length, 7);
      assert.equal(resourceIds.length, 7);
      assert.equal(noteIds.length, 7);
      assert.equal(taskIds.length, 7);

      const originalTitle = snapshot.work.items[0]!.title;
      await db
        .update(workItem)
        .set({ title: "Edited later", updatedAt: new Date() })
        .where(eq(workItem.id, snapshot.work.items[0]!.id));
      assert.equal(snapshot.work.items[0]!.title, originalTitle);
      const refreshed = await briefRepository.readProjectSnapshot(projectId, {
        limit: 5,
      });
      assert.equal(refreshed?.work.items[0]?.title, "Edited later");
      assert.equal(
        await briefRepository.readProjectSnapshot(crypto.randomUUID(), {
          limit: 5,
        }),
        null,
      );
    } finally {
      await database.close();
    }
  },
);
