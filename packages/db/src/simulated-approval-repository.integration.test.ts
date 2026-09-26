import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import {
  buildExecutionPacketContents,
  digestSimulatedApprovalDescriptor,
  fingerprintSimulatedActionRequest,
  prepareSimulatedApproval,
} from "@commandry/application";
import { simulatedApprovalSchema } from "@commandry/contracts";
import { SimulatedApprovalError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createExecutionPacketRepository } from "./execution-packet-repository";
import { createLocalAgentRepository } from "./local-agent-repository";
import { createSimulatedApprovalRepository } from "./simulated-approval-repository";
import {
  auditEvent,
  capture,
  localAgentRun,
  localAgentRunAttempt,
  localAgentRunGrant,
  project,
  projectResourceLink,
  resource,
  simulatedActionProposal,
  simulatedApprovalDecision,
  workItem,
} from "./schema";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Run through pnpm test:integration");

function databaseCauseIncludes(error: unknown, text: string) {
  return (
    error instanceof Error &&
    error.cause instanceof Error &&
    error.cause.message.includes(text)
  );
}

test(
  "simulated proposals preserve exact packet-selected targets, immutable descriptors, and audited expiry",
  { timeout: 60_000 },
  async (t) => {
    const database = createDatabase({ connectionString, max: 4 });
    const db = database.db;
    const repo = createSimulatedApprovalRepository(db);
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    const captureId = crypto.randomUUID();
    const workItemId = crypto.randomUUID();
    const resourceIds = Array.from({ length: 4 }, () => crypto.randomUUID());
    const linkIds = Array.from({ length: 4 }, () => crypto.randomUUID());
    try {
      await db.insert(project).values([
        { id: projectId, name: "Approval project" },
        { id: otherProjectId, name: "Other approval project" },
      ]);
      await db.insert(resource).values(
        resourceIds.map((id, index) => ({
          id,
          kind: "service",
          name: `Synthetic approval resource ${index}`,
        })),
      );
      await db.insert(projectResourceLink).values(
        linkIds.map((id, index) => ({
          id,
          projectId: index === 1 ? otherProjectId : projectId,
          resourceId: resourceIds[index]!,
          type: "supports" as const,
          sourceKind: "resource" as const,
          targetKind: "project" as const,
          lifecycle: (index === 3 ? "archived" : "active") as
            "archived" | "active",
        })),
      );
      await db.insert(capture).values({
        id: captureId,
        inputType: "text",
        originalContent: "Original work captured locally",
        source: "manual-local",
        author: "local-user",
        state: "filed",
        projectId,
        filedRecordKind: "task",
        filedRecordId: workItemId,
        filedAt: new Date(),
      });
      await db.insert(workItem).values({
        id: workItemId,
        projectId,
        sourceCaptureId: captureId,
        title: "Review synthetic action",
        description: "No external operation is permitted",
      });
      const packet = await createExecutionPacketRepository(db).create(
        {
          workItemId,
          selectedKnowledgeIds: [],
          selectedResourceIds: [resourceIds[0]!],
        },
        buildExecutionPacketContents,
      );
      const profiles = createLocalAgentRepository(db);
      const agent = await profiles.create({ name: "Synthetic approval agent" });
      await profiles.assignProject(agent.id, projectId);
      const runId = crypto.randomUUID();
      const runAt = new Date();
      await db.insert(localAgentRun).values({
        id: runId,
        agentId: agent.id,
        packetId: packet.id,
        packetVersion: packet.packetVersion,
        packetDigest: packet.contentDigest,
        workItemId,
        projectId,
        occurrenceId: `approval-fixture:${runId}`,
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
              recordedAt: runAt.toISOString(),
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
        startedAt: runAt,
        completedAt: runAt,
      });
      await db.insert(localAgentRunAttempt).values({
        id: crypto.randomUUID(),
        runId,
        number: 1,
        state: "succeeded",
        startedAt: runAt,
        completedAt: runAt,
      });
      await db.insert(localAgentRunGrant).values(
        (["project.brief.read", "work.read"] as const).map((operation) => ({
          id: crypto.randomUUID(),
          runId,
          projectId,
          operation,
          expiresAt: new Date(runAt.getTime() + 300_000),
          createdAt: runAt,
        })),
      );
      const run = await repo.getRun(runId);
      const persistedPacket = await repo.getPacket(packet.id);
      const target = await repo.getTargetLink(linkIds[0]!);
      assert.ok(run && persistedPacket && target);
      const prepare = (occurrenceId: string, ttlSeconds = 120) =>
        prepareSimulatedApproval(
          run,
          persistedPacket,
          target,
          {
            projectResourceLinkId: target.id,
            mode: "graceful",
            occurrenceId,
          },
          {
            localApprovalAutoCeiling: "reversible",
            localApprovalTtlSeconds: ttlSeconds,
          },
          new Date(),
        );
      const firstInput = prepare(`proposal:${crypto.randomUUID()}`);
      const first = simulatedApprovalSchema.parse(
        await repo.proposeOnce(firstInput),
      );

      await t.test(
        "proposal and audit commit once on occurrence replay",
        async () => {
          assert.equal(first.state, "pending");
          assert.equal(first.descriptorDigest, firstInput.descriptorDigest);
          assert.equal(
            first.descriptor.target.projectResourceLinkId,
            linkIds[0],
          );
          assert.equal(first.descriptor.policy.grantScope, "simulation_only");
          assert.deepEqual(first.descriptor.externalActions, []);
          assert.equal((await repo.proposeOnce(firstInput)).id, first.id);
          const audit = await repo.listAudit(first.id, { limit: 1 });
          assert.deepEqual(
            audit.items.map((item) => item.eventType),
            ["proposed"],
          );
          assert.equal(audit.items[0]?.actor, "local-reviewer:unattributed");
          await assert.rejects(
            repo.proposeOnce({
              ...firstInput,
              requestFingerprint: "f".repeat(64),
            }),
            (error: unknown) =>
              error instanceof SimulatedApprovalError &&
              error.code === "DIGEST_MISMATCH",
          );
        },
      );

      await t.test(
        "cross-project, nonpacket, and archived links are denied in transaction",
        async () => {
          const retarget = (index: number) => {
            const input = prepare(`invalid-target:${crypto.randomUUID()}`);
            const descriptor = {
              ...input.descriptor,
              target: {
                ...input.descriptor.target,
                resourceId: resourceIds[index]!,
                projectResourceLinkId: linkIds[index]!,
              },
            };
            return {
              ...input,
              resourceId: resourceIds[index]!,
              projectResourceLinkId: linkIds[index]!,
              descriptor,
              descriptorDigest: digestSimulatedApprovalDescriptor(descriptor),
              requestFingerprint: fingerprintSimulatedActionRequest(runId, {
                projectResourceLinkId: linkIds[index]!,
                mode: "graceful",
                occurrenceId: input.occurrenceId,
              }),
            };
          };
          for (const [index, code] of [
            [1, "PROJECT_SCOPE_DENIED"],
            [2, "TARGET_NOT_SELECTED"],
            [3, "LINK_NOT_ACTIVE"],
          ] as const) {
            await assert.rejects(
              repo.proposeOnce(retarget(index)),
              (error: unknown) =>
                error instanceof SimulatedApprovalError && error.code === code,
            );
          }
        },
      );

      await t.test(
        "strict descriptor and SQL trigger reject payload and history mutation",
        async () => {
          await assert.rejects(
            repo.proposeOnce({
              ...prepare(`payload:${crypto.randomUUID()}`),
              descriptor: {
                ...firstInput.descriptor,
                url: "https://example.invalid/secret?token=unsafe",
              },
            }),
          );
          await assert.rejects(
            db.execute(
              sql`update simulated_action_proposal set descriptor_digest = ${"f".repeat(64)} where id = ${first.id}::uuid`,
            ),
            (error: unknown) => databaseCauseIncludes(error, "immutable"),
          );
          await assert.rejects(
            db.execute(
              sql`delete from simulated_action_proposal where id = ${first.id}::uuid`,
            ),
            (error: unknown) => databaseCauseIncludes(error, "immutable"),
          );
          const [proposal] = await db
            .select()
            .from(simulatedActionProposal)
            .where(eq(simulatedActionProposal.id, first.id));
          assert.equal(proposal?.descriptorDigest, firstInput.descriptorDigest);
          const unrelatedAuditId = crypto.randomUUID();
          await db.insert(auditEvent).values({
            id: unrelatedAuditId,
            actor: "test",
            operation: "test.mutable_unrelated",
            details: { detail: "before" },
          });
          await db
            .update(auditEvent)
            .set({ details: { detail: "after" } })
            .where(eq(auditEvent.id, unrelatedAuditId));
          const [unrelated] = await db
            .select()
            .from(auditEvent)
            .where(eq(auditEvent.id, unrelatedAuditId));
          assert.equal(unrelated?.details.detail, "after");
        },
      );

      await t.test(
        "cursor pages reach every proposal and audit event",
        async () => {
          const created = [first.id];
          for (let index = 0; index < 3; index += 1) {
            created.push(
              (await repo.proposeOnce(prepare(`cursor:${crypto.randomUUID()}`)))
                .id,
            );
          }
          const seen = new Set<string>();
          let cursor: string | undefined;
          for (let page = 0; page < 100; page += 1) {
            const result = await repo.list({ limit: 2, cursor });
            for (const item of result.items) {
              assert.equal(seen.has(item.id), false);
              seen.add(item.id);
            }
            if (!result.nextCursor) break;
            cursor = result.nextCursor;
          }
          assert.ok(created.every((id) => seen.has(id)));
        },
      );

      await t.test(
        "pending expiry is persisted once with decision and audit",
        async () => {
          const expiry = await repo.proposeOnce(
            prepare(`expiry:${crypto.randomUUID()}`, 1),
          );
          await delay(1200);
          assert.equal(await repo.reconcileExpired(expiry.id), 1);
          assert.equal(await repo.reconcileExpired(expiry.id), 0);
          assert.equal((await repo.getById(expiry.id))?.state, "expired");
          const decision = await db
            .select()
            .from(simulatedApprovalDecision)
            .where(eq(simulatedApprovalDecision.proposalId, expiry.id));
          assert.equal(decision.length, 1);
          assert.equal(decision[0]?.decision, "expired");
          const audit = await repo.listAudit(expiry.id, { limit: 1 });
          assert.equal(audit.items[0]?.eventType, "expired");
        },
      );
    } finally {
      await database.close();
    }
  },
);
