import type { PoolClient } from "pg";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  createFoundationFindingProposalService,
  createFoundationMachineService,
  createFoundationOwnerService,
  type FoundationIdentity,
} from "@commandry/application";
import type {
  FoundationFindingCitation,
  FoundationFindingProposalInput,
  FoundationFindingProposalDetail,
  FoundationFindingProposalSubmission,
} from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import {
  createFoundationFindingProposalAccessRepository,
  createFoundationFindingProposalRecordRepository,
} from "./foundation-finding-proposal-repository";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = password;
const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;
const integrity = (error: unknown): boolean => {
  const value = error as { code?: string; cause?: unknown };
  return (
    ["23514", "23503", "23505"].includes(value?.code ?? "") ||
    Boolean(value?.cause && integrity(value.cause))
  );
};
const migration = readFileSync(
  new URL(
    "../migrations/0066_foundation_finding_proposals.sql",
    import.meta.url,
  ),
  "utf8",
)
  .split("--> statement-breakpoint")
  .filter((part) => part.trim());

const sqlConstraint =
  (name: string) =>
  (error: unknown): boolean => {
    const value = error as {
      code?: string;
      constraint?: string;
      cause?: unknown;
    };
    return (
      (value?.code === "23514" && value.constraint === name) ||
      Boolean(value?.cause && sqlConstraint(name)(value.cause))
    );
  };

async function insertSqlProposal(
  client: PoolClient,
  detail: FoundationFindingProposalDetail,
  numeric = false,
) {
  const proposalId = randomUUID(),
    captureId = randomUUID();
  const binding = {
    ...detail.suggestion.proposal.binding,
    proposalId,
    captureId,
  };
  let proposal = JSON.stringify({
    binding,
    contentDigest: foundationDigest(binding),
  });
  if (numeric)
    proposal = proposal
      .replace('"schemaVersion":1,', '"schemaVersion":1.0,')
      .replace('"proposalVersion":1,', '"proposalVersion":1.0,');
  await client.query(
    "INSERT INTO public.capture(id,input_type,original_content,source,author,project_id,created_at) VALUES($1,'text',$2,'foundation-client',$3,$4,$5)",
    [
      captureId,
      detail.capture.originalContent,
      binding.principalId,
      binding.projectId,
      binding.submittedAt,
    ],
  );
  await client.query(
    "INSERT INTO public.capture_triage_suggestion(id,capture_id,kind,proposed_project_id,title,body,confidence,proposal,rationale,rule_version,source_label,created_at) VALUES($1,$2,'note',$3,$4,$5,NULL,$6::jsonb,$7,'agent-finding-proposal/v1','Agent finding proposal',$8)",
    [
      proposalId,
      captureId,
      binding.projectId,
      binding.proposedTitle,
      binding.proposedBody,
      proposal,
      binding.rationale,
      binding.submittedAt,
    ],
  );
  await client.query(
    "INSERT INTO public.foundation_finding_proposal(proposal_id,capture_id,project_id,environment) VALUES($1,$2,$3,$4)",
    [proposalId, captureId, binding.projectId, binding.environment],
  );
  for (const [ordinal, citation] of binding.citations.entries())
    await client.query(
      "INSERT INTO public.foundation_finding_citation(proposal_id,project_id,evidence_id,ordinal) VALUES($1,$2,$3,$4)",
      [proposalId, binding.projectId, citation.evidenceId, ordinal],
    );
  return { proposalId, captureId, binding };
}

async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 5 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const peer = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = randomUUID();
  const foreignProjectId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  let time = Date.now();
  const now = () => new Date(time);
  const expiresAt = new Date(time + 3_600_000).toISOString();
  await admin.pool.query(
    "INSERT INTO public.project(id,name) VALUES($1,'Finding fixture'),($2,'Foreign finding fixture')",
    [projectId, foreignProjectId],
  );
  await admin.pool.query(
    'INSERT INTO public."user"(id,name,email) VALUES($1,$2,$3)',
    [userId, "Finding owner", "finding-" + userId + "@example.test"],
  );
  await admin.pool.query(
    "INSERT INTO public.session(id,user_id,token,expires_at) VALUES($1,$2,$3,$4)",
    [sessionId, userId, randomUUID(), expiresAt],
  );
  const identity: FoundationIdentity = {
    principalId: "user:" + userId,
    sessionId,
    expiresAt,
  };
  const access = createFoundationAccessRepository(runtime.db, { now });
  const owner = createFoundationOwnerService(access, identity, {
    environment: "test",
    now,
  });
  const machine = createFoundationMachineService(access, {
    environment: "test",
    now,
  });
  const issued = await owner.createClient(
    {
      name: "Finding fixture",
      projectId,
      environment: "test",
      operations: ["finding.read", "finding.propose", "evidence.record"],
      ttlSeconds: 3600,
    },
    "issue-" + randomUUID(),
  );
  const service = createFoundationFindingProposalService(
    createFoundationFindingProposalAccessRepository(runtime.db, { now }),
    { environment: "test", now },
  );
  const peerService = createFoundationFindingProposalService(
    createFoundationFindingProposalAccessRepository(peer.db, { now }),
    { environment: "test", now },
  );
  const sourceCaptureId = randomUUID();
  const sourceContent =
    "  Exact source bytes\nCited meaning remains a claim. Cafe\u0301 \u{1f642}  ";
  await admin.pool.query(
    "INSERT INTO public.capture(id,input_type,original_content,project_id) VALUES($1,'text',$2,$3)",
    [sourceCaptureId, sourceContent, projectId],
  );
  const recorded = await machine.recordEvidence(
    issued.token,
    {
      projectId,
      sourceKind: "capture",
      sourceId: sourceCaptureId,
      sourceVersion: null,
      contentDigest: digest(sourceContent),
      locator: "commandry:capture:" + sourceCaptureId,
      observedAt: null,
      availability: "available",
    },
    "evidence-" + randomUUID(),
  );
  const citation: FoundationFindingCitation = {
    evidenceId: recorded.record.id,
    sourceKind: "capture",
    sourceId: sourceCaptureId,
    sourceVersion: null,
    contentDigest: digest(sourceContent),
    selection: "whole_source",
  };
  const input = (
    overrides: Partial<FoundationFindingProposalInput> = {},
  ): FoundationFindingProposalInput => ({
    projectId,
    originalContent: "  Original finding\nRaw source stays exact.\n",
    proposedTitle: "Proposed finding",
    proposedBody: "A tentative interpretation.",
    rationale: "The full source is cited; interpretation is unverified.",
    citations: [citation],
    ...overrides,
  });
  const review = (
    submission: FoundationFindingProposalSubmission,
    decision: "approve" | "reject" = "approve",
  ) => ({
    projectId,
    proposalId: submission.proposalId,
    expectedVersion: 1 as const,
    expectedProposalDigest: submission.proposalDigest,
    expectedSourceDigest: submission.sourceDigest,
    expectedCitationsDigest: submission.citationsDigest,
    reason: "Owner selected the wording",
    ...(decision === "approve"
      ? {
          decision,
          selectedTitle: "Owner finding",
          selectedBody: "Owner-selected interpretation.\n",
        }
      : { decision }),
  });
  const counts = async () => {
    const tables = [
      "capture",
      "capture_triage_suggestion",
      "capture_triage_decision",
      "knowledge_item",
      "foundation_evidence",
      "foundation_memory",
      "foundation_finding_proposal",
      "foundation_finding_citation",
      "foundation_finding_filing",
      "foundation_idempotency",
    ];
    const values: Record<string, number> = {};
    for (const table of tables) {
      const result = await admin.pool.query(
        table === "capture_triage_suggestion" ||
          table === "capture_triage_decision"
          ? "SELECT count(*)::int AS n FROM public." +
              table +
              " WHERE capture_id IN (SELECT id FROM public.capture WHERE project_id=$1)"
          : "SELECT count(*)::int AS n FROM public." +
              table +
              " WHERE project_id=$1",
        [projectId],
      );
      values[table] = result.rows[0].n as number;
    }
    return values;
  };
  const badSql = async (
    action: (client: PoolClient) => Promise<void>,
    expectedConstraint?: string,
  ) => {
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN");
      await assert.rejects(
        async () => {
          await action(client);
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        },
        expectedConstraint ? sqlConstraint(expectedConstraint) : integrity,
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  };
  return {
    admin,
    runtime,
    peer,
    projectId,
    foreignProjectId,
    identity,
    issued,
    owner,
    service,
    peerService,
    machine,
    now,
    citation,
    input,
    review,
    counts,
    badSql,
    advance: (value: number) => {
      time += value;
    },
    close: async () => {
      await Promise.all([admin.close(), runtime.close(), peer.close()]);
    },
  };
}

test("finding canonical PostgreSQL persistence, provenance, authority and rollback", async (t) => {
  const migrationAdmin = createDatabase({
    connectionString: adminUrl!,
    max: 1,
  });
  try {
    for (let pass = 0; pass < 2; pass++) {
      const connection = await migrationAdmin.pool.connect();
      try {
        await connection.query("BEGIN");
        for (const statement of migration) await connection.query(statement);
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    }
  } finally {
    await migrationAdmin.close();
  }
  const f = await fixture();
  let historicalCitation: FoundationFindingCitation | undefined;
  try {
    await t.test(
      "numeric JSON markers 1.0 have canonical JS hashes and readable immutable rows",
      async () => {
        const seed = await f.service.submitFindingProposal(
          f.issued.token,
          "numeric-control-" + randomUUID(),
          f.input(),
        );
        const detail = await f.service.getFindingProposal(f.issued.token, {
          projectId: f.projectId,
          id: seed.record.proposalId,
        });
        const client = await f.runtime.pool.connect();
        let inserted: Awaited<ReturnType<typeof insertSqlProposal>>;
        try {
          await client.query("BEGIN");
          inserted = await insertSqlProposal(client, detail, true);
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
          await client.query("COMMIT");
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
        const read = await f.service.getFindingProposal(f.issued.token, {
          projectId: f.projectId,
          id: inserted.proposalId,
        });
        assert.equal(read.suggestion.proposal.binding.schemaVersion, 1);
        assert.equal(read.suggestion.proposal.binding.proposalVersion, 1);
        assert.equal(
          read.suggestion.proposal.contentDigest,
          foundationDigest(inserted.binding),
        );
        const actual = await f.admin.pool.query(
          "SELECT public.commandry_finding_digest(proposal->'binding') AS digest FROM public.capture_triage_suggestion WHERE id=$1",
          [inserted.proposalId],
        );
        assert.equal(actual.rows[0].digest, foundationDigest(inserted.binding));
      },
    );
    await t.test(
      "initial canonical source locks survive early constraints through first COMMIT",
      async () => {
        const captureId = randomUUID(),
          knowledgeId = randomUUID(),
          original = "Source admitted before concurrent ordinary edit",
          later = "Source after the first proposal committed";
        await f.admin.pool.query(
          "INSERT INTO public.capture(id,input_type,original_content,project_id,state,filed_record_kind,filed_record_id,filed_at) VALUES($1,'text','Concurrent canonical note',$2,'filed','note',$3,$4)",
          [captureId, f.projectId, knowledgeId, f.now()],
        );
        await f.admin.pool.query(
          "INSERT INTO public.knowledge_item(id,project_id,source_capture_id,title,content) VALUES($1,$2,$3,'Concurrent source',$4)",
          [knowledgeId, f.projectId, captureId, original],
        );
        const evidence = await f.machine.recordEvidence(
          f.issued.token,
          {
            projectId: f.projectId,
            sourceKind: "knowledge_revision",
            sourceId: knowledgeId,
            sourceVersion: "1",
            contentDigest: digest(original),
            locator: "commandry:knowledge:" + knowledgeId,
            observedAt: null,
            availability: "available",
          },
          "locking-source-" + randomUUID(),
        );
        const citation: FoundationFindingCitation = {
          evidenceId: evidence.record.id,
          sourceKind: "knowledge_revision",
          sourceId: knowledgeId,
          sourceVersion: "1",
          contentDigest: digest(original),
          selection: "whole_source",
        };
        const seed = await f.service.submitFindingProposal(
          f.issued.token,
          "locking-source-seed-" + randomUUID(),
          f.input({ citations: [citation] }),
        );
        const detail = await f.service.getFindingProposal(f.issued.token, {
          projectId: f.projectId,
          id: seed.record.proposalId,
        });
        const client = await f.runtime.pool.connect(),
          writer = await f.peer.pool.connect();
        let write: Promise<void> | undefined;
        let released = false;
        try {
          await client.query("BEGIN");
          const inserted = await insertSqlProposal(client, detail);
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
          const pid = (await writer.query("SELECT pg_backend_pid() AS pid"))
            .rows[0].pid as number;
          let finished = false;
          write = (async () => {
            await writer.query("BEGIN");
            try {
              await writer.query(
                "INSERT INTO public.knowledge_item_revision(id,knowledge_item_id,version,previous_title,previous_content,title,content,actor) VALUES($1,$2,2,'Concurrent source',$3,'Concurrent source',$4,'local-user:unattributed')",
                [randomUUID(), knowledgeId, original, later],
              );
              await writer.query(
                "UPDATE public.knowledge_item SET content=$2,version=2 WHERE id=$1",
                [knowledgeId, later],
              );
              await writer.query("COMMIT");
            } finally {
              await writer.query("ROLLBACK");
              finished = true;
            }
          })();
          let blocked = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const state = await f.admin.pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",
              [pid],
            );
            if (state.rowCount) {
              blocked = true;
              break;
            }
            if (finished) break;
            await delay(10);
          }
          assert.equal(
            blocked,
            true,
            "canonical writer must wait until the proposal first COMMIT",
          );
          assert.equal(finished, false);
          await client.query("COMMIT");
          await write;
          const fresh = await writer.query(
            "SELECT content,version FROM public.knowledge_item WHERE id=$1",
            [knowledgeId],
          );
          assert.equal(fresh.rows[0].content, later);
          assert.equal(fresh.rows[0].version, 2);
          client.release();
          released = true;
          const admitted = await f.service.getFindingProposalOwner(f.identity, {
            projectId: f.projectId,
            id: inserted.proposalId,
          });
          assert.equal(
            admitted.suggestion.proposal.binding.citations[0]!.contentDigest,
            digest(original),
          );
          const currentEvidence = await f.machine.recordEvidence(
            f.issued.token,
            {
              projectId: f.projectId,
              sourceKind: "knowledge_revision",
              sourceId: knowledgeId,
              sourceVersion: "2",
              contentDigest: digest(later),
              locator: "commandry:knowledge:" + knowledgeId + ":2",
              observedAt: null,
              availability: "available",
            },
            "current-after-wait-" + randomUUID(),
          );
          const currentCitation: FoundationFindingCitation = {
            ...citation,
            evidenceId: currentEvidence.record.id,
            sourceVersion: "2",
            contentDigest: digest(later),
          };
          const currentSeed = await f.service.submitFindingProposal(
            f.issued.token,
            "current-source-seed-" + randomUUID(),
            f.input({ citations: [currentCitation] }),
          );
          const currentDetail = await f.service.getFindingProposal(
            f.issued.token,
            { projectId: f.projectId, id: currentSeed.record.proposalId },
          );
          await f.badSql(async (own) => {
            await insertSqlProposal(own, currentDetail);
            await own.query("SET CONSTRAINTS ALL IMMEDIATE");
            await own.query(
              "UPDATE public.knowledge_item SET content='Changed inside admitting transaction' WHERE id=$1",
              [knowledgeId],
            );
          }, "foundation_finding_source_bytes");
          const historicalReader = await f.runtime.pool.connect();
          let historicalAttempt:
            Promise<{ value?: unknown; error?: unknown }> | undefined;
          try {
            await historicalReader.query("BEGIN");
            await insertSqlProposal(historicalReader, detail);
            await historicalReader.query("SET CONSTRAINTS ALL IMMEDIATE");
            const historyPid = (
              await writer.query("SELECT pg_backend_pid() AS pid")
            ).rows[0].pid as number;
            let historyFinished = false;
            historicalAttempt = writer
              .query(
                "SELECT previous_content FROM public.knowledge_item_revision WHERE knowledge_item_id=$1 AND version=2 FOR UPDATE",
                [knowledgeId],
              )
              .then(
                (value) => {
                  historyFinished = true;
                  return { value };
                },
                (error: unknown) => {
                  historyFinished = true;
                  return { error };
                },
              );
            let historicalBlocked = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              const state = await f.admin.pool.query(
                "SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",
                [historyPid],
              );
              if (state.rowCount) {
                historicalBlocked = true;
                break;
              }
              if (historyFinished) break;
              await delay(10);
            }
            assert.equal(
              historicalBlocked,
              true,
              "historical source revision row must remain locked through proposal COMMIT",
            );
            await historicalReader.query("COMMIT");
            const attempt = await historicalAttempt;
            assert.equal(attempt.error, undefined);
            const freshHistory = await writer.query(
              "SELECT previous_content FROM public.knowledge_item_revision WHERE knowledge_item_id=$1 AND version=2",
              [knowledgeId],
            );
            assert.equal(freshHistory.rows[0].previous_content, original);
          } finally {
            await historicalReader.query("ROLLBACK");
            if (historicalAttempt) await historicalAttempt;
            historicalReader.release();
          }
        } finally {
          if (!released) await client.query("ROLLBACK");
          if (write) await write;
          if (!released) client.release();
          writer.release();
        }
      },
    );
    await t.test(
      "exact originals, ordered citations, immutable submission and initial owner filing receipt",
      async () => {
        const input = f.input();
        const key = "exact-" + randomUUID();
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          key,
          input,
        );
        const detail = await f.service.getFindingProposal(f.issued.token, {
          projectId: f.projectId,
          id: submission.record.proposalId,
        });
        assert.equal(detail.capture.originalContent, input.originalContent);
        assert.equal(detail.capture.state, "unfiled");
        assert.deepEqual(
          detail.suggestion.proposal.binding.citations,
          input.citations,
        );
        assert.equal(
          detail.suggestion.proposal.binding.sourceDigest,
          digest(input.originalContent),
        );
        assert.equal(
          detail.suggestion.proposal.contentDigest,
          foundationDigest(detail.suggestion.proposal.binding),
        );
        assert.deepEqual(
          await f.service.getFindingProposalByCaptureOwner(f.identity, {
            projectId: f.projectId,
            captureId: detail.capture.id,
          }),
          detail,
        );
        const selected = f.review(submission.record);
        const receipt = await f.service.reviewFindingProposal(
          f.identity,
          "approve-" + randomUUID(),
          selected,
        );
        assert.equal(
          receipt.record.knowledge?.content,
          selected.decision === "approve" ? selected.selectedBody : undefined,
        );
        assert.equal(receipt.record.memory?.lifecycle, "proposed");
        assert.equal(receipt.record.memory?.verification, "unverified");
        assert.deepEqual(receipt.record.memory?.content.evidenceIds.slice(1), [
          f.citation.evidenceId,
        ]);
        assert.equal(receipt.record.memory?.recordedBy, f.identity.principalId);
        const anchorId = receipt.record.memory!.content.evidenceIds[0]!;
        const anchor = await f.admin.pool.query(
          "SELECT * FROM public.foundation_evidence WHERE id=$1",
          [anchorId],
        );
        assert.equal(anchor.rows[0].source_id, receipt.record.knowledge!.id);
        assert.equal(anchor.rows[0].source_version, "1");
        assert.equal(
          anchor.rows[0].content_digest,
          digest(receipt.record.knowledge!.content),
        );
        assert.equal(anchor.rows[0].verification, "unverified");
        const replay = await f.service.submitFindingProposal(
          f.issued.token,
          key,
          input,
        );
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.record, submission.record);
        assert.equal(replay.correlationId, submission.correlationId);
        const terminal = await f.service.getFindingProposalOwner(f.identity, {
          projectId: f.projectId,
          id: submission.record.proposalId,
        });
        assert.equal(terminal.decision?.decision, "approve");
        assert.equal(terminal.capture.originalContent, input.originalContent);
        await assert.rejects(
          f.service.reviewFindingProposal(
            f.identity,
            "again-" + randomUUID(),
            selected,
          ),
          denied("VERSION_CONFLICT"),
        );
      },
    );
    await t.test(
      "separate canonical memory review and verification and Knowledge edits preserve original receipts",
      async () => {
        const key = "history-" + randomUUID();
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          key,
          f.input(),
        );
        const reviewKey = "history-review-" + randomUUID();
        const selected = f.review(submission.record);
        const receipt = await f.service.reviewFindingProposal(
          f.identity,
          reviewKey,
          selected,
        );
        const memory = receipt.record.memory!;
        await f.owner.reviewMemory(
          {
            projectId: f.projectId,
            memoryId: memory.id,
            expectedVersion: 1,
            decision: "accepted",
            reason: "Separate owner review",
          },
          "memory-review-" + randomUUID(),
        );
        await f.owner.verifyMemory(
          {
            projectId: f.projectId,
            memoryId: memory.id,
            expectedVersion: 1,
            verification: "source_matched",
            evidenceIds: memory.content.evidenceIds,
            reason: "Separate source check",
          },
          "memory-verify-" + randomUUID(),
        );
        const knowledge = receipt.record.knowledge!;
        await f.admin.pool.query(
          "INSERT INTO public.knowledge_item_revision(id,knowledge_item_id,version,previous_title,previous_content,title,content,actor,created_at) VALUES($1,$2,2,$3,$4,'Later title','Later content',$5,$6)",
          [
            randomUUID(),
            knowledge.id,
            knowledge.title,
            knowledge.content,
            "local-user:unattributed",
            f.now(),
          ],
        );
        await f.admin.pool.query(
          "UPDATE public.knowledge_item SET title='Later title',content='Later content',version=2 WHERE id=$1",
          [knowledge.id],
        );
        const replay = await f.service.reviewFindingProposal(
          f.identity,
          reviewKey,
          selected,
        );
        assert.equal(replay.replayed, true);
        assert.deepEqual(replay.record, receipt.record);
        assert.equal(replay.correlationId, receipt.correlationId);
        const current = await f.admin.pool.query(
          "SELECT lifecycle,verification FROM public.foundation_memory WHERE id=$1",
          [memory.id],
        );
        assert.equal(current.rows[0].lifecycle, "accepted");
        assert.equal(current.rows[0].verification, "source_matched");
      },
    );
    await t.test(
      "source unavailable blocks approval but permits rejection without canonical effects",
      async () => {
        const captureId = randomUUID(),
          knowledgeId = randomUUID();
        await f.admin.pool.query(
          "INSERT INTO public.capture(id,input_type,original_content,project_id,state,filed_record_kind,filed_record_id,filed_at) VALUES($1,'text','Source note',$2,'filed','note',$3,$4)",
          [captureId, f.projectId, knowledgeId, f.now()],
        );
        await f.admin.pool.query(
          "INSERT INTO public.knowledge_item(id,project_id,source_capture_id,title,content) VALUES($1,$2,$3,'Source note','Initial exact source')",
          [knowledgeId, f.projectId, captureId],
        );
        const evidence = await f.machine.recordEvidence(
          f.issued.token,
          {
            projectId: f.projectId,
            sourceKind: "knowledge_revision",
            sourceId: knowledgeId,
            sourceVersion: "1",
            contentDigest: digest("Initial exact source"),
            locator: "commandry:knowledge:" + knowledgeId,
            observedAt: null,
            availability: "available",
          },
          "source-note-" + randomUUID(),
        );
        const citation: FoundationFindingCitation = {
          evidenceId: evidence.record.id,
          sourceKind: "knowledge_revision",
          sourceId: knowledgeId,
          sourceVersion: "1",
          contentDigest: digest("Initial exact source"),
          selection: "whole_source",
        };
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "unavailable-" + randomUUID(),
          f.input({ citations: [citation] }),
        );
        // Simulate an outside canonical source losing its exact bytes, without
        // rewriting the immutable evidence snapshot or the proposal bindings.
        await f.admin.pool.query(
          "UPDATE public.knowledge_item SET content='Source bytes no longer available' WHERE id=$1",
          [knowledgeId],
        );
        const before = await f.counts();
        await assert.rejects(
          f.service.reviewFindingProposal(
            f.identity,
            "unavailable-approve-" + randomUUID(),
            f.review(submission.record),
          ),
          denied("INVALID_REFERENCE"),
        );
        assert.deepEqual(await f.counts(), before);
        const rejected = await f.service.reviewFindingProposal(
          f.identity,
          "unavailable-reject-" + randomUUID(),
          f.review(submission.record, "reject"),
        );
        assert.equal(rejected.record.knowledge, null);
        assert.equal(rejected.record.memory, null);
        const after = await f.counts();
        assert.equal(after.knowledge_item, before.knowledge_item);
        assert.equal(after.foundation_memory, before.foundation_memory);
        assert.equal(after.foundation_evidence, before.foundation_evidence);
        assert.equal(
          after.foundation_finding_filing,
          before.foundation_finding_filing,
        );
      },
    );
    await t.test(
      "parallel same-key submission has one effect; different input conflicts; approve/reject has one terminal winner",
      async () => {
        const key = "parallel-" + randomUUID();
        const before = await f.counts();
        const both = await Promise.all([
          f.service.submitFindingProposal(f.issued.token, key, f.input()),
          f.peerService.submitFindingProposal(f.issued.token, key, f.input()),
        ]);
        assert.deepEqual(both[0]!.record, both[1]!.record);
        assert.equal(both.filter((value) => value.replayed).length, 1);
        assert.equal((await f.counts()).capture, before.capture! + 1);
        await assert.rejects(
          f.service.submitFindingProposal(
            f.issued.token,
            key,
            f.input({ proposedBody: "Different words" }),
          ),
          denied("IDEMPOTENCY_CONFLICT"),
        );
        const winners = await Promise.allSettled([
          f.service.reviewFindingProposal(
            f.identity,
            "race-approve-" + randomUUID(),
            f.review(both[0]!.record),
          ),
          f.peerService.reviewFindingProposal(
            f.identity,
            "race-reject-" + randomUUID(),
            f.review(both[0]!.record, "reject"),
          ),
        ]);
        assert.equal(
          winners.filter((value) => value.status === "fulfilled").length,
          1,
        );
        const rejected = winners.find((value) => value.status === "rejected");
        assert.equal(rejected?.status, "rejected");
        if (rejected?.status === "rejected")
          assert.ok(denied("VERSION_CONFLICT")(rejected.reason));
      },
    );
    await t.test(
      "cross-project, environment, old grants, owner forgery and revoked/expired sessions are denied",
      async () => {
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "scope-" + randomUUID(),
          f.input(),
        );
        await assert.rejects(
          f.service.getFindingProposal(f.issued.token, {
            projectId: f.foreignProjectId,
            id: submission.record.proposalId,
          }),
          denied("FORBIDDEN"),
        );
        const otherEnvironment = createFoundationFindingProposalService(
          createFoundationFindingProposalAccessRepository(f.runtime.db, {
            now: f.now,
          }),
          { environment: "production", now: f.now },
        );
        await assert.rejects(
          otherEnvironment.getFindingProposal(f.issued.token, {
            projectId: f.projectId,
            id: submission.record.proposalId,
          }),
          denied("FORBIDDEN"),
        );
        const old = await f.owner.createClient(
          {
            name: "Old work client",
            projectId: f.projectId,
            environment: "test",
            operations: ["work.read", "work.propose"],
            ttlSeconds: 60,
          },
          "old-client-" + randomUUID(),
        );
        await assert.rejects(
          f.service.submitFindingProposal(
            old.token,
            "old-grant-" + randomUUID(),
            f.input(),
          ),
          denied("FORBIDDEN"),
        );
        const localCapture = randomUUID();
        const taskSuggestion = randomUUID();
        await f.admin.pool.query(
          "INSERT INTO public.capture(id,input_type,original_content,project_id) VALUES($1,'text','Local legacy task',$2)",
          [localCapture, f.projectId],
        );
        await f.admin.pool.query(
          "INSERT INTO public.capture_triage_suggestion(id,capture_id,kind,proposed_project_id,title,confidence,rationale,rule_version,source_label) VALUES($1,$2,'task',$3,'Local task',90,'Local rule','capture-triage/v1','Local deterministic rule')",
          [taskSuggestion, localCapture, f.projectId],
        );
        await assert.rejects(
          f.service.getFindingProposal(f.issued.token, {
            projectId: f.projectId,
            id: taskSuggestion,
          }),
          denied("NOT_FOUND"),
        );
        await assert.rejects(
          f.service.getFindingProposalByCaptureOwner(f.identity, {
            projectId: f.projectId,
            captureId: localCapture,
          }),
          denied("NOT_FOUND"),
        );
        await assert.rejects(
          f.service.reviewFindingProposal(
            {
              principalId: f.identity.principalId,
              expiresAt: f.identity.expiresAt,
            },
            "forged-owner-" + randomUUID(),
            f.review(submission.record),
          ),
          denied("FORBIDDEN"),
        );
        await assert.rejects(
          f.service.reviewFindingProposal(
            { ...f.identity, sessionId: randomUUID() },
            "missing-session-" + randomUUID(),
            f.review(submission.record),
          ),
          denied("FORBIDDEN"),
        );
        await assert.rejects(
          f.service.reviewFindingProposal(
            {
              ...f.identity,
              expiresAt: new Date(f.now().getTime() - 1).toISOString(),
            },
            "expired-session-" + randomUUID(),
            f.review(submission.record),
          ),
          denied("FORBIDDEN"),
        );
        await f.owner.revokeClient({ clientId: old.client.id });
        await assert.rejects(
          f.service.getFindingProposal(old.token, {
            projectId: f.projectId,
            id: submission.record.proposalId,
          }),
          denied("REVOKED"),
        );
      },
    );
    await t.test(
      "canonical source mismatch and foreign citations leave no phantom effects",
      async () => {
        const before = await f.counts();
        for (const citations of [
          [{ ...f.citation, contentDigest: "a".repeat(64) }],
          [
            {
              ...f.citation,
              sourceKind: "knowledge_revision" as const,
              sourceVersion: "1",
            },
          ],
          [{ ...f.citation, sourceId: randomUUID() }],
        ]) {
          await assert.rejects(
            f.service.submitFindingProposal(
              f.issued.token,
              "invalid-citation-" + randomUUID(),
              f.input({ citations }),
            ),
            denied("INVALID_REFERENCE"),
          );
        }
        assert.deepEqual(await f.counts(), before);
      },
    );
    await t.test(
      "direct SQL cannot omit citations, forge source versions/digests, file without a decision, or mutate provenance",
      async () => {
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "sql-source-" + randomUUID(),
          f.input(),
        );
        const detail = await f.service.getFindingProposal(f.issued.token, {
          projectId: f.projectId,
          id: submission.record.proposalId,
        });
        for (const statement of [
          "UPDATE public.foundation_finding_proposal SET environment='production' WHERE proposal_id=$1",
          "DELETE FROM public.foundation_finding_proposal WHERE proposal_id=$1",
          "UPDATE public.foundation_finding_citation SET ordinal=5 WHERE proposal_id=$1",
          "DELETE FROM public.foundation_finding_citation WHERE proposal_id=$1",
        ])
          await f.badSql(async (client) => {
            await client.query(statement, [submission.record.proposalId]);
          });
        await f.badSql(async (client) => {
          await client.query(
            "INSERT INTO public.foundation_finding_citation(proposal_id,project_id,evidence_id,ordinal) VALUES($1,$2,$3,1)",
            [submission.record.proposalId, f.projectId, randomUUID()],
          );
        });
        await f.badSql(async (client) => {
          await client.query(
            "UPDATE public.capture SET state='filed',filed_record_kind='note',filed_record_id=$2,filed_at=$3 WHERE id=$1",
            [submission.record.captureId, randomUUID(), f.now()],
          );
        });
        const unlisted = await f.machine.recordEvidence(
          f.issued.token,
          {
            projectId: f.projectId,
            sourceKind: "capture",
            sourceId: f.citation.sourceId,
            sourceVersion: null,
            contentDigest: f.citation.contentDigest,
            locator: "commandry:unlisted:" + randomUUID(),
            observedAt: null,
            availability: "available",
          },
          "unlisted-citation-" + randomUUID(),
        );
        const rawInsert = async (options: {
          omit?: boolean;
          fakeDigest?: boolean;
          fakeVersion?: boolean;
          extra?: boolean;
          foreign?: boolean;
          forgedTx?: boolean;
        }) =>
          f.badSql(
            async (client) => {
              const proposalId = randomUUID(),
                captureId = randomUUID();
              const binding = {
                ...detail.suggestion.proposal.binding,
                proposalId,
                captureId,
                citations: options.fakeDigest
                  ? [{ ...f.citation, contentDigest: "f".repeat(64) }]
                  : options.fakeVersion
                    ? [{ ...f.citation, sourceVersion: "9" }]
                    : [f.citation],
              };
              binding.citationsDigest = foundationDigest(binding.citations);
              await client.query(
                "INSERT INTO public.capture(id,input_type,original_content,source,author,project_id,created_at) VALUES($1,'text',$2,'foundation-client',$3,$4,$5)",
                [
                  captureId,
                  detail.capture.originalContent,
                  detail.capture.author,
                  f.projectId,
                  binding.submittedAt,
                ],
              );
              await client.query(
                "INSERT INTO public.capture_triage_suggestion(id,capture_id,kind,proposed_project_id,title,body,confidence,proposal,rationale,rule_version,source_label,created_at) VALUES($1,$2,'note',$3,$4,$5,NULL,$6,$7,'agent-finding-proposal/v1','Agent finding proposal',$8)",
                [
                  proposalId,
                  captureId,
                  f.projectId,
                  binding.proposedTitle,
                  binding.proposedBody,
                  { binding, contentDigest: foundationDigest(binding) },
                  binding.rationale,
                  binding.submittedAt,
                ],
              );
              await client.query(
                "INSERT INTO public.foundation_finding_proposal(proposal_id,capture_id,project_id,environment,creation_transaction) VALUES($1,$2,$3,'test',$4)",
                [
                  proposalId,
                  captureId,
                  f.projectId,
                  options.forgedTx ? "forged" : "also-overwritten",
                ],
              );
              if (!options.omit)
                await client.query(
                  "INSERT INTO public.foundation_finding_citation(proposal_id,project_id,evidence_id,ordinal) VALUES($1,$2,$3,0)",
                  [
                    proposalId,
                    options.foreign ? f.foreignProjectId : f.projectId,
                    f.citation.evidenceId,
                  ],
                );
              if (options.extra)
                await client.query(
                  "INSERT INTO public.foundation_finding_citation(proposal_id,project_id,evidence_id,ordinal) VALUES($1,$2,$3,1)",
                  [proposalId, f.projectId, unlisted.record.id],
                );
              if (options.forgedTx) {
                const row = await client.query(
                  "SELECT creation_transaction=pg_current_xact_id()::text AS actual FROM public.foundation_finding_proposal WHERE proposal_id=$1",
                  [proposalId],
                );
                assert.equal(row.rows[0].actual, true);
                await client.query(
                  "DELETE FROM public.foundation_finding_citation WHERE proposal_id=$1",
                  [proposalId],
                );
              }
            },
            options.extra ? "foundation_finding_citations" : undefined,
          );
        const before = await f.counts();
        for (const options of [
          { omit: true },
          { fakeDigest: true },
          { fakeVersion: true },
          { extra: true },
          { foreign: true },
          { forgedTx: true },
        ])
          await rawInsert(options);
        assert.deepEqual(await f.counts(), before);
      },
    );
    await t.test(
      "allowed audit failure rolls back whole submission and owner filing",
      async () => {
        const name = "finding_audit_fail_" + randomUUID().replaceAll("-", "");
        await f.admin.pool.query(
          "CREATE FUNCTION public." +
            name +
            "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id='" +
            f.projectId +
            "'::uuid AND NEW.operation IN ('finding.propose','finding.review') AND NEW.decision='allowed' THEN RAISE EXCEPTION 'injected finding allowed audit failure'; END IF; RETURN NEW; END $$",
        );
        await f.admin.pool.query(
          "CREATE TRIGGER " +
            name +
            " BEFORE INSERT ON public.foundation_audit FOR EACH ROW EXECUTE FUNCTION public." +
            name +
            "()",
        );
        try {
          const before = await f.counts();
          await assert.rejects(
            f.service.submitFindingProposal(
              f.issued.token,
              "audit-submit-" + randomUUID(),
              f.input(),
            ),
          );
          assert.deepEqual(await f.counts(), before);
        } finally {
          await f.admin.pool.query(
            "DROP TRIGGER " + name + " ON public.foundation_audit",
          );
          await f.admin.pool.query("DROP FUNCTION public." + name + "()");
        }
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "audit-review-source-" + randomUUID(),
          f.input(),
        );
        await f.admin.pool.query(
          "CREATE FUNCTION public." +
            name +
            "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id='" +
            f.projectId +
            "'::uuid AND NEW.operation='finding.review' AND NEW.decision='allowed' THEN RAISE EXCEPTION 'injected finding allowed audit failure'; END IF; RETURN NEW; END $$",
        );
        await f.admin.pool.query(
          "CREATE TRIGGER " +
            name +
            " BEFORE INSERT ON public.foundation_audit FOR EACH ROW EXECUTE FUNCTION public." +
            name +
            "()",
        );
        try {
          const before = await f.counts();
          await assert.rejects(
            f.service.reviewFindingProposal(
              f.identity,
              "audit-review-" + randomUUID(),
              f.review(submission.record),
            ),
          );
          assert.deepEqual(await f.counts(), before);
          const detail = await f.service.getFindingProposal(f.issued.token, {
            projectId: f.projectId,
            id: submission.record.proposalId,
          });
          assert.equal(detail.capture.state, "unfiled");
          assert.equal(detail.decision, null);
        } finally {
          await f.admin.pool.query(
            "DROP TRIGGER " + name + " ON public.foundation_audit",
          );
          await f.admin.pool.query("DROP FUNCTION public." + name + "()");
        }
      },
    );
    await t.test(
      "actual Capture lock expiry aborts the guarded owner transaction",
      async () => {
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "lock-source-" + randomUUID(),
          f.input(),
        );
        const lock = await f.admin.pool.connect();
        try {
          await lock.query("BEGIN");
          await lock.query(
            "SELECT id FROM public.capture WHERE id=$1 FOR UPDATE",
            [submission.record.captureId],
          );
          const before = await f.counts();
          const pending = f.service.reviewFindingProposal(
            f.identity,
            "expire-at-lock-" + randomUUID(),
            f.review(submission.record),
          );
          const observed = pending.then(
            () => null,
            (error: unknown) => error,
          );
          let waiting = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const state = await f.admin.pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE usename='commandry_app_integration' AND wait_event_type='Lock' AND query LIKE '%capture%' LIMIT 1",
            );
            if (state.rowCount) {
              waiting = true;
              break;
            }
            await delay(10);
          }
          assert.equal(waiting, true);
          f.advance(3_600_001);
          await lock.query("COMMIT");
          const error = await observed;
          assert.ok(denied("FORBIDDEN")(error), String(error));
          assert.deepEqual(await f.counts(), before);
          f.advance(-3_600_001);
        } finally {
          await lock.query("ROLLBACK");
          lock.release();
        }
      },
    );
    await t.test(
      "ordered Capture and historical Knowledge citations retain exact source versions",
      async () => {
        const captureId = randomUUID(),
          knowledgeId = randomUUID();
        const v1 = "Original historical bytes\n",
          v2 = "Second historical bytes";
        await f.admin.pool.query(
          "INSERT INTO public.capture(id,input_type,original_content,project_id,state,filed_record_kind,filed_record_id,filed_at) VALUES($1,'text','Historical note',$2,'filed','note',$3,$4)",
          [captureId, f.projectId, knowledgeId, f.now()],
        );
        await f.admin.pool.query(
          "INSERT INTO public.knowledge_item(id,project_id,source_capture_id,title,content) VALUES($1,$2,$3,'Historical note',$4)",
          [knowledgeId, f.projectId, captureId, v1],
        );
        const source = await f.machine.recordEvidence(
          f.issued.token,
          {
            projectId: f.projectId,
            sourceKind: "knowledge_revision",
            sourceId: knowledgeId,
            sourceVersion: "1",
            contentDigest: digest(v1),
            locator: "commandry:knowledge:" + knowledgeId + ":revision:1",
            observedAt: null,
            availability: "available",
          },
          "historical-evidence-" + randomUUID(),
        );
        await f.admin.pool.query(
          "INSERT INTO public.knowledge_item_revision(id,knowledge_item_id,version,previous_title,previous_content,title,content,actor) VALUES($1,$2,2,'Historical note',$3,'Historical note',$4,'local-user:unattributed')",
          [randomUUID(), knowledgeId, v1, v2],
        );
        await f.admin.pool.query(
          "UPDATE public.knowledge_item SET version=2,content=$2 WHERE id=$1",
          [knowledgeId, v2],
        );
        const historical: FoundationFindingCitation = {
          evidenceId: source.record.id,
          sourceKind: "knowledge_revision",
          sourceId: knowledgeId,
          sourceVersion: "1",
          contentDigest: digest(v1),
          selection: "whole_source",
        };
        historicalCitation = historical;
        const citations = [historical, f.citation];
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "historical-submission-" + randomUUID(),
          f.input({ citations }),
        );
        const receipt = await f.service.reviewFindingProposal(
          f.identity,
          "historical-filing-" + randomUUID(),
          f.review(submission.record),
        );
        assert.deepEqual(
          receipt.record.memory!.content.evidenceIds.slice(1),
          citations.map((value) => value.evidenceId),
        );
        const actual = await f.admin.pool.query(
          "SELECT evidence_id::text,ordinal FROM public.foundation_finding_citation WHERE proposal_id=$1 ORDER BY ordinal",
          [submission.record.proposalId],
        );
        assert.deepEqual(
          actual.rows,
          citations.map((value, ordinal) => ({
            evidence_id: value.evidenceId,
            ordinal,
          })),
        );
      },
    );
    await t.test(
      "initial selected Knowledge, memory authority, anchors and filing provenance resist direct SQL",
      async () => {
        const submitted = await f.service.submitFindingProposal(
          f.issued.token,
          "clone-template-" + randomUUID(),
          f.input({ citations: [f.citation, historicalCitation!] }),
        );
        const receipt = await f.service.reviewFindingProposal(
          f.identity,
          "clone-template-review-" + randomUUID(),
          f.review(submitted.record),
        );
        const detail = await f.service.getFindingProposal(f.issued.token, {
          projectId: f.projectId,
          id: submitted.record.proposalId,
        });
        const clone = async (client: PoolClient, attack: string) => {
          const proposalId = randomUUID(),
            captureId = randomUUID(),
            knowledgeId = randomUUID(),
            memoryId = randomUUID(),
            anchorId = randomUUID(),
            decisionId = randomUUID();
          const binding = {
            ...detail.suggestion.proposal.binding,
            proposalId,
            captureId,
          };
          const provenance = {
            ...receipt.record.decision.provenance,
            proposalDigest: foundationDigest(binding),
          };
          const content = {
            ...receipt.record.memory!.content,
            evidenceIds: [
              anchorId,
              ...binding.citations.map((value) => value.evidenceId),
            ],
          };
          const copy = async (
            table: string,
            where: string,
            selector: unknown,
            overrides: unknown,
          ) =>
            client.query(
              "INSERT INTO public." +
                table +
                " SELECT (jsonb_populate_record(NULL::public." +
                table +
                ",to_jsonb(src)||$2::jsonb)).* FROM public." +
                table +
                " src WHERE " +
                where,
              [selector, overrides],
            );
          await copy("capture", "id=$1", detail.capture.id, {
            id: captureId,
            filed_record_id: knowledgeId,
          });
          await copy(
            "capture_triage_suggestion",
            "id=$1",
            submitted.record.proposalId,
            {
              id: proposalId,
              capture_id: captureId,
              proposal: { binding, contentDigest: foundationDigest(binding) },
            },
          );
          await copy(
            "foundation_finding_proposal",
            "proposal_id=$1",
            submitted.record.proposalId,
            {
              proposal_id: proposalId,
              capture_id: captureId,
              creation_transaction: "forged-proposal-transaction",
            },
          );
          await client.query(
            "INSERT INTO public.foundation_finding_citation(proposal_id,project_id,evidence_id,ordinal) SELECT $2,project_id,evidence_id,CASE WHEN $3 THEN 1-ordinal ELSE ordinal END FROM public.foundation_finding_citation WHERE proposal_id=$1",
            [submitted.record.proposalId, proposalId, attack === "reordered"],
          );
          await copy("knowledge_item", "id=$1", receipt.record.knowledge!.id, {
            id: knowledgeId,
            source_capture_id: captureId,
            ...(attack === "selected" ? { title: "Unselected title" } : {}),
          });
          await copy(
            "foundation_evidence",
            "id=$1",
            receipt.record.memory!.content.evidenceIds[0],
            {
              id: anchorId,
              source_id: knowledgeId,
              knowledge_item_id: knowledgeId,
              ...(attack === "anchor"
                ? { content_digest: "a".repeat(64) }
                : {}),
            },
          );
          await copy("foundation_memory", "id=$1", receipt.record.memory!.id, {
            id: memoryId,
            knowledge_item_id: knowledgeId,
            ...(attack === "verified"
              ? { verification: "source_matched" }
              : {}),
          });
          await copy(
            "foundation_memory_revision",
            "memory_id=$1 AND version=1",
            receipt.record.memory!.id,
            {
              memory_id: memoryId,
              anchor_evidence_id: anchorId,
              content_digest: foundationDigest(content),
              creation_transaction: "forged-memory-transaction",
            },
          );
          await client.query(
            "INSERT INTO public.foundation_memory_evidence(memory_id,version,project_id,evidence_id,ordinal) SELECT $2,version,project_id,CASE WHEN ordinal=0 THEN $3::uuid ELSE evidence_id END,ordinal FROM public.foundation_memory_evidence WHERE memory_id=$1 AND version=1",
            [receipt.record.memory!.id, memoryId, anchorId],
          );
          await copy(
            "capture_triage_decision",
            "id=$1",
            receipt.record.decision.id,
            {
              id: decisionId,
              capture_id: captureId,
              suggestion_id: proposalId,
              filed_record_id: knowledgeId,
              provenance,
              creation_transaction: "forged-decision-transaction",
            },
          );
          await copy(
            "foundation_finding_filing",
            "proposal_id=$1",
            submitted.record.proposalId,
            {
              proposal_id: proposalId,
              capture_id: captureId,
              decision_id: decisionId,
              knowledge_id: knowledgeId,
              memory_id: memoryId,
              anchor_evidence_id: anchorId,
              creation_transaction: "forged-filing-transaction",
            },
          );
          if (attack === "alias")
            await client.query(
              "INSERT INTO public.foundation_memory_alias(project_id,namespace,external_id,memory_id) VALUES($1,'adversarial',$2,$3)",
              [f.projectId, randomUUID(), memoryId],
            );
          if (attack === "relation")
            await client.query(
              "INSERT INTO public.foundation_memory_relation(memory_id,version,project_id,related_memory_id,ordinal) VALUES($1,1,$2,$3,0)",
              [memoryId, f.projectId, receipt.record.memory!.id],
            );
          if (attack === "approval")
            await client.query(
              "INSERT INTO public.foundation_instruction_approval(id,project_id,memory_id,version,content_digest,disclosure_project_id,approved_at,expires_at,approved_by) VALUES($1,$2,$3,1,$4,$2,$5,$6,$7)",
              [
                randomUUID(),
                f.projectId,
                memoryId,
                foundationDigest(content),
                f.now(),
                new Date(f.now().getTime() + 60_000),
                f.identity.principalId,
              ],
            );
        };
        const client = await f.runtime.pool.connect();
        try {
          await client.query("BEGIN");
          await clone(client, "valid");
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
          await client.query("COMMIT");
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
        const before = await f.counts();
        for (const attack of [
          "selected",
          "verified",
          "anchor",
          "alias",
          "relation",
          "approval",
          "reordered",
        ])
          await f.badSql((client) => clone(client, attack));
        assert.deepEqual(await f.counts(), before);
        for (const statement of [
          "UPDATE public.foundation_finding_filing SET memory_version=2 WHERE proposal_id=$1",
          "DELETE FROM public.foundation_finding_filing WHERE proposal_id=$1",
        ])
          await f.badSql(async (client) => {
            await client.query(statement, [submitted.record.proposalId]);
          });
        await f.badSql(async (client) => {
          await client.query(
            "CREATE TEMP TABLE capture AS SELECT * FROM public.capture WITH NO DATA",
          );
          await client.query(
            "CREATE TEMP TABLE foundation_finding_filing AS SELECT * FROM public.foundation_finding_filing WITH NO DATA",
          );
          await client.query("SET LOCAL search_path=pg_temp,public");
          await client.query(
            "UPDATE public.capture SET state='filed',filed_record_kind='note',filed_record_id=$2,filed_at=$3 WHERE id=$1",
            [submitted.record.captureId, randomUUID(), f.now()],
          );
        });
      },
    );
    await t.test(
      "feature lock rechecks machine expiry and serializes actual normal client revocation",
      async () => {
        const short = await f.owner.createClient(
          {
            name: "Short finding",
            projectId: f.projectId,
            environment: "test",
            operations: ["finding.read", "finding.propose"],
            ttlSeconds: 60,
          },
          "short-finding-" + randomUUID(),
        );
        const lock = await f.admin.pool.connect();
        const waitFor = async (fragment: string) => {
          for (let attempt = 0; attempt < 100; attempt++) {
            const state = await f.admin.pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE usename='commandry_app_integration' AND wait_event_type='Lock' AND query LIKE $1 LIMIT 1",
              ["%" + fragment + "%"],
            );
            if (state.rowCount) return;
            await delay(10);
          }
          throw new Error("Expected actual lock wait: " + fragment);
        };
        try {
          await lock.query("BEGIN");
          await lock.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["foundation-memory:" + f.projectId],
          );
          const before = await f.counts();
          const pending = f.service
            .submitFindingProposal(
              short.token,
              "feature-expire-" + randomUUID(),
              f.input(),
            )
            .then(
              () => null,
              (error: unknown) => error,
            );
          await waitFor("pg_advisory_xact_lock");
          f.advance(60_001);
          await lock.query("COMMIT");
          const error = await pending;
          assert.ok(
            error instanceof FoundationError &&
              ["EXPIRED", "FORBIDDEN"].includes(error.code),
            String(error),
          );
          assert.deepEqual(await f.counts(), before);
          f.advance(-60_001);
          await lock.query("BEGIN");
          await lock.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["foundation-memory:" + f.projectId],
          );
          const pendingSubmit = f.service.submitFindingProposal(
            short.token,
            "feature-revoke-" + randomUUID(),
            f.input(),
          );
          const submitResult = pendingSubmit.then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
          await waitFor("pg_advisory_xact_lock");
          const peerOwner = createFoundationOwnerService(
            createFoundationAccessRepository(f.peer.db, { now: f.now }),
            f.identity,
            { environment: "test", now: f.now },
          );
          const revocation = peerOwner.revokeClient({
            clientId: short.client.id,
          });
          await waitFor("foundation_client");
          await lock.query("COMMIT");
          await submitResult;
          await revocation;
          await assert.rejects(
            f.service.submitFindingProposal(
              short.token,
              "revoked-replay-" + randomUUID(),
              f.input(),
            ),
            denied("REVOKED"),
          );
        } finally {
          await lock.query("ROLLBACK");
          lock.release();
        }
      },
    );
    await t.test(
      "actual owner session revocation is serialized through the allowed audit lock",
      async () => {
        const submission = await f.service.submitFindingProposal(
          f.issued.token,
          "session-audit-source-" + randomUUID(),
          f.input(),
        );
        const name =
          "finding_session_audit_" + randomUUID().replaceAll("-", "");
        const auditKey = "finding-audit:" + randomUUID();
        const lock = await f.admin.pool.connect();
        await f.admin.pool.query(
          "CREATE FUNCTION public." +
            name +
            "() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.project_id='" +
            f.projectId +
            "'::uuid AND NEW.operation='finding.review' AND NEW.decision='allowed' THEN PERFORM pg_advisory_xact_lock(hashtextextended('" +
            auditKey +
            "',0)); END IF; RETURN NEW; END $$",
        );
        await f.admin.pool.query(
          "CREATE TRIGGER " +
            name +
            " BEFORE INSERT ON public.foundation_audit FOR EACH ROW EXECUTE FUNCTION public." +
            name +
            "()",
        );
        try {
          await lock.query("BEGIN");
          await lock.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [auditKey],
          );
          const key = "session-audit-review-" + randomUUID();
          const pending = f.service
            .reviewFindingProposal(f.identity, key, f.review(submission.record))
            .then(
              (value) => ({ value }),
              (error) => ({ error }),
            );
          let waited = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const state = await f.admin.pool.query(
              "SELECT 1 FROM pg_stat_activity WHERE usename='commandry_app_integration' AND wait_event_type='Lock' AND query LIKE '%foundation_audit%' LIMIT 1",
            );
            if (state.rowCount) {
              waited = true;
              break;
            }
            await delay(10);
          }
          assert.equal(waited, true);
          const revoker = await f.admin.pool.connect();
          let deleted = false;
          const revoke = revoker
            .query("DELETE FROM public.session WHERE id=$1", [
              f.identity.sessionId,
            ])
            .then(() => {
              deleted = true;
            });
          try {
            let blocked = false;
            for (let attempt = 0; attempt < 100; attempt++) {
              const state = await f.admin.pool.query(
                "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'DELETE FROM public.session%' LIMIT 1",
              );
              if (state.rowCount) {
                blocked = true;
                break;
              }
              await delay(10);
            }
            assert.equal(blocked, true);
            assert.equal(deleted, false);
            await lock.query("COMMIT");
            const outcome = await pending;
            await revoke;
            if ("error" in outcome)
              assert.ok(
                denied("FORBIDDEN")(outcome.error),
                String(outcome.error),
              );
            else
              assert.equal(outcome.value.record.decision.decision, "approve");
          } finally {
            await lock.query("ROLLBACK");
            await revoke;
            revoker.release();
          }
          await assert.rejects(
            f.service.getFindingProposalOwner(f.identity, {
              projectId: f.projectId,
              id: submission.record.proposalId,
            }),
            denied("FORBIDDEN"),
          );
          const newSession = randomUUID();
          await f.admin.pool.query(
            "INSERT INTO public.session(id,user_id,token,expires_at) VALUES($1,$2,$3,$4)",
            [
              newSession,
              f.identity.principalId.slice(5),
              randomUUID(),
              f.identity.expiresAt,
            ],
          );
          const recovered = await f.service.reviewFindingProposal(
            { ...f.identity, sessionId: newSession },
            key,
            f.review(submission.record),
          );
          assert.equal(recovered.replayed, true);
          assert.equal(recovered.record.decision.decision, "approve");
        } finally {
          await lock.query("ROLLBACK");
          lock.release();
          await f.admin.pool.query(
            "DROP TRIGGER " + name + " ON public.foundation_audit",
          );
          await f.admin.pool.query("DROP FUNCTION public." + name + "()");
        }
      },
    );
    await t.test(
      "factory enforces exact methods, operation, target, producer and context",
      async () => {
        await f.runtime.db.transaction(async (tx) => {
          const fake = {} as Parameters<
            typeof createFoundationFindingProposalRecordRepository
          >[2];
          const port = createFoundationFindingProposalRecordRepository(
            tx,
            {
              mode: "owner",
              request: {
                ...f.identity,
                operation: "finding.review",
                projectId: f.projectId,
                environment: "test",
                correlationId: randomUUID(),
                targetId: randomUUID(),
              },
            },
            fake,
            f.now,
          );
          await assert.rejects(
            port.getFindingProposal(randomUUID(), false),
            denied("FORBIDDEN"),
          );
          await assert.rejects(
            port.getFindingProposalByCapture(randomUUID()),
            denied("FORBIDDEN"),
          );
        });
      },
    );
  } finally {
    await f.close();
  }
});
