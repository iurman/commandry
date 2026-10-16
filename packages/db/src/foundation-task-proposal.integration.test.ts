import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  createFoundationOwnerService,
  createFoundationTaskProposalService,
  FoundationTaskProposalUnavailableError,
  type FoundationOwnerRequest,
} from "@commandry/application";
import {
  foundationCreateClientSchema,
  type FoundationTaskProposalDecision,
  type FoundationTaskProposalDetail,
  type FoundationTaskProposalSubmission,
} from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import {
  foundationAudit,
  foundationClient,
  foundationIdempotency,
} from "./foundation-schema";
import { createFoundationTaskProposalAccessRepository } from "./foundation-task-proposal-repository";
import {
  capture,
  captureTriageDecision,
  captureTriageSuggestion,
  project,
  workItem,
} from "./schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;
const operations = ["work.propose", "work.proposal.review"];

async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 3 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const peers: ReturnType<typeof createDatabase>[] = [];
  const projectId = randomUUID();
  const otherId = randomUUID();
  await admin.db.insert(project).values([
    { id: projectId, name: "Actual agent proposal" },
    { id: otherId, name: "Other proposal scope" },
  ]);
  let time = Date.now();
  const now = () => new Date(time);
  // This trusted server identity exercises the owner boundary, not browser auth.
  const identity = {
    principalId: "user:proposal-test-owner",
    expiresAt: new Date(time + 7_200_000).toISOString(),
  };
  const owner = createFoundationOwnerService(
    createFoundationAccessRepository(runtime.db, { now }),
    identity,
    { environment: "test", now },
  );
  const issued = await owner.createClient(
    {
      name: "proposal-only",
      projectId,
      environment: "test",
      ttlSeconds: 3600,
      operations: ["work.propose"],
    },
    "issue-proposal",
  );
  const port = createFoundationTaskProposalAccessRepository(runtime.db, {
    now,
  });
  const service = createFoundationTaskProposalService(port, {
    environment: "test",
    now,
  });
  const input = () => ({
    projectId,
    originalContent: "\ufeff Original cafe\u0301\r\n\t\ud83d\ude80  ",
    proposedTitle: " Proposed title ",
    proposedBody: "\ufeff Proposed body\r\n",
    rationale: " Unverified client interpretation ",
  });
  const machineRequest = () => ({
    operation: "work.propose" as const,
    tokenDigest: foundationTokenDigest(issued.token),
    projectId,
    environment: "test" as const,
    targetId: null,
    correlationId: randomUUID(),
  });
  const ownerRequest = (
    operation: "work.proposal.read" | "work.proposal.review",
    targetId: string,
  ): FoundationOwnerRequest => ({
    ...identity,
    operation,
    projectId,
    environment: "test",
    targetId,
    correlationId: randomUUID(),
  });
  const peer = () => {
    const connection = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 1,
    });
    peers.push(connection);
    return createFoundationTaskProposalService(
      createFoundationTaskProposalAccessRepository(connection.db, { now }),
      { environment: "test", now },
    );
  };
  const counts = async () => {
    const originals = await admin.db
      .select({ id: capture.id })
      .from(capture)
      .where(eq(capture.projectId, projectId));
    const suggestions = await admin.db
      .select({ id: captureTriageSuggestion.id })
      .from(captureTriageSuggestion)
      .innerJoin(capture, eq(capture.id, captureTriageSuggestion.captureId))
      .where(eq(capture.projectId, projectId));
    const decisions = await admin.db
      .select({ id: captureTriageDecision.id })
      .from(captureTriageDecision)
      .innerJoin(capture, eq(capture.id, captureTriageDecision.captureId))
      .where(eq(capture.projectId, projectId));
    const work = await admin.db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.projectId, projectId));
    const receipts = await admin.db
      .select()
      .from(foundationIdempotency)
      .where(
        and(
          eq(foundationIdempotency.projectId, projectId),
          inArray(foundationIdempotency.operation, operations),
        ),
      );
    return {
      originals: originals.length,
      suggestions: suggestions.length,
      decisions: decisions.length,
      work: work.length,
      receipts: receipts.length,
    };
  };
  return {
    admin,
    runtime,
    projectId,
    otherId,
    now,
    identity,
    owner,
    issued,
    port,
    service,
    input,
    machineRequest,
    ownerRequest,
    peer,
    counts,
    advance: (ms: number) => {
      time += ms;
    },
    close: () =>
      Promise.all(
        [...peers, runtime, admin].map((connection) => connection.close()),
      ),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function reviewInput(
  record: FoundationTaskProposalSubmission,
  decision: "approve" | "reject" = "approve",
) {
  const binding = {
    projectId: record.projectId,
    proposalId: record.proposalId,
    expectedVersion: 1,
    expectedProposalDigest: record.proposalDigest,
    expectedSourceDigest: record.sourceDigest,
  };
  return decision === "approve"
    ? {
        ...binding,
        decision,
        selectedTitle: " Corrected owner title \u2603 ",
        selectedBody: "\ufeff corrected\r\n\t",
      }
    : { ...binding, decision };
}
function decisionFor(
  detail: FoundationTaskProposalDetail,
  request: FoundationOwnerRequest,
): FoundationTaskProposalDecision {
  const binding = detail.suggestion.proposal.binding;
  return {
    id: randomUUID(),
    captureId: detail.capture.id,
    suggestionId: detail.suggestion.id,
    decision: "reject",
    selectedProjectId: null,
    selectedKind: null,
    selectedTitle: null,
    selectedBody: null,
    filedRecordId: null,
    actor: request.principalId,
    createdAt: detail.capture.createdAt,
    provenance: {
      schemaVersion: 1,
      projectId: binding.projectId,
      environment: binding.environment,
      proposalVersion: 1,
      proposalDigest: detail.suggestion.proposal.contentDigest,
      sourceDigest: binding.sourceDigest,
      reviewedBy: request.principalId,
      correlationId: request.correlationId,
    },
  };
}
async function read(f: Fixture, record: FoundationTaskProposalSubmission) {
  return f.service.getTaskProposal(f.identity, {
    projectId: f.projectId,
    captureId: record.captureId,
  });
}
async function observeWait(
  f: Fixture,
  predicate: "capture" | "advisory",
  minimum = 1,
) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result =
      predicate === "capture"
        ? await f.admin.db.execute(
            sql`select count(*)::int as count from pg_stat_activity where usename = 'commandry_app_integration' and wait_event_type = 'Lock' and query ilike '%capture%' and cardinality(pg_blocking_pids(pid)) > 0`,
          )
        : await f.admin.db.execute(
            sql`select count(*)::int as count from pg_locks where locktype = 'advisory' and objid = 577031 and not granted`,
          );
    if (Number(result.rows[0]!.count) >= minimum) return;
    await delay(10);
  }
  assert.fail(`Did not observe actual PostgreSQL ${predicate} lock wait`);
}

test(
  "actual scoped submission, corrected filing and historical replays preserve exact bytes and canonical defaults",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      assert.deepEqual(Object.keys(f.port).sort(), ["withClient", "withOwner"]);
      const submitted = await f.service.submitTaskProposal(
        f.issued.token,
        "submit",
        f.input(),
      );
      const pending = await read(f, submitted.record);
      assert.equal(pending.capture.originalContent, f.input().originalContent);
      assert.equal(
        Buffer.from(pending.capture.originalContent).equals(
          Buffer.from(f.input().originalContent),
        ),
        true,
      );
      assert.equal(
        submitted.record.sourceDigest,
        foundationByteDigest(f.input().originalContent),
      );
      assert.equal(
        pending.capture.author,
        `foundation-client:${f.issued.client.id}`,
      );
      assert.equal(pending.capture.source, "foundation-client");
      assert.equal(pending.capture.file, null);
      assert.equal(pending.capture.state, "unfiled");
      assert.equal(pending.decision, null);
      assert.equal(pending.suggestion.confidence, null);
      const binding = pending.suggestion.proposal.binding;
      assert.equal(binding.clientId, f.issued.client.id);
      assert.equal(binding.environment, "test");
      assert.equal(binding.correlationId, submitted.correlationId);
      assert.equal(binding.runtime, null);
      assert.equal(binding.model, null);
      assert.equal(binding.runId, null);
      assert.equal(foundationDigest(binding), submitted.record.proposalDigest);
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 0,
        work: 0,
        receipts: 1,
      });
      f.advance(25);
      const selected = reviewInput(submitted.record);
      const approved = await f.service.reviewTaskProposal(
        f.identity,
        "approve",
        selected,
      );
      assert.equal(approved.replayed, false);
      assert.equal(approved.record.decision.actor, f.identity.principalId);
      assert.equal(
        approved.record.decision.provenance.correlationId,
        approved.correlationId,
      );
      const work = approved.record.work!;
      assert.equal(work.title, " Corrected owner title \u2603 ");
      assert.equal(work.description, "\ufeff corrected\r\n\t");
      assert.equal(work.sourceCaptureId, submitted.record.captureId);
      assert.equal(work.projectId, f.projectId);
      assert.equal(work.workType, "task");
      assert.equal(work.status, "open");
      assert.equal(work.assigneeKind, "unassigned");
      for (const value of [
        work.assigneeAgentId,
        work.assigneeLabel,
        work.priority,
        work.dueOn,
        work.generatedFromWorkItemId,
        work.contextLink,
      ])
        assert.equal(value, null);
      assert.equal(work.createdAt, approved.record.decision.createdAt);
      assert.equal(work.updatedAt, work.createdAt);
      const current = await read(f, submitted.record);
      assert.equal(current.capture.filedRecord!.id, work.id);
      assert.equal(current.capture.filedAt, work.createdAt);
      assert.deepEqual(current.suggestion, pending.suggestion);
      assert.equal(
        current.capture.originalContent,
        pending.capture.originalContent,
      );
      const [storedDecision] = await f.admin.db
        .select()
        .from(captureTriageDecision)
        .where(eq(captureTriageDecision.id, approved.record.decision.id));
      assert.deepEqual(
        storedDecision!.provenance,
        approved.record.decision.provenance,
      );
      assert.match(storedDecision!.creationTransaction, /^\d+$/);
      await f.admin.db
        .update(workItem)
        .set({
          title: "Later ordinary Work edit",
          description: "Later body",
          status: "done",
          updatedAt: new Date(f.now().getTime() + 100),
        })
        .where(eq(workItem.id, work.id));
      const submitReplay = await f.service.submitTaskProposal(
        f.issued.token,
        "submit",
        f.input(),
      );
      assert.deepEqual(submitReplay, { ...submitted, replayed: true });
      const reviewReplay = await f.service.reviewTaskProposal(
        f.identity,
        "approve",
        selected,
      );
      assert.deepEqual(reviewReplay, { ...approved, replayed: true });
      await assert.rejects(
        f.service.submitTaskProposal(f.issued.token, "submit", {
          ...f.input(),
          rationale: "Changed payload",
        }),
        denied("IDEMPOTENCY_CONFLICT"),
      );
      await assert.rejects(
        f.service.reviewTaskProposal(
          f.identity,
          "approve",
          reviewInput(submitted.record, "reject"),
        ),
        denied("IDEMPOTENCY_CONFLICT"),
      );
      await assert.rejects(
        f.service.reviewTaskProposal(f.identity, "terminal", selected),
        denied("VERSION_CONFLICT"),
      );
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 1,
        work: 1,
        receipts: 2,
      });
      const receipts = await f.admin.db
        .select()
        .from(foundationIdempotency)
        .where(
          and(
            eq(foundationIdempotency.projectId, f.projectId),
            inArray(foundationIdempotency.operation, operations),
          ),
        );
      for (const receipt of receipts)
        assert.equal(foundationDigest(receipt.result), receipt.resultDigest);
      assert.deepEqual(
        receipts.find((row) => row.operation === "work.proposal.review")!
          .result,
        { record: approved.record, correlationId: approved.correlationId },
      );
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            inArray(foundationAudit.operation, operations),
          ),
        );
      assert.equal(audits.filter((row) => row.code === "OK").length, 2);
      assert.equal(audits.filter((row) => row.code === "REPLAYED").length, 2);
      assert.equal(
        audits.filter((row) => row.code === "IDEMPOTENCY_CONFLICT").length,
        2,
      );
      assert.equal(
        audits.filter((row) => row.code === "VERSION_CONFLICT").length,
        1,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "reject is terminal, retains exact original and creates no Work",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const submitted = await f.service.submitTaskProposal(
        f.issued.token,
        "reject-source",
        f.input(),
      );
      const rejected = await f.service.reviewTaskProposal(
        f.identity,
        "reject",
        reviewInput(submitted.record, "reject"),
      );
      assert.equal(rejected.record.work, null);
      for (const value of [
        rejected.record.decision.selectedProjectId,
        rejected.record.decision.selectedKind,
        rejected.record.decision.selectedTitle,
        rejected.record.decision.selectedBody,
        rejected.record.decision.filedRecordId,
      ])
        assert.equal(value, null);
      const current = await read(f, submitted.record);
      assert.equal(current.capture.state, "unfiled");
      assert.equal(current.capture.originalContent, f.input().originalContent);
      await assert.rejects(
        f.service.reviewTaskProposal(
          f.identity,
          "approve-after-reject",
          reviewInput(submitted.record),
        ),
        denied("VERSION_CONFLICT"),
      );
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 1,
        work: 0,
        receipts: 2,
      });
    } finally {
      await f.close();
    }
  },
);

test(
  "same-key concurrent submit across single-connection runtime pools commits one canonical proposal and OK/REPLAYED audits",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const peer = f.peer();
      const results = await Promise.all([
        f.service.submitTaskProposal(f.issued.token, "concurrent", f.input()),
        peer.submitTaskProposal(f.issued.token, "concurrent", f.input()),
      ]);
      assert.deepEqual(results[0]!.record, results[1]!.record);
      assert.deepEqual(results.map((row) => row.replayed).sort(), [
        false,
        true,
      ]);
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 0,
        work: 0,
        receipts: 1,
      });
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.operation, "work.propose"),
          ),
        );
      assert.deepEqual(audits.map((row) => row.code).sort(), [
        "OK",
        "REPLAYED",
      ]);
      assert.equal(
        audits.every(
          (row) =>
            row.clientId === f.issued.client.id &&
            row.principalId === `foundation-client:${f.issued.client.id}`,
        ),
        true,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "concurrent approve/reject reload after the same real Capture lock and commit one terminal decision",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let release: (() => void) | undefined;
    let blocking: Promise<void> | undefined;
    let reviewing:
      | Promise<
          PromiseSettledResult<
            Awaited<ReturnType<typeof f.service.reviewTaskProposal>>
          >[]
        >
      | undefined;
    try {
      const submitted = await f.service.submitTaskProposal(
        f.issued.token,
        "race-source",
        f.input(),
      );
      const peer = f.peer();
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx
          .select()
          .from(capture)
          .where(eq(capture.id, submitted.record.captureId))
          .for("update");
        ready();
        await held;
      });
      await entered;
      reviewing = Promise.allSettled([
        f.service.reviewTaskProposal(
          f.identity,
          "race-approve",
          reviewInput(submitted.record),
        ),
        peer.reviewTaskProposal(
          f.identity,
          "race-reject",
          reviewInput(submitted.record, "reject"),
        ),
      ]);
      await observeWait(f, "capture", 2);
      release!();
      await blocking;
      const outcomes = await reviewing;
      assert.equal(
        outcomes.filter((row) => row.status === "fulfilled").length,
        1,
      );
      const failure = outcomes.find(
        (row) => row.status === "rejected",
      )! as PromiseRejectedResult;
      assert.equal(denied("VERSION_CONFLICT")(failure.reason), true);
      const current = await read(f, submitted.record);
      assert.ok(current.decision);
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 1,
        work: current.decision.decision === "approve" ? 1 : 0,
        receipts: 2,
      });
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.operation, "work.proposal.review"),
          ),
        );
      assert.deepEqual(audits.map((row) => row.code).sort(), [
        "OK",
        "VERSION_CONFLICT",
      ]);
    } finally {
      release?.();
      await Promise.allSettled(
        [blocking, reviewing].filter((value) => value !== undefined),
      );
      await f.close();
    }
  },
);

test(
  "scoped selectors and independent trusted factories deny alternate operations and forged review metadata",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const submitted = await f.service.submitTaskProposal(
        f.issued.token,
        "scope-source",
        f.input(),
      );
      const detail = await read(f, submitted.record);
      await assert.rejects(
        f.service.getTaskProposal(f.identity, {
          projectId: f.otherId,
          captureId: submitted.record.captureId,
        }),
        denied("NOT_FOUND"),
      );
      await assert.rejects(
        f.service.getTaskProposal(f.identity, {
          projectId: f.projectId,
          captureId: randomUUID(),
        }),
        denied("NOT_FOUND"),
      );
      const foreignEnvironment = createFoundationTaskProposalService(f.port, {
        environment: "local",
        now: f.now,
      });
      await assert.rejects(
        foreignEnvironment.getTaskProposal(f.identity, {
          projectId: f.projectId,
          captureId: submitted.record.captureId,
        }),
        denied("NOT_FOUND"),
      );
      await assert.rejects(
        foreignEnvironment.reviewTaskProposal(
          f.identity,
          "foreign-env",
          reviewInput(submitted.record),
        ),
        denied("NOT_FOUND"),
      );
      await assert.rejects(
        f.service.reviewTaskProposal(f.identity, "foreign-project", {
          ...reviewInput(submitted.record),
          projectId: f.otherId,
        }),
        denied("NOT_FOUND"),
      );
      await assert.rejects(
        f.service.submitTaskProposal(f.issued.token, "foreign-submit", {
          ...f.input(),
          projectId: f.otherId,
        }),
        (error: unknown) => error instanceof FoundationError,
      );
      const request = f.ownerRequest(
        "work.proposal.review",
        submitted.record.proposalId,
      );
      await assert.rejects(
        f.port.withOwner(request, (records) =>
          records.getTaskProposal(randomUUID(), true),
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withOwner(request, (records) =>
          records.getTaskProposal(submitted.record.proposalId, false),
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withOwner(request, (records) =>
          records.getTaskProposalByCapture(submitted.record.captureId),
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withOwner(
          {
            ...request,
            principalId: `foundation-client:${f.issued.client.id}`,
          },
          async () => null,
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withOwner(
          { ...request, operation: "foundation.read" },
          async () => null,
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withClient(f.machineRequest(), (_client, records) =>
          records.getTaskProposalByCapture(submitted.record.captureId),
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withClient(f.machineRequest(), (_client, records) =>
          records.reviewTaskProposal({
            decision: decisionFor(detail, request),
          }),
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.port.withOwner(request, (records) =>
          records.insertTaskProposal(detail),
        ),
        denied("INVALID_REFERENCE"),
      );
      for (const patch of [
        {
          actor: "user:forged",
          provenance: {
            ...decisionFor(detail, request).provenance,
            reviewedBy: "user:forged",
          },
        },
        {
          provenance: {
            ...decisionFor(detail, request).provenance,
            correlationId: randomUUID(),
          },
        },
        { captureId: randomUUID() },
      ]) {
        await assert.rejects(
          f.port.withOwner(request, (records) =>
            records.reviewTaskProposal({
              decision: { ...decisionFor(detail, request), ...patch },
            }),
          ),
          denied("INVALID_REFERENCE"),
        );
      }
      await assert.rejects(
        f.port.withOwner(request, (records) =>
          records.reviewTaskProposal({
            decision: {
              ...decisionFor(detail, request),
              provenance: {
                ...decisionFor(detail, request).provenance,
                proposalDigest: "0".repeat(64),
              },
            },
          }),
        ),
        denied("VERSION_CONFLICT"),
      );
      const wrongBinding = structuredClone(detail);
      wrongBinding.suggestion.proposal.binding.correlationId = randomUUID();
      wrongBinding.suggestion.proposal.contentDigest = foundationDigest(
        wrongBinding.suggestion.proposal.binding,
      );
      await assert.rejects(
        f.port.withClient(f.machineRequest(), (_client, records) =>
          records.insertTaskProposal(wrongBinding),
        ),
        (error: unknown) =>
          error instanceof FoundationTaskProposalUnavailableError &&
          !(error instanceof FoundationError),
      );
      // Direct internal callers must independently lock/reload without a prior get.
      const direct = await f.port.withOwner(request, (records) =>
        records.reviewTaskProposal({ decision: decisionFor(detail, request) }),
      );
      assert.equal(direct.decision.decision, "reject");
      await assert.rejects(
        f.port.withOwner(request, (records) =>
          records.reviewTaskProposal({
            decision: decisionFor(detail, request),
          }),
        ),
        denied("VERSION_CONFLICT"),
      );
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 1,
        work: 0,
        receipts: 1,
      });
    } finally {
      await f.close();
    }
  },
);

test(
  "explicit issuance leaves old seven grants without proposal authority, owner operations unissuable and revoked/expired grants inert",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const oldOperations = [
        "foundation.read",
        "work.read",
        "evidence.record",
        "memory.propose",
        "memory.revise",
        "configuration.record",
        "evaluation.record",
      ] as const;
      const old = await f.owner.createClient(
        {
          name: "old-seven",
          projectId: f.projectId,
          environment: "test",
          operations: [...oldOperations],
          ttlSeconds: 3600,
        },
        "old-seven",
      );
      assert.deepEqual(old.client.operations, [...oldOperations]);
      assert.deepEqual(f.issued.client.operations, ["work.propose"]);
      await assert.rejects(
        f.service.submitTaskProposal(old.token, "old-denied", f.input()),
        (error: unknown) => error instanceof FoundationError,
      );
      await assert.rejects(
        f.port.withClient(
          {
            ...f.machineRequest(),
            tokenDigest: foundationTokenDigest(old.token),
            operation: "foundation.read",
          },
          async () => null,
        ),
        denied("INVALID_REFERENCE"),
      );
      for (const operation of ["work.proposal.read", "work.proposal.review"]) {
        assert.equal(
          foundationCreateClientSchema.safeParse({
            name: "owner-operation",
            projectId: f.projectId,
            environment: "test",
            operations: [operation],
            ttlSeconds: 3600,
          }).success,
          false,
        );
        await assert.rejects(
          f.owner.createClient(
            {
              name: "owner-operation",
              projectId: f.projectId,
              environment: "test",
              operations: [operation],
              ttlSeconds: 3600,
            },
            "owner-operation",
          ),
        );
      }
      await f.owner.revokeClient({ clientId: f.issued.client.id });
      await assert.rejects(
        f.service.submitTaskProposal(
          f.issued.token,
          "revoked-denied",
          f.input(),
        ),
        denied("REVOKED"),
      );
      const expiring = await f.owner.createClient(
        {
          name: "expiring",
          projectId: f.projectId,
          environment: "test",
          operations: ["work.propose"],
          ttlSeconds: 60,
        },
        "expiring",
      );
      f.advance(60_000);
      await assert.rejects(
        f.service.submitTaskProposal(
          expiring.token,
          "expired-denied",
          f.input(),
        ),
        denied("EXPIRED"),
      );
      assert.deepEqual(await f.counts(), {
        originals: 0,
        suggestions: 0,
        decisions: 0,
        work: 0,
        receipts: 0,
      });
      const [stored] = await f.admin.db
        .select()
        .from(foundationClient)
        .where(eq(foundationClient.id, old.client.id));
      assert.deepEqual(stored!.operations, [...oldOperations]);
    } finally {
      await f.close();
    }
  },
);

for (const phase of ["submit", "review"] as const) {
  test(
    `actual audit failure rolls back all ${phase} canonical effects and core receipt`,
    { timeout: 30_000 },
    async () => {
      const f = await fixture();
      try {
        const submitted =
          phase === "review"
            ? await f.service.submitTaskProposal(
                f.issued.token,
                "audit-source",
                f.input(),
              )
            : null;
        const baseline = await f.counts();
        await f.admin.db.execute(
          sql`create function commandry_test_proposal_audit_fail() returns trigger language plpgsql as $$ begin if NEW.operation in ('work.propose','work.proposal.review') then raise exception 'Injected proposal audit failure'; end if; return NEW; end $$`,
        );
        await f.admin.db.execute(
          sql`create trigger commandry_test_proposal_audit_fail before insert on foundation_audit for each row execute function commandry_test_proposal_audit_fail()`,
        );
        await assert.rejects(
          phase === "submit"
            ? f.service.submitTaskProposal(
                f.issued.token,
                "audit-submit",
                f.input(),
              )
            : f.service.reviewTaskProposal(
                f.identity,
                "audit-review",
                reviewInput(submitted!.record),
              ),
        );
        assert.deepEqual(await f.counts(), baseline);
        const audits = await f.admin.db
          .select()
          .from(foundationAudit)
          .where(
            and(
              eq(foundationAudit.projectId, f.projectId),
              eq(
                foundationAudit.operation,
                phase === "submit" ? "work.propose" : "work.proposal.review",
              ),
            ),
          );
        assert.equal(audits.length, 0);
        if (submitted) {
          const [original] = await f.admin.db
            .select()
            .from(capture)
            .where(eq(capture.id, submitted.record.captureId));
          assert.equal(original!.state, "unfiled");
          assert.equal(original!.originalContent, f.input().originalContent);
        }
      } finally {
        await f.admin.db.execute(
          sql`drop trigger if exists commandry_test_proposal_audit_fail on foundation_audit`,
        );
        await f.admin.db.execute(
          sql`drop function if exists commandry_test_proposal_audit_fail()`,
        );
        await f.close();
      }
    },
  );
}

test(
  "owner expiry during a real Capture lock wait denies review and leaves the proposal pending",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let release: (() => void) | undefined;
    let blocking: Promise<void> | undefined;
    let rejecting: Promise<void> | undefined;
    try {
      const submitted = await f.service.submitTaskProposal(
        f.issued.token,
        "expiry-source",
        f.input(),
      );
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx
          .select()
          .from(capture)
          .where(eq(capture.id, submitted.record.captureId))
          .for("update");
        ready();
        await held;
      });
      await entered;
      rejecting = assert.rejects(
        f.service.reviewTaskProposal(
          f.identity,
          "expiry-review",
          reviewInput(submitted.record),
        ),
        denied("EXPIRED"),
      );
      await observeWait(f, "capture");
      f.advance(7_200_000);
      release!();
      await blocking;
      await rejecting;
      assert.deepEqual(await f.counts(), {
        originals: 1,
        suggestions: 1,
        decisions: 0,
        work: 0,
        receipts: 1,
      });
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.operation, "work.proposal.review"),
          ),
        );
      assert.deepEqual(
        audits.map((row) => [row.decision, row.code]),
        [["denied", "EXPIRED"]],
      );
    } finally {
      release?.();
      await Promise.allSettled(
        [blocking, rejecting].filter((value) => value !== undefined),
      );
      await f.close();
    }
  },
);

for (const phase of ["submit", "review"] as const) {
  test(
    `${phase} expiry during a real audit wait rolls back canonical effects, receipt and allowed audit`,
    { timeout: 30_000 },
    async () => {
      const f = await fixture();
      let release: (() => void) | undefined;
      let blocking: Promise<void> | undefined;
      let rejecting: Promise<void> | undefined;
      try {
        const submitted =
          phase === "review"
            ? await f.service.submitTaskProposal(
                f.issued.token,
                "audit-expiry-source",
                f.input(),
              )
            : null;
        const baseline = await f.counts();
        await f.admin.db.execute(
          sql`create function commandry_test_proposal_audit_wait() returns trigger language plpgsql as $$ begin if NEW.operation in ('work.propose','work.proposal.review') and NEW.decision = 'allowed' then perform pg_advisory_xact_lock(577031); end if; return NEW; end $$`,
        );
        await f.admin.db.execute(
          sql`create trigger commandry_test_proposal_audit_wait before insert on foundation_audit for each row execute function commandry_test_proposal_audit_wait()`,
        );
        let ready!: () => void;
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        blocking = f.admin.db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(577031)`);
          ready();
          await held;
        });
        await entered;
        rejecting = assert.rejects(
          phase === "submit"
            ? f.service.submitTaskProposal(
                f.issued.token,
                "audit-expiry-submit",
                f.input(),
              )
            : f.service.reviewTaskProposal(
                f.identity,
                "audit-expiry-review",
                reviewInput(submitted!.record),
              ),
          denied("EXPIRED"),
        );
        await observeWait(f, "advisory");
        f.advance(phase === "submit" ? 3_600_000 : 7_200_000);
        release!();
        await blocking;
        await rejecting;
        assert.deepEqual(await f.counts(), baseline);
        const audits = await f.admin.db
          .select()
          .from(foundationAudit)
          .where(
            and(
              eq(foundationAudit.projectId, f.projectId),
              eq(
                foundationAudit.operation,
                phase === "submit" ? "work.propose" : "work.proposal.review",
              ),
            ),
          );
        assert.deepEqual(
          audits.map((row) => [row.decision, row.code]),
          [["denied", "EXPIRED"]],
        );
      } finally {
        release?.();
        await Promise.allSettled(
          [blocking, rejecting].filter((value) => value !== undefined),
        );
        await f.admin.db.execute(
          sql`drop trigger if exists commandry_test_proposal_audit_wait on foundation_audit`,
        );
        await f.admin.db.execute(
          sql`drop function if exists commandry_test_proposal_audit_wait()`,
        );
        await f.close();
      }
    },
  );
}
