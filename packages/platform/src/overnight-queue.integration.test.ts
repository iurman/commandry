import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  buildExecutionPacketContents,
  createAgentContextService,
  createLocalAgentRunProcessor,
  createLocalAgentRunService,
  createOvernightQueueProcessor,
  createOvernightQueueService,
  createProjectBriefService,
} from "@commandry/application";
import {
  createBriefRepository,
  createDatabase,
  createExecutionPacketRepository,
  createLocalAgentRepository,
  createLocalAgentRunRepository,
  createOvernightQueueRepository,
  schema,
} from "@commandry/db";
import {
  createLocalAgentRunSubmission,
  createOvernightQueueSubmission,
  createPgBossProducer,
  OVERNIGHT_DEAD_LETTER_QUEUE,
  OVERNIGHT_QUEUE,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "overnight packet queue schedules, cancels, blocks changed work, and replays one scoped fake run",
  { timeout: 120_000 },
  async () => {
    const admin = new Pool({ connectionString: adminUrl, max: 2 });
    const database = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 5,
    });
    const producer = await createPgBossProducer({
      connectionString: runtimeUrl.toString(),
      max: 2,
    });
    const db = database.db;
    const queueRepository = createOvernightQueueRepository(db);
    const queue = createOvernightQueueService(
      {
        ...queueRepository,
        ...createOvernightQueueSubmission(db, producer.boss),
      },
      7,
    );
    const agents = createLocalAgentRepository(db);
    const packets = createExecutionPacketRepository(db);
    const runs = createLocalAgentRunRepository(db);
    const localRuns = createLocalAgentRunService({
      getPacketById: packets.getById,
      getAgentById: agents.getById,
      isAssigned: agents.isAssigned,
      getById: runs.getById,
      ...createLocalAgentRunSubmission(db, producer.boss),
    });
    const dispatch = createOvernightQueueProcessor(
      queueRepository,
      localRuns.submit,
    );
    const brief = createProjectBriefService(createBriefRepository(db));
    const context = createAgentContextService({
      getAuthorization: runs.getAuthorization,
      getProjectBrief: brief.getBrief,
      getWorkItem: runs.getWorkItem,
      recordAudit: runs.recordAudit,
      listAudit: runs.listAudit,
    });
    const processRun = createLocalAgentRunProcessor(runs, context);
    const projectId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const captureId = crypto.randomUUID();

    try {
      await db
        .insert(schema.project)
        .values({ id: projectId, name: "Overnight test project" });
      await db.insert(schema.capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Plan a local fake run",
        source: "manual-local",
        author: "local-user",
        state: "filed",
        projectId,
        filedRecordKind: "task",
        filedRecordId: workItemId,
        filedAt: new Date(),
      });
      await db.insert(schema.workItem).values({
        id: workItemId,
        projectId,
        sourceCaptureId: captureId,
        title: "Overnight test work",
        description: "Review only",
      });
      const packet = await packets.create(
        { workItemId, selectedKnowledgeIds: [], selectedResourceIds: [] },
        buildExecutionPacketContents,
      );
      const agent = await agents.create({ name: "Overnight fake agent" });
      await agents.assignProject(agent.id, projectId);
      const input = (offsetMs: number) => ({
        packetId: packet.id,
        agentId: agent.id,
        runAfter: new Date(Date.now() + offsetMs).toISOString(),
      });

      const queueDefinition = await admin.query<{
        retry_limit: number;
        dead_letter: string;
      }>("SELECT retry_limit, dead_letter FROM pgboss.queue WHERE name = $1", [
        OVERNIGHT_QUEUE,
      ]);
      assert.equal(queueDefinition.rows[0]?.retry_limit, 3);
      assert.equal(
        queueDefinition.rows[0]?.dead_letter,
        OVERNIGHT_DEAD_LETTER_QUEUE,
      );
      assert.equal((await queue.readiness(packet.id, agent.id)).ready, true);

      const unavailableBoss = {
        send: async () => {
          throw new Error("injected queue failure");
        },
      } as unknown as PgBoss;
      await assert.rejects(
        createOvernightQueueSubmission(db, unavailableBoss).schedule(
          input(10_000),
          new Date(Date.now() + 10_000),
        ),
        /injected queue failure/,
      );
      assert.equal(
        (await queueRepository.list({ limit: 20, projectId })).items.length,
        0,
      );

      const canceled = await queue.schedule(input(10_000));
      const jobs = await admin.query<{
        data: { entryId: string };
        start_after: Date;
      }>(
        "SELECT data, start_after FROM pgboss.job WHERE name = $1 AND data->>'entryId' = $2",
        [OVERNIGHT_QUEUE, canceled.id],
      );
      assert.equal(jobs.rows.length, 1);
      assert.equal(jobs.rows[0]?.data.entryId, canceled.id);
      assert.ok((jobs.rows[0]?.start_after.getTime() ?? 0) > Date.now());
      assert.equal(
        (await queueRepository.listAudit(canceled.id, { limit: 10 })).items[0]
          ?.operation,
        "overnight_queue.scheduled",
      );
      assert.equal((await queue.cancel(canceled.id)).state, "canceled");
      await dispatch(canceled.id);
      assert.equal((await queueRepository.getById(canceled.id))?.runId, null);

      const scheduled = await queue.schedule(input(800));
      assert.equal(scheduled.state, "scheduled");
      await delay(900);
      assert.ok(
        (await queueRepository.listRecoverable(new Date())).includes(
          scheduled.id,
        ),
      );
      assert.equal(
        (await queueRepository.listRecoverable(new Date())).includes(
          canceled.id,
        ),
        false,
      );
      await dispatch(scheduled.id);
      const first = await queueRepository.getById(scheduled.id);
      assert.equal(first?.state, "dispatched");
      assert.ok(first?.runId);
      const run = await localRuns.getById(first!.runId!);
      assert.equal(run?.occurrenceId, `overnight:${scheduled.id}`);
      assert.equal(run?.grant.projectId, projectId);
      assert.deepEqual(run?.grant.operations, [
        "project.brief.read",
        "work.read",
      ]);
      assert.ok(Date.parse(run!.grant.expiresAt) > Date.now());
      const completed = await processRun({
        version: 1,
        runId: run!.id,
        occurrenceId: run!.occurrenceId,
      });
      assert.equal(completed.state, "succeeded");
      assert.equal(completed.result?.isSynthetic, true);
      assert.equal(completed.result?.verificationStatus, "unverified");
      assert.deepEqual(completed.result?.externalActions, []);
      await dispatch(scheduled.id);
      const runRows = await db
        .select({ id: schema.localAgentRun.id })
        .from(schema.localAgentRun)
        .where(
          eq(schema.localAgentRun.occurrenceId, `overnight:${scheduled.id}`),
        );
      assert.equal(runRows.length, 1);
      assert.equal(
        (
          await queueRepository.listAudit(scheduled.id, { limit: 10 })
        ).items.filter(
          (item) => item.operation === "overnight_queue.dispatched",
        ).length,
        1,
      );

      const blocked = await queue.schedule(input(800));
      await db
        .update(schema.workItem)
        .set({ status: "done" })
        .where(eq(schema.workItem.id, workItemId));
      await delay(900);
      await dispatch(blocked.id);
      assert.equal(
        (await queueRepository.getById(blocked.id))?.state,
        "blocked",
      );
      assert.match(
        (await queueRepository.getById(blocked.id))?.blockedReason ?? "",
        /work is done/,
      );
      assert.equal((await queueRepository.getById(blocked.id))?.runId, null);
    } finally {
      await producer.close();
      await database.close();
      await admin.end();
    }
  },
);
