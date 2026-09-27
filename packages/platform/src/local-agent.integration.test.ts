import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  buildExecutionPacketContents,
  createAgentContextService,
  createLocalAgentRunProcessor,
  createProjectBriefService,
  prepareLocalAgentRun,
} from "@commandry/application";
import {
  localAgentRunJobV1Schema,
  localAgentRunSchema,
} from "@commandry/contracts";
import {
  createBriefRepository,
  createDatabase,
  createExecutionPacketRepository,
  createLocalAgentRepository,
  createLocalAgentRunRepository,
  schema,
} from "@commandry/db";
import { LocalAgentError, LocalRunnerCallbackError } from "@commandry/domain";
import {
  createLocalAgentRunSubmission,
  createPgBossProducer,
  LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE,
  LOCAL_AGENT_RUN_QUEUE,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run this file through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "local agent run submission and fake worker are scoped, atomic, audited, and replay safe",
  { timeout: 120_000 },
  async (t) => {
    const admin = new Pool({ connectionString: adminUrl, max: 2 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 4,
    });
    const producer = await createPgBossProducer({
      connectionString: runtimeUrl.toString(),
      max: 2,
    });
    const profiles = createLocalAgentRepository(runtime.db);
    const runs = createLocalAgentRunRepository(runtime.db);
    const submission = createLocalAgentRunSubmission(runtime.db, producer.boss);
    const brief = createProjectBriefService(createBriefRepository(runtime.db));
    const context = createAgentContextService({
      getAuthorization: runs.getAuthorization,
      getProjectBrief: brief.getBrief,
      getWorkItem: runs.getWorkItem,
      recordAudit: runs.recordAudit,
      listAudit: runs.listAudit,
    });
    const processor = createLocalAgentRunProcessor(runs, context);
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const captureId = crypto.randomUUID();

    try {
      await runtime.db.insert(schema.project).values([
        { id: projectId, name: "Local fake run project" },
        { id: otherProjectId, name: "Out of scope local fake project" },
      ]);
      await runtime.db.insert(schema.capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Original local fake run source",
        source: "manual-local",
        author: "local-user",
        state: "filed",
        projectId,
        filedRecordKind: "task",
        filedRecordId: workItemId,
        filedAt: new Date(),
      });
      await runtime.db.insert(schema.workItem).values({
        id: workItemId,
        projectId,
        sourceCaptureId: captureId,
        title: "Inspect scoped context",
        description: "Use only the local fake adapter",
      });
      const packet = await createExecutionPacketRepository(runtime.db).create(
        {
          workItemId,
          selectedKnowledgeIds: [],
          selectedResourceIds: [],
        },
        buildExecutionPacketContents,
      );
      const initialPacketSnapshot = structuredClone(packet.snapshot);
      const agent = await profiles.create({ name: "Synthetic context reader" });
      await profiles.assignProject(agent.id, projectId);
      const prepare = (occurrenceId: string) =>
        prepareLocalAgentRun(packet, { agentId: agent.id, occurrenceId });
      const firstPrepared = prepare(`local-agent:${crypto.randomUUID()}`);

      await t.test(
        "queue has retries and a dead-letter destination",
        async () => {
          const queue = await admin.query<{
            retry_limit: number;
            retry_delay: number;
            dead_letter: string;
          }>(
            "SELECT retry_limit, retry_delay, dead_letter FROM pgboss.queue WHERE name = $1",
            [LOCAL_AGENT_RUN_QUEUE],
          );
          assert.equal(queue.rows[0]?.retry_limit, 3);
          assert.equal(queue.rows[0]?.retry_delay, 1);
          assert.equal(
            queue.rows[0]?.dead_letter,
            LOCAL_AGENT_RUN_DEAD_LETTER_QUEUE,
          );
        },
      );

      await t.test(
        "one occurrence commits packet-bound run, expiring grants, job, and audit",
        async () => {
          const first = await submission.submitOnce(firstPrepared);
          const repeated = await submission.submitOnce(firstPrepared);
          assert.equal(repeated.id, first.id);
          assert.equal(first.state, "queued");
          assert.equal(first.packetId, packet.id);
          assert.equal(first.packetVersion, packet.packetVersion);
          assert.equal(first.packetDigest, packet.contentDigest);
          assert.equal(first.grant.projectId, projectId);
          assert.deepEqual(first.grant.operations, [
            "project.brief.read",
            "work.read",
          ]);
          assert.ok(Date.parse(first.grant.expiresAt) > Date.now());
          assert.equal(first.isSynthetic, true);
          assert.equal(first.verificationStatus, "unverified");
          assert.deepEqual(first.externalActions, []);
          const persistedGrants = await runtime.db
            .select()
            .from(schema.localAgentRunGrant)
            .where(eq(schema.localAgentRunGrant.runId, first.id));
          assert.equal(persistedGrants.length, 2);
          assert.ok(
            persistedGrants.every((grant) => grant.projectId === projectId),
          );
          const jobs = await admin.query<{ data: Record<string, unknown> }>(
            "SELECT data FROM pgboss.job WHERE name = $1 AND data->>'occurrenceId' = $2",
            [LOCAL_AGENT_RUN_QUEUE, firstPrepared.occurrenceId],
          );
          assert.deepEqual(
            jobs.rows.map((row) => row.data),
            [
              {
                version: 1,
                runId: first.id,
                occurrenceId: firstPrepared.occurrenceId,
              },
            ],
          );
          const audits = await runs.listAudit(first.id, { limit: 10 });
          assert.equal(audits.items[0]?.operation, "local_agent_run.queued");
          assert.equal(audits.items[0]?.projectId, projectId);
          assert.deepEqual(
            (
              await createExecutionPacketRepository(runtime.db).getById(
                packet.id,
              )
            )?.snapshot,
            initialPacketSnapshot,
          );
          await assert.rejects(
            submission.submitOnce({
              ...firstPrepared,
              requestFingerprint: "f".repeat(64),
            }),
            (error: unknown) =>
              error instanceof LocalAgentError &&
              error.code === "OCCURRENCE_CONFLICT",
          );
        },
      );

      await t.test(
        "queue and audit failures roll back run and grants",
        async () => {
          const failedQueue = prepare(
            `local-agent-queue:${crypto.randomUUID()}`,
          );
          const unavailableBoss = {
            send: async () => {
              throw new Error("injected local queue failure");
            },
          } as unknown as PgBoss;
          await assert.rejects(
            createLocalAgentRunSubmission(
              runtime.db,
              unavailableBoss,
            ).submitOnce(failedQueue),
            /injected local queue failure/,
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(schema.localAgentRun)
                .where(
                  eq(
                    schema.localAgentRun.occurrenceId,
                    failedQueue.occurrenceId,
                  ),
                )
            ).length,
            0,
          );

          await admin.query(`
          CREATE FUNCTION commandry_test_reject_local_agent_audit() RETURNS trigger AS $$
          BEGIN
            IF NEW.operation = 'local_agent_run.queued' THEN
              RAISE EXCEPTION 'injected local agent audit failure';
            END IF;
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql
        `);
          await admin.query(`
          CREATE TRIGGER commandry_test_reject_local_agent_audit
          BEFORE INSERT ON audit_event
          FOR EACH ROW EXECUTE FUNCTION commandry_test_reject_local_agent_audit()
        `);
          const failedAudit = prepare(
            `local-agent-audit:${crypto.randomUUID()}`,
          );
          try {
            await assert.rejects(
              submission.submitOnce(failedAudit),
              (error: unknown) =>
                error instanceof Error &&
                error.cause instanceof Error &&
                error.cause.message.includes(
                  "injected local agent audit failure",
                ),
            );
            const rows = await runtime.db
              .select()
              .from(schema.localAgentRun)
              .where(
                eq(schema.localAgentRun.occurrenceId, failedAudit.occurrenceId),
              );
            assert.equal(rows.length, 0);
            const jobs = await admin.query<{ count: string }>(
              "SELECT count(*) AS count FROM pgboss.job WHERE name = $1 AND data->>'occurrenceId' = $2",
              [LOCAL_AGENT_RUN_QUEUE, failedAudit.occurrenceId],
            );
            assert.equal(Number(jobs.rows[0]?.count), 0);
          } finally {
            await admin.query(
              "DROP TRIGGER commandry_test_reject_local_agent_audit ON audit_event",
            );
            await admin.query(
              "DROP FUNCTION commandry_test_reject_local_agent_audit()",
            );
          }
        },
      );

      await t.test(
        "failed attempt retries once, audits reads, and stores one unverified result",
        async () => {
          const run = await submission.submitOnce(firstPrepared);
          const job = localAgentRunJobV1Schema.parse({
            version: 1,
            runId: run.id,
            occurrenceId: firstPrepared.occurrenceId,
          });
          const failing = createLocalAgentRunProcessor(runs, context, {
            beforeContextReads: async () => {
              throw new Error("injected fake processor failure");
            },
          });
          await assert.rejects(failing(job), /injected fake processor failure/);
          const failed = await runs.getById(run.id);
          assert.equal(failed?.state, "failed");
          assert.equal(failed?.attempts, 1);
          assert.equal(failed?.attemptHistory[0]?.state, "failed");

          const completed = await processor(job);
          assert.equal(completed.state, "succeeded");
          assert.equal(completed.attempts, 2);
          assert.equal(completed.attemptHistory[1]?.state, "succeeded");
          assert.equal(completed.result?.isSynthetic, true);
          assert.equal(completed.result?.verificationStatus, "unverified");
          assert.deepEqual(completed.result?.externalActions, []);
          assert.equal(completed.result?.contextReadIds.length, 2);
          assert.ok(completed.result?.evidence.length);
          const callbacks = await runs.listCallbacks(run.id, { limit: 20 });
          assert.equal(callbacks.items.length, 6);
          assert.equal(callbacks.nextCursor, null);
          assert.deepEqual(
            new Set(
              callbacks.items
                .filter((event) => event.kind === "heartbeat")
                .map((event) => event.stage),
            ),
            new Set(["started", "brief_read", "work_read", "result_prepared"]),
          );
          const artifactEvent = callbacks.items.find(
            (event) => event.kind === "artifact",
          );
          assert.ok(artifactEvent);
          const artifact = await runs.getCallbackArtifact(
            run.id,
            artifactEvent.id,
          );
          assert.ok(artifact);
          assert.equal(
            createHash("sha256").update(artifact.content).digest("hex"),
            artifactEvent.artifactSha256,
          );
          assert.equal(
            JSON.parse(artifact.content).sourceLabel,
            "Synthetic local runner report",
          );
          assert.equal(JSON.parse(artifact.content).externalActions.length, 0);
          const audits = await runs.listAudit(run.id, { limit: 100 });
          assert.deepEqual(
            new Set(
              audits.items
                .filter((item) => item.operation === "local_agent_run.progress")
                .map((item) => item.stage),
            ),
            new Set(["brief_read", "work_read", "result_prepared"]),
          );
          assert.equal(
            audits.items.filter(
              (item) => item.operation === "local_agent_run.succeeded",
            ).length,
            1,
          );
          const allowed = audits.items.filter(
            (item) => item.decision === "allowed",
          );
          assert.deepEqual(allowed.map((item) => item.operation).sort(), [
            "project.brief.read",
            "work.read",
          ]);
          assert.deepEqual(
            new Set(allowed.map((item) => item.id)),
            new Set(completed.result?.contextReadIds),
          );
          const repeated = await processor(job);
          assert.equal(repeated.id, run.id);
          assert.equal(repeated.attempts, 2);
          assert.deepEqual(repeated.result, completed.result);
        },
      );

      await t.test(
        "attempt callback lease rejects wrong scope, token, replay, expiry, and cancellation",
        async () => {
          const prepared = prepare(
            `local-agent-callback:${crypto.randomUUID()}`,
          );
          const run = await submission.submitOnce(prepared);
          const token = "a".repeat(64);
          const tokenDigest = createHash("sha256").update(token).digest("hex");
          const expiresAt = new Date(Date.now() + 30_000);
          const attemptId = await runs.beginAttempt(run.id, {
            tokenDigest,
            expiresAt,
          });
          assert.ok(attemptId);
          const callback = {
            version: 1 as const,
            attemptId,
            sequence: 1,
            kind: "heartbeat" as const,
            stage: "started" as const,
          };
          const accepted = await runs.reportCallback({
            runId: run.id,
            tokenDigest,
            callback,
          });
          assert.equal(accepted.sequence, 1);
          assert.equal(accepted.sourceLabel, "Synthetic local runner callback");
          const rejected = async (
            input: Parameters<typeof runs.reportCallback>[0],
            code: string,
          ) =>
            assert.rejects(
              runs.reportCallback(input),
              (error: unknown) =>
                error instanceof LocalRunnerCallbackError &&
                error.code === code,
            );
          await rejected(
            { runId: run.id, tokenDigest, callback },
            "CALLBACK_SEQUENCE_CONFLICT",
          );
          await rejected(
            {
              runId: run.id,
              tokenDigest: "b".repeat(64),
              callback: { ...callback, sequence: 2 },
            },
            "CALLBACK_AUTH_DENIED",
          );
          await rejected(
            {
              runId: run.id,
              tokenDigest,
              callback: {
                ...callback,
                attemptId: crypto.randomUUID(),
                sequence: 2,
              },
            },
            "CALLBACK_SCOPE_DENIED",
          );
          await rejected(
            {
              runId: run.id,
              tokenDigest,
              callback: { ...callback, sequence: 2 },
              now: new Date(expiresAt.getTime()),
            },
            "CALLBACK_EXPIRED",
          );
          const denials = (
            await runs.listAudit(run.id, { limit: 100 })
          ).items.filter(
            (item) => item.operation === "local_agent_run.callback.denied",
          );
          assert.deepEqual(
            new Set(denials.map((item) => item.code)),
            new Set([
              "CALLBACK_SEQUENCE_CONFLICT",
              "CALLBACK_AUTH_DENIED",
              "CALLBACK_SCOPE_DENIED",
              "CALLBACK_EXPIRED",
            ]),
          );
          await assert.rejects(
            admin.query(
              "update local_agent_callback_event set stage = 'work_read' where id = $1",
              [accepted.id],
            ),
            { code: "23514" },
          );
          await assert.rejects(
            admin.query(
              `insert into local_agent_callback_event
               (id, run_id, attempt_id, sequence, kind, artifact_name,
                artifact_mime_type, artifact_content, artifact_bytes)
               values ($1, $2, $3, 2, 'artifact', 'synthetic-run-report.json',
                       'application/json', '{}', 2)`,
              [crypto.randomUUID(), run.id, attemptId],
            ),
            { code: "23514" },
          );
          await assert.rejects(
            admin.query(
              `insert into local_agent_callback_event
               (id, run_id, attempt_id, sequence, kind)
               values ($1, $2, $3, 2, 'heartbeat')`,
              [crypto.randomUUID(), run.id, attemptId],
            ),
            { code: "23514" },
          );
          await assert.rejects(
            admin.query(
              "delete from local_agent_callback_event where id = $1",
              [accepted.id],
            ),
            { code: "23514" },
          );
          assert.equal((await runs.cancel(run.id))?.state, "canceled");
          await rejected(
            {
              runId: run.id,
              tokenDigest,
              callback: { ...callback, sequence: 2 },
            },
            "CALLBACK_RUN_NOT_ACTIVE",
          );
        },
      );

      await t.test(
        "queued and running cancellation prevent a synthetic result",
        async () => {
          const queuedPrepared = prepare(
            `local-agent-cancel:${crypto.randomUUID()}`,
          );
          const queued = await submission.submitOnce(queuedPrepared);
          const canceledQueued = await runs.cancel(queued.id);
          assert.equal(canceledQueued?.state, "canceled");
          const queuedReplay = await processor(
            localAgentRunJobV1Schema.parse({
              version: 1,
              runId: queued.id,
              occurrenceId: queuedPrepared.occurrenceId,
            }),
          );
          assert.equal(queuedReplay.state, "canceled");
          assert.equal(queuedReplay.attempts, 0);
          assert.equal(queuedReplay.result, null);
          assert.equal((await runs.cancel(queued.id))?.state, "canceled");

          const runningPrepared = prepare(
            `local-agent-cancel:${crypto.randomUUID()}`,
          );
          const running = await submission.submitOnce(runningPrepared);
          let started!: () => void;
          let resume!: () => void;
          const atBoundary = new Promise<void>((resolve) => {
            started = resolve;
          });
          const blocked = new Promise<void>((resolve) => {
            resume = resolve;
          });
          const pausedProcessor = createLocalAgentRunProcessor(runs, context, {
            beforeContextReads: async () => {
              started();
              await blocked;
            },
          });
          const processing = pausedProcessor(
            localAgentRunJobV1Schema.parse({
              version: 1,
              runId: running.id,
              occurrenceId: runningPrepared.occurrenceId,
            }),
          );
          await atBoundary;
          assert.equal((await runs.cancel(running.id))?.state, "canceled");
          resume();
          const canceledRunning = await processing;
          assert.equal(canceledRunning.state, "canceled");
          assert.equal(canceledRunning.attemptHistory[0]?.state, "canceled");
          assert.equal(canceledRunning.result, null);
          const timeline = await runs.listAudit(running.id, { limit: 20 });
          assert.ok(
            timeline.items.some(
              (item) => item.operation === "local_agent_run.canceled",
            ),
          );
          assert.equal(
            timeline.items.some(
              (item) => item.operation === "project.brief.read",
            ),
            false,
          );
        },
      );

      await t.test("project and operation denials are audited", async () => {
        const run = await submission.submitOnce(firstPrepared);
        await assert.rejects(
          context.read(run.id, {
            projectId: otherProjectId,
            operation: "work.read",
            reason: "Cross-project probe",
          }),
          (error: unknown) =>
            error instanceof LocalAgentError &&
            error.code === "PROJECT_SCOPE_DENIED",
        );
        await assert.rejects(
          context.read(
            run.id,
            {
              projectId,
              operation: "external.action",
              reason: "token=hidden should be redacted",
            },
            "manual-local-reviewer",
          ),
          (error: unknown) =>
            error instanceof LocalAgentError &&
            error.code === "OPERATION_DENIED",
        );
        const audits = await runs.listAudit(run.id, { limit: 100 });
        assert.ok(
          audits.items.some(
            (item) =>
              item.decision === "denied" &&
              item.code === "PROJECT_SCOPE_DENIED" &&
              item.projectId === otherProjectId &&
              item.actor === `synthetic-agent:${agent.id}`,
          ),
        );
        assert.ok(
          audits.items.some(
            (item) =>
              item.decision === "denied" &&
              item.code === "OPERATION_DENIED" &&
              item.actor === "local-reviewer:unattributed" &&
              item.reason ===
                "Manual local context read; supplied reason withheld",
          ),
        );
        assert.equal(JSON.stringify(audits).includes("hidden"), false);
        const firstPage = await runs.listAudit(run.id, { limit: 2 });
        assert.ok(firstPage.nextCursor);
        const secondPage = await runs.listAudit(run.id, {
          limit: 2,
          cursor: firstPage.nextCursor!,
        });
        assert.ok(secondPage.items.length);
        assert.equal(await runs.getWorkItem(workItemId, otherProjectId), null);
      });

      await t.test("two pg-boss replicas produce one result", async () => {
        const prepared = prepare(`local-agent-worker:${crypto.randomUUID()}`);
        const run = await submission.submitOnce(prepared);
        const replica = await createPgBossProducer({
          connectionString: runtimeUrl.toString(),
          max: 2,
        });
        let primaryWorkerId: string | undefined;
        let replicaWorkerId: string | undefined;
        try {
          primaryWorkerId = await producer.boss.work(
            LOCAL_AGENT_RUN_QUEUE,
            { pollingIntervalSeconds: 0.5 },
            async ([job]) => {
              if (!job) throw new Error("pg-boss delivered no local agent job");
              await processor(localAgentRunJobV1Schema.parse(job.data));
            },
          );
          replicaWorkerId = await replica.boss.work(
            LOCAL_AGENT_RUN_QUEUE,
            { pollingIntervalSeconds: 0.5 },
            async ([job]) => {
              if (!job) throw new Error("pg-boss delivered no local agent job");
              await processor(localAgentRunJobV1Schema.parse(job.data));
            },
          );
          const deadline = Date.now() + 20_000;
          let current = await runs.getById(run.id);
          while (current?.state !== "succeeded" && Date.now() < deadline) {
            await delay(100);
            current = await runs.getById(run.id);
          }
          assert.equal(current?.state, "succeeded");
          assert.equal(current?.attempts, 1);
          const audits = await runs.listAudit(run.id, { limit: 100 });
          assert.equal(
            audits.items.filter(
              (item) => item.operation === "local_agent_run.succeeded",
            ).length,
            1,
          );
          assert.deepEqual(
            localAgentRunSchema.parse(current).result?.externalActions,
            [],
          );
        } finally {
          if (primaryWorkerId)
            await producer.boss.offWork(LOCAL_AGENT_RUN_QUEUE, {
              id: primaryWorkerId,
            });
          if (replicaWorkerId)
            await replica.boss.offWork(LOCAL_AGENT_RUN_QUEUE, {
              id: replicaWorkerId,
            });
          await replica.close();
        }
      });

      await t.test("expired running grant denies context", async () => {
        const prepared = {
          ...prepare(`local-agent-expired:${crypto.randomUUID()}`),
          grantTtlSeconds: 1,
        };
        const run = await submission.submitOnce(prepared);
        const attemptId = await runs.beginAttempt(run.id);
        assert.ok(attemptId);
        const futureContext = createAgentContextService(
          {
            getAuthorization: runs.getAuthorization,
            getProjectBrief: brief.getBrief,
            getWorkItem: runs.getWorkItem,
            recordAudit: runs.recordAudit,
            listAudit: runs.listAudit,
          },
          () => new Date(Date.now() + 2_000),
        );
        await assert.rejects(
          futureContext.read(run.id, {
            projectId,
            operation: "project.brief.read",
            reason: "Expired grant probe",
          }),
          (error: unknown) =>
            error instanceof LocalAgentError && error.code === "GRANT_EXPIRED",
        );
        await runs.failAttempt(run.id, attemptId, "Grant expired");
        const audits = await runs.listAudit(run.id, { limit: 100 });
        assert.ok(
          audits.items.some(
            (item) =>
              item.code === "GRANT_EXPIRED" && item.decision === "denied",
          ),
        );
        assert.equal((await runs.getById(run.id))?.result, null);
      });
    } finally {
      await producer.close();
      await runtime.close();
      await admin.end();
    }
  },
);
