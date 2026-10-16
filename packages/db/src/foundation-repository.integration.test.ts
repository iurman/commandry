import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import {
  createFoundationAuthenticationService,
  createFoundationMachineService,
  createFoundationOwnerService,
} from "@commandry/application";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationAuthenticationRepository } from "./foundation-authentication-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import { createKnowledgeRevisionRepository } from "./knowledge-revision-repository";
import { capture, knowledgeItem, project } from "./schema";
import {
  foundationAudit,
  foundationClient,
  foundationConfiguration,
  foundationConfigurationParent,
  foundationEvidence,
  foundationIdempotency,
  foundationInstructionApproval,
  foundationMemoryRevision,
  foundationMemoryReview,
} from "./foundation-schema";

const ownerUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!ownerUrl || !runtimePassword)
  throw new Error("Use scripts/test-integration.mjs --foundation-only");
const runtimeUrl = new URL(ownerUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;
const expiresAt = () => new Date(Date.now() + 3600000).toISOString();
const causedBy =
  (pattern: RegExp) =>
  (error: unknown): boolean =>
    error instanceof Error &&
    (pattern.test(error.message) || causedBy(pattern)(error.cause));

async function fixture() {
  const admin = createDatabase({ connectionString: ownerUrl!, max: 3 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 5,
  });
  const projectId = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  const captureId = crypto.randomUUID();
  const knowledgeId = crypto.randomUUID();
  const text = "Use local, scoped evidence and preserve the original source.";
  await admin.db.insert(project).values([
    { id: projectId, name: "Foundation integration" },
    { id: otherId, name: "Private outside scope" },
  ]);
  await admin.db.insert(capture).values({
    id: captureId,
    inputType: "text",
    originalContent: text,
    projectId,
  });
  await admin.db.insert(knowledgeItem).values({
    id: knowledgeId,
    projectId,
    sourceCaptureId: captureId,
    kind: "instruction",
    title: "Source",
    content: text,
  });
  const port = createFoundationAccessRepository(runtime.db);
  const owner = createFoundationOwnerService(
    port,
    {
      principalId: "user:foundation-integration-owner",
      expiresAt: expiresAt(),
    },
    { environment: "test" },
  );
  const machine = createFoundationMachineService(port, { environment: "test" });
  const issued = await owner.createClient(
    {
      name: "Scoped integration client",
      projectId,
      environment: "test",
      ttlSeconds: 3600,
      operations: [
        "foundation.read",
        "evidence.record",
        "memory.propose",
        "memory.revise",
        "configuration.record",
      ],
    },
    "issue",
  );
  const evidenceInput = {
    projectId,
    sourceKind: "knowledge_revision" as const,
    sourceId: knowledgeId,
    sourceVersion: "1",
    contentDigest: foundationByteDigest(text),
    locator: `commandry:knowledge/${knowledgeId}/versions/1`,
    observedAt: null,
    availability: "available" as const,
  };
  const content = (evidenceId: string) => ({
    statement: "Prefer local tools for this project.",
    category: "instruction" as const,
    evidenceIds: [evidenceId],
    relatedMemoryIds: [] as string[],
    relationType: null,
  });
  return {
    admin,
    runtime,
    port,
    owner,
    machine,
    issued,
    projectId,
    otherId,
    captureId,
    knowledgeId,
    text,
    evidenceInput,
    content,
    close: async () => {
      await runtime.close();
      await admin.close();
    },
  };
}

test(
  "foundation persists real scoped evidence, exact retries, separate authority and stale-source history with runtime privileges",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const [stored] = await f.runtime.db
        .select()
        .from(foundationClient)
        .where(eq(foundationClient.id, f.issued.client.id));
      assert.equal(stored!.tokenDigest, foundationTokenDigest(f.issued.token));
      assert.equal(JSON.stringify(stored).includes(f.issued.token), false);
      await assert.rejects(
        f.owner.createClient(
          {
            name: "Scoped integration client",
            projectId: f.projectId,
            environment: "test",
            ttlSeconds: 3600,
            operations: [
              "foundation.read",
              "evidence.record",
              "memory.propose",
              "memory.revise",
              "configuration.record",
            ],
          },
          "issue",
        ),
        denied("IDEMPOTENCY_CONFLICT"),
      );
      for (const [index, observedAt] of [
        "2026-10-15T08:00:00Z",
        "2026-10-15T10:00:00+02:00",
        "2026-10-15T08:00:00.123456789Z",
      ].entries()) {
        const timed = await f.machine.recordEvidence(
          f.issued.token,
          { ...f.evidenceInput, observedAt },
          `source-time-${index}`,
        );
        assert.equal(timed.record.observedAt, observedAt);
        assert.equal(
          (
            await f.machine.getEvidence(f.issued.token, {
              projectId: f.projectId,
              id: timed.record.id,
            })
          ).observedAt,
          observedAt,
        );
      }
      const evidence = await f.machine.recordEvidence(
        f.issued.token,
        f.evidenceInput,
        "source",
      );
      const replay = await f.machine.recordEvidence(
        f.issued.token,
        f.evidenceInput,
        "source",
      );
      assert.deepEqual(replay, { ...evidence, replayed: true });
      await assert.rejects(
        f.machine.recordEvidence(
          f.issued.token,
          { ...f.evidenceInput, locator: "changed" },
          "source",
        ),
        denied("IDEMPOTENCY_CONFLICT"),
      );
      await assert.rejects(
        f.machine.recordEvidence(
          f.issued.token,
          { ...f.evidenceInput, contentDigest: "0".repeat(64) },
          "bad-digest",
        ),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.machine.getEvidence(f.issued.token, {
          projectId: f.otherId,
          id: evidence.record.id,
        }),
        denied("FORBIDDEN"),
      );
      const proposed = await f.machine.proposeMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          knowledgeItemId: f.knowledgeId,
          content: f.content(evidence.record.id),
          alias: { namespace: "integration", externalId: "preference-1" },
        },
        "propose",
      );
      const reviewed = await f.owner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: proposed.record.id,
          expectedVersion: 1,
          decision: "accepted",
          reason: "Reviewed exact wording",
        },
        "review",
      );
      assert.equal(reviewed.record.verification, "unverified");
      const verified = await f.owner.verifyMemory(
        {
          projectId: f.projectId,
          memoryId: proposed.record.id,
          expectedVersion: 1,
          verification: "source_matched",
          evidenceIds: [evidence.record.id],
          reason: "Matched the exact source bytes",
        },
        "verify",
      );
      assert.equal(verified.record.lifecycle, "accepted");
      const approval = await f.owner.approveInstruction(
        {
          projectId: f.projectId,
          memoryId: proposed.record.id,
          expectedVersion: 1,
          contentDigest: proposed.record.contentDigest,
          disclosureProjectId: f.projectId,
          expiresAt: expiresAt(),
        },
        "approve",
      );
      assert.equal(approval.record.memoryId, proposed.record.id);
      assert.equal(
        (
          await f.machine.getMemory(f.issued.token, {
            projectId: f.projectId,
            id: proposed.record.id,
          })
        ).anchor.freshness,
        "fresh",
      );
      await createKnowledgeRevisionRepository(f.admin.db).revise(
        f.knowledgeId,
        {
          expectedVersion: 1,
          title: "Source",
          content: "Updated source, requiring renewed context review.",
        },
      );
      assert.equal(
        (
          await f.machine.getMemory(f.issued.token, {
            projectId: f.projectId,
            id: proposed.record.id,
          })
        ).anchor.freshness,
        "stale",
      );
      await assert.rejects(
        f.owner.approveInstruction(
          {
            projectId: f.projectId,
            memoryId: proposed.record.id,
            expectedVersion: 1,
            contentDigest: proposed.record.contentDigest,
            disclosureProjectId: f.projectId,
            expiresAt: expiresAt(),
          },
          "approve-stale",
        ),
        denied("INVALID_REFERENCE"),
      );
      const [history] = await f.runtime.db
        .select()
        .from(foundationInstructionApproval)
        .where(eq(foundationInstructionApproval.id, approval.record.id));
      assert.equal(history!.revokedAt, null);
      const original = await f.machine.getEvidence(f.issued.token, {
        projectId: f.projectId,
        id: evidence.record.id,
      });
      assert.equal(original.contentDigest, foundationByteDigest(f.text));
      // Original version one remains resolvable through version two's preserved before text.
      await f.machine.recordEvidence(
        f.issued.token,
        f.evidenceInput,
        "historical-one",
      );
      const page = await f.owner.listClients({
        projectId: f.projectId,
        limit: 1,
      });
      assert.equal(JSON.stringify(page).includes(stored!.tokenDigest), false);
      await f.owner.revokeClient({ clientId: f.issued.client.id });
      await assert.rejects(
        f.machine.recordEvidence(f.issued.token, f.evidenceInput, "source"),
        denied("REVOKED"),
      );
      await f.owner.revokeClient({ clientId: f.issued.client.id });
      const revokeAudits = await f.runtime.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.targetId, f.issued.client.id),
            eq(foundationAudit.operation, "foundation.client.revoked"),
          ),
        );
      assert.equal(revokeAudits.length, 1);
    } finally {
      await f.close();
    }
  },
);

test(
  "configuration kinds, complete lineage and provenance membership remain immutable across transactions and savepoints",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const ids: string[] = [];
      for (const kind of [
        "prompt",
        "skill",
        "hook",
        "loop",
        "runtime",
        "model",
        "settings",
      ] as const) {
        const config = await f.machine.recordConfiguration(
          f.issued.token,
          {
            projectId: f.projectId,
            kind,
            content: "exact\nbytes\n",
            parentIds: ids.slice(-1),
            sourceCommit: null,
          },
          `config-${kind}`,
        );
        ids.push(config.record.id);
        assert.equal(
          config.record.contentDigest,
          foundationByteDigest("exact\nbytes\n"),
        );
        assert.deepEqual(
          await f.machine.getConfiguration(f.issued.token, {
            projectId: f.projectId,
            id: config.record.id,
          }),
          config.record,
        );
      }
      await assert.rejects(
        f.runtime.db
          .update(foundationConfiguration)
          .set({ content: "mutated" })
          .where(eq(foundationConfiguration.id, ids[0]!)),
        causedBy(/immutable/),
      );
      await assert.rejects(
        f.runtime.db.insert(foundationConfigurationParent).values({
          configurationId: ids[0]!,
          parentId: ids[1]!,
          projectId: f.projectId,
          ordinal: 1,
        }),
        causedBy(/membership is immutable/),
      );
      // A parent and child created on different savepoint levels share the top-level transaction.
      const composedId = crypto.randomUUID();
      await f.runtime.db.transaction(async (tx) => {
        await tx.insert(foundationConfiguration).values({
          id: composedId,
          projectId: f.projectId,
          kind: "skill",
          content: "composed",
          contentDigest: foundationByteDigest("composed"),
          sourceCommit: null,
          recordedAt: new Date(),
          recordedBy: "test:composition",
          creationTransaction: "forged-value",
        });
        await tx.transaction(async (nested) => {
          await nested.insert(foundationConfigurationParent).values({
            configurationId: composedId,
            parentId: ids[0]!,
            projectId: f.projectId,
            ordinal: 0,
          });
        });
      });
      const [composed] = await f.runtime.db
        .select()
        .from(foundationConfiguration)
        .where(eq(foundationConfiguration.id, composedId));
      assert.notEqual(composed!.creationTransaction, "forged-value");
      const captureEvidence = await f.machine.recordEvidence(
        f.issued.token,
        {
          ...f.evidenceInput,
          sourceKind: "capture",
          sourceId: f.captureId,
          sourceVersion: null,
        },
        "capture",
      );
      await f.machine.proposeMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          knowledgeItemId: f.knowledgeId,
          content: f.content(captureEvidence.record.id),
          alias: null,
        },
        "capture-memory",
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "known callback denial rolls back partial writes before its denied audit; late audit failure rolls back all effects",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const correlationId = crypto.randomUUID();
      const evidenceId = crypto.randomUUID();
      await assert.rejects(
        f.port.withClient(
          {
            tokenDigest: foundationTokenDigest(f.issued.token),
            operation: "evidence.record",
            projectId: f.projectId,
            environment: "test",
            correlationId,
            targetId: null,
          },
          async (_, records) => {
            await records.insertEvidence({
              ...f.evidenceInput,
              schemaVersion: 1,
              id: evidenceId,
              ingestedAt: new Date().toISOString(),
              recordedBy: `foundation-client:${f.issued.client.id}`,
              verification: "unverified",
            });
            throw new FoundationError(
              "FORBIDDEN",
              "Deliberate denial after partial callback",
            );
          },
        ),
        denied("FORBIDDEN"),
      );
      assert.equal(
        (
          await f.runtime.db
            .select()
            .from(foundationEvidence)
            .where(eq(foundationEvidence.id, evidenceId))
        ).length,
        0,
      );
      const [audit] = await f.runtime.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.correlationId, correlationId));
      assert.equal(audit!.decision, "denied");
      await f.admin.db.execute(
        sql`create function commandry_test_foundation_audit_fail() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end $$`,
      );
      try {
        await f.admin.db.execute(
          sql`create trigger commandry_test_foundation_audit_fail before insert on foundation_audit for each row execute function commandry_test_foundation_audit_fail()`,
        );
        await assert.rejects(
          f.machine.recordEvidence(
            f.issued.token,
            f.evidenceInput,
            "audit-failure",
          ),
          causedBy(/Injected audit failure/),
        );
      } finally {
        await f.admin.db.execute(
          sql`drop trigger if exists commandry_test_foundation_audit_fail on foundation_audit`,
        );
        await f.admin.db.execute(
          sql`drop function commandry_test_foundation_audit_fail()`,
        );
      }
      assert.equal(
        (
          await f.runtime.db
            .select()
            .from(foundationEvidence)
            .where(eq(foundationEvidence.projectId, f.projectId))
        ).length,
        0,
      );
      assert.equal(
        (
          await f.runtime.db
            .select()
            .from(foundationIdempotency)
            .where(
              and(
                eq(foundationIdempotency.projectId, f.projectId),
                eq(foundationIdempotency.operation, "evidence.record"),
              ),
            )
        ).length,
        0,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "simultaneous retries create one effect and concurrent revisions retain exactly one winning version",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          f.machine.recordEvidence(
            f.issued.token,
            f.evidenceInput,
            "simultaneous-source",
          ),
        ),
      );
      assert.equal(new Set(results.map((r) => r.record.id)).size, 1);
      assert.equal(results.filter((r) => !r.replayed).length, 1);
      const evidenceId = results[0]!.record.id;
      const proposal = await f.machine.proposeMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          knowledgeItemId: f.knowledgeId,
          content: f.content(evidenceId),
          alias: null,
        },
        "proposal",
      );
      const revise = {
        projectId: f.projectId,
        memoryId: proposal.record.id,
        expectedVersion: 1,
        content: {
          ...f.content(evidenceId),
          statement: "Revised exact wording",
        },
      };
      const revised = await Promise.allSettled([
        f.machine.reviseMemory(f.issued.token, revise, "revision-a"),
        f.machine.reviseMemory(f.issued.token, revise, "revision-b"),
      ]);
      assert.equal(revised.filter((r) => r.status === "fulfilled").length, 1);
      const failure = revised.find((r) => r.status === "rejected");
      assert.ok(
        failure?.status === "rejected" &&
          denied("VERSION_CONFLICT")(failure.reason),
      );
      const winnerKey =
        revised[0]!.status === "fulfilled" ? "revision-a" : "revision-b";
      assert.equal(
        (await f.machine.reviseMemory(f.issued.token, revise, winnerKey))
          .replayed,
        true,
      );
      const versions = await f.runtime.db
        .select()
        .from(foundationMemoryRevision)
        .where(eq(foundationMemoryRevision.memoryId, proposal.record.id));
      assert.equal(versions.length, 2);
    } finally {
      await f.close();
    }
  },
);

test(
  "revocation waits on the grant lock, then prevents reads and retries on a separate connection",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    let release: (() => void) | undefined;
    try {
      let enter: (() => void) | undefined;
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const read = f.port.withClient(
        {
          tokenDigest: foundationTokenDigest(f.issued.token),
          operation: "foundation.read",
          projectId: f.projectId,
          environment: "test",
          correlationId: crypto.randomUUID(),
          targetId: null,
        },
        async () => {
          enter!();
          await barrier;
          return "allowed-before-revocation";
        },
      );
      await entered;
      let revoked = false;
      const revoke = f.owner
        .revokeClient({ clientId: f.issued.client.id })
        .then((r) => {
          revoked = true;
          return r;
        });
      let waiting = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const result = await f.admin.db.execute(
          sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%foundation_client%'`,
        );
        if (result.rows.length) {
          waiting = true;
          break;
        }
        await delay(20);
      }
      assert.equal(
        waiting,
        true,
        "observed PostgreSQL lock contention, not merely a pending JS promise",
      );
      assert.equal(revoked, false);
      release!();
      assert.equal(await read, "allowed-before-revocation");
      await revoke;
      await assert.rejects(
        f.machine.describe(f.issued.token, f.projectId),
        denied("REVOKED"),
      );
    } finally {
      release?.();
      await f.close();
    }
  },
);

test(
  "contradictions block approval, revised content resets authority and historical Knowledge versions remain exact",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const evidence = await f.machine.recordEvidence(
        f.issued.token,
        f.evidenceInput,
        "source",
      );
      const memory = await f.machine.proposeMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          knowledgeItemId: f.knowledgeId,
          content: f.content(evidence.record.id),
          alias: null,
        },
        "memory",
      );
      await f.owner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: memory.record.id,
          expectedVersion: 1,
          decision: "accepted",
          reason: "Accepted",
        },
        "accept",
      );
      const approvalInput = {
        projectId: f.projectId,
        memoryId: memory.record.id,
        expectedVersion: 1,
        contentDigest: memory.record.contentDigest,
        disclosureProjectId: f.projectId,
        expiresAt: expiresAt(),
      };
      const approved = await f.owner.approveInstruction(
        approvalInput,
        "approve",
      );
      const opposing = await f.machine.proposeMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          knowledgeItemId: f.knowledgeId,
          content: {
            ...f.content(evidence.record.id),
            category: "finding",
            statement: "Conflicting source finding",
            relatedMemoryIds: [memory.record.id],
            relationType: "contradicts",
          },
          alias: null,
        },
        "opposing",
      );
      await assert.rejects(
        f.owner.approveInstruction(approvalInput, "blocked-contradiction"),
        denied("FORBIDDEN"),
      );
      await f.owner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: opposing.record.id,
          expectedVersion: 1,
          decision: "rejected",
          reason: "Contradiction resolved by review",
        },
        "reject-opposing",
      );
      await f.owner.approveInstruction(approvalInput, "approve-resolved");
      const revised = await f.machine.reviseMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          memoryId: memory.record.id,
          expectedVersion: 1,
          content: {
            ...f.content(evidence.record.id),
            statement: "Different reviewed wording needs its own approval",
          },
        },
        "revise",
      );
      assert.equal(revised.record.lifecycle, "proposed");
      assert.equal(revised.record.verification, "unverified");
      const approvals = await f.runtime.db
        .select()
        .from(foundationInstructionApproval)
        .where(eq(foundationInstructionApproval.memoryId, memory.record.id));
      assert.equal(
        approvals.every((row) => row.version === 1),
        true,
      );
      assert.equal(
        approvals.some((row) => row.id === approved.record.id),
        true,
      );
      await assert.rejects(
        f.owner.approveInstruction(
          {
            ...approvalInput,
            expectedVersion: 2,
            contentDigest: revised.record.contentDigest,
          },
          "unreviewed-revision",
        ),
        denied("FORBIDDEN"),
      );
      const revisions = createKnowledgeRevisionRepository(f.admin.db);
      await revisions.revise(f.knowledgeId, {
        expectedVersion: 1,
        title: "Source v2",
        content: "Exact historical version two",
      });
      await revisions.revise(f.knowledgeId, {
        expectedVersion: 2,
        title: "Source v3",
        content: "Current version three",
      });
      const historical = await f.machine.recordEvidence(
        f.issued.token,
        {
          ...f.evidenceInput,
          sourceVersion: "2",
          contentDigest: foundationByteDigest("Exact historical version two"),
        },
        "historical-two",
      );
      assert.equal(
        historical.record.contentDigest,
        foundationByteDigest("Exact historical version two"),
      );
      await assert.rejects(
        f.machine.recordEvidence(
          f.issued.token,
          {
            ...f.evidenceInput,
            sourceVersion: "2",
            contentDigest: foundationByteDigest("Current version three"),
          },
          "wrong-historical",
        ),
        denied("INVALID_REFERENCE"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "client pagination reaches the complete project population and cache integrity rejects an incorrect stored receipt",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const expected = new Set([f.issued.client.id]);
      for (let index = 0; index < 6; index++) {
        const issued = await f.owner.createClient(
          {
            name: `Page client ${index}`,
            projectId: f.projectId,
            environment: "test",
            operations: ["foundation.read"],
            ttlSeconds: 3600,
          },
          `page-client-${index}`,
        );
        expected.add(issued.client.id);
      }
      const foreign = await f.owner.createClient(
        {
          name: "Other project",
          projectId: f.otherId,
          environment: "test",
          operations: ["foundation.read"],
          ttlSeconds: 3600,
        },
        "foreign-client",
      );
      const seen = new Set<string>();
      let after: string | undefined;
      let asOf: string | undefined;
      while (true) {
        const page = await f.owner.listClients({
          projectId: f.projectId,
          limit: 2,
          ...(after ? { after } : {}),
          ...(asOf ? { asOf } : {}),
        });
        asOf ??= page.asOf;
        assert.equal(page.asOf, asOf);
        for (const row of page.items) {
          assert.equal(seen.has(row.id), false);
          seen.add(row.id);
        }
        if (!page.nextCursor) break;
        after = page.nextCursor;
      }
      assert.deepEqual(seen, expected);
      assert.equal(seen.has(foreign.client.id), false);
      const key = "corrupt-receipt";
      await f.runtime.db.insert(foundationIdempotency).values({
        projectId: f.projectId,
        environment: "test",
        principalId: `foundation-client:${f.issued.client.id}`,
        operation: "evidence.record",
        keyDigest: foundationByteDigest(key),
        requestDigest: foundationDigest({
          operation: "evidence.record",
          projectId: f.projectId,
          environment: "test",
          input: f.evidenceInput,
        }),
        result: { incorrect: "receipt" },
        resultDigest: "0".repeat(64),
        correlationId: crypto.randomUUID(),
      });
      await assert.rejects(
        f.machine.recordEvidence(f.issued.token, f.evidenceInput, key),
        denied("INVALID_REFERENCE"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "an owner session that expires while waiting for the project lock cannot write after acquiring it",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    let release: (() => void) | undefined;
    try {
      let entered: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocker = f.port.withOwner(
        {
          operation: "memory.review",
          projectId: f.projectId,
          environment: "test",
          principalId: "user:blocker",
          expiresAt: expiresAt(),
          correlationId: crypto.randomUUID(),
          targetId: null,
        },
        async () => {
          entered!();
          await barrier;
        },
      );
      await started;
      const initial = Date.now();
      let clock = initial;
      const clockNow = () => new Date(clock);
      const waitingOwner = createFoundationOwnerService(
        createFoundationAccessRepository(f.runtime.db, { now: clockNow }),
        {
          principalId: "user:expiring-owner",
          expiresAt: new Date(initial + 1000).toISOString(),
        },
        { environment: "test", now: clockNow },
      );
      const attempted = waitingOwner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: crypto.randomUUID(),
          expectedVersion: 1,
          decision: "accepted",
          reason: "Must expire before entering the records port",
        },
        "expiring",
      );
      // Attach rejection handling immediately while proving the database lock wait.
      const rejection = assert.rejects(attempted, denied("EXPIRED"));
      let waiting = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const result = await f.admin.db.execute(
          sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and wait_event = 'advisory'`,
        );
        if (result.rows.length) {
          waiting = true;
          break;
        }
        await delay(20);
      }
      assert.equal(waiting, true);
      clock = initial + 2000;
      release!();
      await blocker;
      await rejection;
      assert.equal(
        (
          await f.runtime.db
            .select()
            .from(foundationMemoryReview)
            .where(eq(foundationMemoryReview.projectId, f.projectId))
        ).length,
        0,
      );
      const [audit] = await f.runtime.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.principalId, "user:expiring-owner"),
          ),
        );
      assert.equal(audit!.decision, "denied");
      assert.equal(audit!.code, "EXPIRED");
    } finally {
      release?.();
      await f.close();
    }
  },
);

test(
  "intrinsic credential authentication supports write-only clients without product read access and commits safe audits",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const issued = await f.owner.createClient(
        {
          name: "Write-only identity",
          projectId: f.projectId,
          environment: "test",
          ttlSeconds: 3600,
          operations: ["evidence.record"],
        },
        "write-only-auth",
      );
      const auth = createFoundationAuthenticationService(
        createFoundationAuthenticationRepository(f.runtime.db),
        { environment: "test" },
      );
      const actor = await auth.authenticate(
        issued.token,
        f.projectId.toUpperCase(),
      );
      assert.equal(actor.clientId, issued.client.id);
      assert.deepEqual(actor.capabilities, ["evidence.record"]);
      await assert.rejects(
        f.machine.describe(issued.token, f.projectId),
        denied("FORBIDDEN"),
      );
      const evidence = await f.machine.recordEvidence(
        issued.token,
        f.evidenceInput,
        "write-after-intrinsic-auth",
      );
      assert.equal(evidence.record.projectId, f.projectId);
      await assert.rejects(
        auth.authenticate(issued.token, f.otherId),
        denied("FORBIDDEN"),
      );
      await f.owner.revokeClient({ clientId: issued.client.id });
      await assert.rejects(
        auth.authenticate(issued.token, f.projectId),
        denied("REVOKED"),
      );
      const audits = await f.runtime.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.clientId, issued.client.id),
            eq(foundationAudit.operation, "foundation.client.authenticated"),
          ),
        );
      assert.deepEqual(audits.map((row) => row.decision).sort(), [
        "allowed",
        "denied",
        "denied",
      ]);
      assert.equal(JSON.stringify(audits).includes(issued.token), false);
      assert.equal(
        JSON.stringify(audits).includes(foundationTokenDigest(issued.token)),
        false,
      );
    } finally {
      await f.close();
    }
  },
);
