import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import type { PgBoss } from "pg-boss";
import {
  buildExecutionPacketContents,
  createSimulatedApprovalProcessor,
  prepareSimulatedApproval,
} from "@commandry/application";
import { simulatedApprovalJobV1Schema } from "@commandry/contracts";
import {
  createDatabase,
  createExecutionPacketRepository,
  createLocalAgentRepository,
  createSimulatedApprovalRepository,
  schema,
} from "@commandry/db";
import { SimulatedApprovalError } from "@commandry/domain";
import {
  createPgBossProducer,
  createSimulatedApprovalDecisionSubmission,
  SIMULATED_APPROVAL_DEAD_LETTER_QUEUE,
  SIMULATED_APPROVAL_QUEUE,
} from "./pg-boss.js";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Run through pnpm test:integration");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

function databaseCauseIncludes(error: unknown, text: string) {
  return (
    error instanceof Error &&
    error.cause instanceof Error &&
    error.cause.message.includes(text)
  );
}

test(
  "sensitive local review decides atomically and worker records only a no-effect outcome",
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
    const repo = createSimulatedApprovalRepository(runtime.db);
    const submission = createSimulatedApprovalDecisionSubmission(
      runtime.db,
      producer.boss,
    );
    const processor = createSimulatedApprovalProcessor(repo);
    const projectId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();
    const linkId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    try {
      await runtime.db
        .insert(schema.project)
        .values({ id: projectId, name: "Approval queue project" });
      await runtime.db.insert(schema.resource).values({
        id: resourceId,
        kind: "service",
        name: "Synthetic restart target",
        state: "healthy",
        lastObservedAt: new Date("2026-09-25T12:00:00.000Z"),
      });
      await runtime.db.insert(schema.projectResourceLink).values({
        id: linkId,
        projectId,
        resourceId,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
      await runtime.db.insert(schema.capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "A local-only action review",
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
        title: "Simulate resource action",
        description: "No external command",
      });
      const packet = await createExecutionPacketRepository(runtime.db).create(
        {
          workItemId,
          selectedKnowledgeIds: [],
          selectedResourceIds: [resourceId],
        },
        buildExecutionPacketContents,
      );
      const profiles = createLocalAgentRepository(runtime.db);
      const agent = await profiles.create({
        name: "Synthetic approval worker",
      });
      await profiles.assignProject(agent.id, projectId);
      const now = new Date();
      await runtime.db.insert(schema.localAgentRun).values({
        id: runId,
        agentId: agent.id,
        packetId: packet.id,
        packetVersion: packet.packetVersion,
        packetDigest: packet.contentDigest,
        workItemId,
        projectId,
        occurrenceId: `approval-test-run:${runId}`,
        requestFingerprint: "a".repeat(64),
        state: "succeeded",
        attempts: 1,
        result: {
          summary: "Synthetic context read finished",
          contextReadIds: [crypto.randomUUID()],
          evidence: [
            {
              kind: "work_item",
              id: workItemId,
              href: `/api/v1/work-items/${workItemId}`,
              recordedAt: now.toISOString(),
              occurredAt: null,
              sourceLabel: "Manual local capture",
              isSynthetic: false,
            },
          ],
          runtime: "local-fake-v1",
          isSynthetic: true,
          verificationStatus: "unverified",
          externalActions: [],
        },
        startedAt: now,
        completedAt: now,
      });
      await runtime.db.insert(schema.localAgentRunAttempt).values({
        id: crypto.randomUUID(),
        runId,
        number: 1,
        state: "succeeded",
        startedAt: now,
        completedAt: now,
      });
      await runtime.db.insert(schema.localAgentRunGrant).values(
        (["project.brief.read", "work.read"] as const).map((operation) => ({
          id: crypto.randomUUID(),
          runId,
          projectId,
          operation,
          expiresAt: new Date(now.getTime() + 300_000),
          createdAt: now,
        })),
      );
      const run = await repo.getRun(runId);
      const storedPacket = await repo.getPacket(packet.id);
      const target = await repo.getTargetLink(linkId);
      assert.ok(run && storedPacket && target);
      const propose = async (ttlSeconds = 120) =>
        repo.proposeOnce(
          prepareSimulatedApproval(
            run,
            storedPacket,
            target,
            {
              projectResourceLinkId: linkId,
              mode: "graceful",
              occurrenceId: `approval-proposal:${crypto.randomUUID()}`,
            },
            {
              localApprovalAutoCeiling: "reversible",
              localApprovalTtlSeconds: ttlSeconds,
            },
            new Date(),
          ),
        );
      const decisionInput = (
        approval: { id: string; descriptorDigest: string },
        decision: "approve" | "reject" | "cancel" = "approve",
      ) => ({
        id: approval.id,
        decision,
        expectedDigest: approval.descriptorDigest,
        occurrenceId: `decision:${crypto.randomUUID()}`,
        decidedAt: new Date().toISOString(),
      });

      await t.test(
        "queue policy and transactional approval are replay safe",
        async () => {
          const queue = await admin.query<{
            retry_limit: number;
            retry_delay: number;
            dead_letter: string;
          }>(
            "SELECT retry_limit,retry_delay,dead_letter FROM pgboss.queue WHERE name=$1",
            [SIMULATED_APPROVAL_QUEUE],
          );
          assert.equal(queue.rows[0]?.retry_limit, 3);
          assert.equal(queue.rows[0]?.retry_delay, 1);
          assert.equal(
            queue.rows[0]?.dead_letter,
            SIMULATED_APPROVAL_DEAD_LETTER_QUEUE,
          );
          const approval = await propose();
          const input = decisionInput(approval);
          const decided = await submission.decideOnce(input);
          assert.equal(decided.state, "approved");
          assert.equal(decided.decision?.kind, "approve");
          assert.equal((await submission.decideOnce(input)).id, approval.id);
          const jobs = await admin.query<{ data: unknown }>(
            "SELECT data FROM pgboss.job WHERE name=$1 AND data->>'approvalId'=$2",
            [SIMULATED_APPROVAL_QUEUE, approval.id],
          );
          assert.equal(jobs.rows.length, 1);
          assert.deepEqual(jobs.rows[0]?.data, {
            version: 1,
            approvalId: approval.id,
            descriptorDigest: approval.descriptorDigest,
          });
          const before = await runtime.db
            .select()
            .from(schema.resource)
            .where(eq(schema.resource.id, resourceId));
          const processed = await processor(
            simulatedApprovalJobV1Schema.parse(jobs.rows[0]?.data),
          );
          assert.equal(processed.outcome?.kind, "simulated_only");
          assert.equal(processed.outcome?.verificationStatus, "unverified");
          assert.deepEqual(processed.outcome?.externalActions, []);
          assert.equal(processed.outcome?.resourceStateChanged, false);
          const replay = await processor(
            simulatedApprovalJobV1Schema.parse(jobs.rows[0]?.data),
          );
          assert.equal(
            replay.outcome?.recordedAt,
            processed.outcome?.recordedAt,
          );
          const attempts = await runtime.db
            .select()
            .from(schema.simulatedApprovalAttempt)
            .where(eq(schema.simulatedApprovalAttempt.proposalId, approval.id));
          assert.equal(attempts.length, 1);
          assert.equal(attempts[0]?.state, "succeeded");
          const after = await runtime.db
            .select()
            .from(schema.resource)
            .where(eq(schema.resource.id, resourceId));
          assert.equal(after[0]?.state, before[0]?.state);
          assert.equal(
            after[0]?.lastObservedAt?.toISOString(),
            before[0]?.lastObservedAt?.toISOString(),
          );
          const auditSeen = new Set<string>();
          let cursor: string | undefined;
          for (let page = 0; page < 10; page += 1) {
            const audit = await repo.listAudit(approval.id, {
              limit: 1,
              cursor,
            });
            audit.items.forEach((item) => auditSeen.add(item.eventType));
            if (!audit.nextCursor) break;
            cursor = audit.nextCursor;
          }
          assert.deepEqual(
            auditSeen,
            new Set(["proposed", "approved", "simulation_recorded"]),
          );
          await assert.rejects(
            runtime.db.execute(
              sql`update simulated_approval_state set decided_at=now() where proposal_id=${approval.id}::uuid`,
            ),
            (error: unknown) => databaseCauseIncludes(error, "final"),
          );
          await assert.rejects(
            runtime.db.execute(
              sql`update simulated_approval_outcome set summary='changed' where proposal_id=${approval.id}::uuid`,
            ),
            (error: unknown) => databaseCauseIncludes(error, "immutable"),
          );
        },
      );

      await t.test(
        "rejection never queues and concurrent decisions have one winner",
        async () => {
          const rejected = await propose();
          const rejection = await submission.decideOnce(
            decisionInput(rejected, "reject"),
          );
          assert.equal(rejection.state, "rejected");
          const noJob = await admin.query(
            "SELECT id FROM pgboss.job WHERE name=$1 AND data->>'approvalId'=$2",
            [SIMULATED_APPROVAL_QUEUE, rejected.id],
          );
          assert.equal(noJob.rows.length, 0);
          const concurrent = await propose();
          const results = await Promise.allSettled([
            submission.decideOnce(decisionInput(concurrent, "approve")),
            submission.decideOnce(decisionInput(concurrent, "reject")),
          ]);
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const decisions = await runtime.db
            .select()
            .from(schema.simulatedApprovalDecision)
            .where(
              eq(schema.simulatedApprovalDecision.proposalId, concurrent.id),
            );
          assert.equal(decisions.length, 1);
          const audits = await repo.listAudit(concurrent.id, { limit: 10 });
          assert.equal(
            audits.items.filter((item) => item.eventType !== "proposed").length,
            1,
          );
        },
      );

      await t.test("queue failure rolls back decision and audit", async () => {
        const pending = await propose();
        const failingBoss = { send: async () => null } as unknown as PgBoss;
        const failing = createSimulatedApprovalDecisionSubmission(
          runtime.db,
          failingBoss,
        );
        await assert.rejects(
          failing.decideOnce(decisionInput(pending)),
          /not enqueued/,
        );
        assert.equal((await repo.getById(pending.id))?.state, "pending");
        const decisions = await runtime.db
          .select()
          .from(schema.simulatedApprovalDecision)
          .where(eq(schema.simulatedApprovalDecision.proposalId, pending.id));
        assert.equal(decisions.length, 0);
        const audit = await repo.listAudit(pending.id, { limit: 10 });
        assert.deepEqual(
          audit.items.map((item) => item.eventType),
          ["proposed"],
        );
      });

      await t.test(
        "delayed approved job expires with audit and no outcome",
        async () => {
          const approval = await propose(1);
          await submission.decideOnce(decisionInput(approval));
          await delay(1200);
          assert.equal(await repo.reconcileExpired(approval.id), 1);
          const expired = await repo.getById(approval.id);
          assert.equal(expired?.state, "expired");
          assert.equal(expired?.decision?.kind, "approve");
          assert.equal(expired?.outcome, null);
          assert.equal(await repo.reconcileExpired(approval.id), 0);
          const audit = await repo.listAudit(approval.id, { limit: 10 });
          assert.ok(audit.items.some((item) => item.eventType === "expired"));
          await assert.rejects(
            processor({
              version: 1,
              approvalId: approval.id,
              descriptorDigest: approval.descriptorDigest,
            }),
            (error: unknown) =>
              error instanceof SimulatedApprovalError &&
              error.code === "APPROVAL_EXPIRED",
          );
        },
      );
    } finally {
      await producer.close();
      await runtime.close();
      await admin.end();
    }
  },
);
