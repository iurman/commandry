import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import {
  createFoundationMachineService,
  createFoundationOwnerService,
  createMnemosyneSelectedImportService,
  fingerprintMnemosyneSelection,
  type FoundationImportExpectedMemory,
  type FoundationImportOriginalSource,
  type FoundationOwnerRequest,
  type FoundationSelectedImportPort,
  type MnemosyneImportEnvelope,
} from "@commandry/application";
import { FoundationError, foundationDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationSelectedImportRepository } from "./foundation-import-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import {
  capture,
  knowledgeItem,
  knowledgeItemRevision,
  project,
} from "./schema";
import {
  foundationAudit,
  foundationEvidence,
  foundationIdempotency,
  foundationMemory,
  foundationMemoryEvidence,
  foundationMemoryRevision,
} from "./foundation-schema";
import {
  foundationImportOriginalSource,
  foundationImportRevision,
} from "./foundation-import-schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL integration harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;
const constraint =
  (name: string) =>
  (error: unknown): boolean => {
    if (error === null || typeof error !== "object") return false;
    if (
      "constraint" in error &&
      typeof error.constraint === "string" &&
      error.constraint.includes(name)
    )
      return true;
    return "cause" in error && constraint(name)(error.cause);
  };

async function fixture(max = 1) {
  const admin = createDatabase({ connectionString: adminUrl!, max: 3 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max,
  });
  const projectId = randomUUID();
  const foreignProject = randomUUID();
  const knowledgeId = randomUUID();
  const captureId = randomUUID();
  const anchorText = "Synthetic canonical Knowledge anchor.";
  await admin.db.insert(project).values([
    { id: projectId, name: "Selected import persistence" },
    { id: foreignProject, name: "Outside selected import" },
  ]);
  await admin.db.insert(capture).values({
    id: captureId,
    projectId,
    inputType: "text",
    originalContent: anchorText,
  });
  await admin.db.insert(knowledgeItem).values({
    id: knowledgeId,
    projectId,
    sourceCaptureId: captureId,
    title: "Canonical selected anchor",
    content: anchorText,
  });
  let time = Date.now();
  const now = () => new Date(time);
  const identity = {
    principalId: "user:import-integration-owner",
    expiresAt: new Date(time + 3600000).toISOString(),
  };
  const access = createFoundationAccessRepository(runtime.db, { now });
  const port = createFoundationSelectedImportRepository(runtime.db, { now });
  const service = createMnemosyneSelectedImportService(port, identity, {
    environment: "test",
    now,
  });
  const owner = createFoundationOwnerService(access, identity, {
    environment: "test",
    now,
  });
  const machine = createFoundationMachineService(access, {
    environment: "test",
    now,
  });
  const grant = await owner.createClient(
    {
      name: "Import canonical reader",
      projectId,
      environment: "test",
      operations: ["foundation.read", "memory.revise"],
      ttlSeconds: 3600,
    },
    "client",
  );
  const originals = [
    "",
    "PRIVATE_IMPORT_BYTES\r\n  exact whitespace \r\n",
    "Unicode snowman \u2603 and \ud83d\ude42",
    "zero\u0000byte",
    "\ufeffinitial BOM",
  ];
  function envelope(
    count = 17,
    externalId = "selected",
  ): MnemosyneImportEnvelope {
    return {
      schemaVersion: 1,
      projectId,
      namespace: "synthetic-selected-import",
      records: [
        {
          externalId,
          knowledgeItemId: knowledgeId,
          statement: "Proposed synthetic assertion, never automatic approval.",
          category: "instruction",
          sourceTier: "private",
          selected: true,
          sources: Array.from({ length: count }, (_, ordinal) => {
            const originalContent =
              ordinal === 0
                ? anchorText
                : originals[(ordinal - 1) % originals.length]!;
            return {
              originalContent,
              evidence: {
                projectId,
                sourceKind: ordinal === 0 ? "knowledge_revision" : "external",
                sourceId:
                  ordinal === 0 ? knowledgeId : "synthetic-source-" + ordinal,
                sourceVersion: ordinal === 0 ? "1" : null,
                contentDigest: foundationByteDigest(originalContent),
                locator:
                  ordinal === 0
                    ? "commandry:knowledge/" + knowledgeId + "/versions/1"
                    : "synthetic://source/" + ordinal,
                observedAt: "2026-10-16T01:02:03.123456789+01:00",
                availability: "available",
              },
            };
          }),
        },
      ],
    };
  }
  const reviewed = (
    e: MnemosyneImportEnvelope,
    expectedExistingMemory: FoundationImportExpectedMemory | null = null,
  ) => ({
    envelope: e,
    decision: "apply_proposed_unverified" as const,
    reviewedSelections: e.records
      .filter((row) => row.selected)
      .map((row) => ({
        externalId: row.externalId,
        selectionFingerprint: fingerprintMnemosyneSelection(e, row.externalId),
        expectedExistingMemory,
      })),
  });
  const request = (
    operation: FoundationOwnerRequest["operation"] = "memory.import",
    environment: FoundationOwnerRequest["environment"] = "test",
  ): FoundationOwnerRequest => ({
    ...identity,
    operation,
    projectId,
    environment,
    correlationId: randomUUID(),
    targetId: null,
  });
  const head = (id: string) =>
    machine.getMemory(grant.token, { projectId, id });
  const expected = (
    memory: Awaited<ReturnType<typeof head>>["memory"],
  ): FoundationImportExpectedMemory => ({
    id: memory.id,
    version: memory.version,
    contentDigest: memory.contentDigest,
    knowledgeItemId: memory.knowledgeItemId,
  });
  const counts = async () => {
    const result = await admin.pool.query<{
      revisions: number;
      originals: number;
      evidence: number;
      memories: number;
      versions: number;
      receipts: number;
    }>(
      "select (select count(*)::int from public.foundation_import_revision where project_id=$1) revisions, (select count(*)::int from public.foundation_import_original_source where project_id=$1) originals, (select count(*)::int from public.foundation_evidence where project_id=$1) evidence, (select count(*)::int from public.foundation_memory where project_id=$1) memories, (select count(*)::int from public.foundation_memory_revision where project_id=$1) versions, (select count(*)::int from public.foundation_idempotency where project_id=$1 and operation='memory.import') receipts",
      [projectId],
    );
    return result.rows[0]!;
  };
  return {
    admin,
    runtime,
    projectId,
    foreignProject,
    knowledgeId,
    captureId,
    anchorText,
    now,
    identity,
    access,
    port,
    service,
    owner,
    machine,
    grant,
    envelope,
    reviewed,
    request,
    head,
    expected,
    counts,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    close: async () => {
      await runtime.close();
      await admin.close();
    },
  };
}

async function traverse(
  f: Awaited<ReturnType<typeof fixture>>,
  revisionId: string,
  limit: number,
) {
  const all: FoundationImportOriginalSource[] = [];
  let fromOrdinal = 0;
  for (;;) {
    const page = await f.service.listOriginalSources({
      projectId: f.projectId,
      revisionId,
      fromOrdinal,
      limit,
    });
    all.push(...page.items);
    if (page.nextOrdinal === null) return all;
    assert.equal(page.nextOrdinal, fromOrdinal + page.items.length);
    fromOrdinal = page.nextOrdinal;
  }
}

test(
  "selected import persists 17 exact ordered originals and metadata with pool max one",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope();
      const before = await f.counts();
      await f.service.preview(e);
      assert.deepEqual(await f.counts(), before);
      const result = await f.service.apply(f.reviewed(e), "apply");
      const summary = result.record.records[0]!;
      const originals = await traverse(f, summary.importRevisionId, 4);
      assert.deepEqual(
        originals.map((source) => source.ordinal),
        Array.from({ length: 17 }, (_, ordinal) => ordinal),
      );
      assert.deepEqual(
        originals.map((source) => source.originalContent),
        e.records[0]!.sources.map((source) => source.originalContent),
      );
      const { memory } = await f.head(summary.memoryId);
      assert.equal(memory.lifecycle, "proposed");
      assert.equal(memory.verification, "unverified");
      assert.deepEqual(
        memory.content.evidenceIds,
        originals.map((source) => source.evidenceId),
      );
      const metadata = await f.service.getRevision({
        projectId: f.projectId,
        id: summary.importRevisionId,
      });
      assert.equal(metadata.memoryContentDigest, memory.contentDigest);
      assert.equal(metadata.reviewedBy, f.identity.principalId);
      assert.equal(metadata.environment, "test");
      assert.equal(metadata.correlationId, result.correlationId);
      assert.equal("originalContent" in metadata, false);
      const [source] = await f.admin.db
        .select()
        .from(foundationEvidence)
        .where(eq(foundationEvidence.id, originals[0]!.evidenceId));
      assert.equal(
        source!.observedAt,
        e.records[0]!.sources[0]!.evidence.observedAt,
      );
      assert.deepEqual(await f.counts(), {
        revisions: 1,
        originals: 17,
        evidence: 17,
        memories: 1,
        versions: 1,
        receipts: 1,
      });
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.projectId, f.projectId));
      const receipts = await f.admin.db
        .select()
        .from(foundationIdempotency)
        .where(eq(foundationIdempotency.projectId, f.projectId));
      for (const text of [JSON.stringify(audits), JSON.stringify(receipts)]) {
        assert.equal(text.includes("PRIVATE_IMPORT_BYTES"), false);
        assert.equal(text.includes(e.records[0]!.statement), false);
        assert.equal(text.includes("originalContent"), false);
      }
      const machineAccess = f.access as unknown as Record<string, unknown>;
      assert.equal(machineAccess.listImportOriginalSources, undefined);
    } finally {
      await f.close();
    }
  },
);

test(
  "all 1000 sources remain reachable with lossless empty CRLF Unicode NUL and BOM bytes",
  { timeout: 120000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope(1000);
      const result = await f.service.apply(f.reviewed(e), "thousand");
      const revisionId = result.record.records[0]!.importRevisionId;
      const all = await traverse(f, revisionId, 137);
      assert.equal(all.length, 1000);
      assert.deepEqual(
        all.map((row) => row.originalContent),
        e.records[0]!.sources.map((source) => source.originalContent),
      );
      assert.equal(new Set(all.map((row) => row.evidenceId)).size, 1000);
      assert.deepEqual(
        await f.service.listOriginalSources({
          projectId: f.projectId,
          revisionId,
          fromOrdinal: 1000,
          limit: 1,
        }),
        { items: [], nextOrdinal: null },
      );
      assert.equal((await f.counts()).originals, 1000);
    } finally {
      await f.close();
    }
  },
);

test(
  "exact retry returns historical receipt after owner edits; fresh-key noop preserves review",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope(3);
      const input = f.reviewed(e);
      const first = await f.service.apply(input, "same");
      const summary = first.record.records[0]!;
      const current = (await f.head(summary.memoryId)).memory;
      await f.owner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: current.id,
          expectedVersion: 1,
          decision: "accepted",
          reason: "Synthetic owner review",
        },
        "review",
      );
      const before = await f.counts();
      const unchanged = await f.service.apply(
        f.reviewed(e, f.expected(current)),
        "noop",
      );
      assert.equal(unchanged.record.records[0]!.action, "unchanged");
      assert.equal(
        unchanged.record.records[0]!.importRevisionId,
        summary.importRevisionId,
      );
      assert.equal((await f.head(current.id)).memory.lifecycle, "accepted");
      const after = await f.counts();
      assert.deepEqual(after, { ...before, receipts: before.receipts + 1 });
      const revision = await f.machine.reviseMemory(
        f.grant.token,
        {
          projectId: f.projectId,
          memoryId: current.id,
          expectedVersion: 1,
          content: {
            ...current.content,
            statement: "Owner corrected assertion.",
          },
        },
        "owner-correction",
      );
      assert.equal(revision.record.version, 2);
      const replay = await f.service.apply(input, "same");
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.record, first.record);
      assert.equal(replay.correlationId, first.correlationId);
      const changed = structuredClone(e);
      changed.records[0]!.statement = "Different input.";
      await assert.rejects(
        f.service.apply(f.reviewed(changed), "same"),
        denied("IDEMPOTENCY_CONFLICT"),
      );
      await assert.rejects(
        f.service.apply(f.reviewed(e, f.expected(revision.record)), "preserve"),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), { ...after, versions: 2 });
    } finally {
      await f.close();
    }
  },
);

test(
  "changed source creates version N+1 and resets approval while stale reviewed versions reject",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope(3);
      const first = await f.service.apply(f.reviewed(e), "first");
      const previous = (await f.head(first.record.records[0]!.memoryId)).memory;
      await f.owner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: previous.id,
          expectedVersion: 1,
          decision: "accepted",
          reason: "Synthetic review",
        },
        "review",
      );
      await f.owner.verifyMemory(
        {
          projectId: f.projectId,
          memoryId: previous.id,
          expectedVersion: 1,
          verification: "source_matched",
          evidenceIds: previous.content.evidenceIds,
          reason: "Synthetic evidence",
        },
        "verify",
      );
      await f.owner.approveInstruction(
        {
          projectId: f.projectId,
          memoryId: previous.id,
          expectedVersion: 1,
          contentDigest: previous.contentDigest,
          disclosureProjectId: f.projectId,
          expiresAt: new Date(f.now().getTime() + 600000).toISOString(),
        },
        "approve",
      );
      const changed = structuredClone(e);
      const source = changed.records[0]!.sources[1]!;
      source.originalContent = "Changed external original.";
      source.evidence.contentDigest = foundationByteDigest(
        source.originalContent,
      );
      const revised = await f.service.apply(
        f.reviewed(changed, f.expected(previous)),
        "changed",
      );
      const summary = revised.record.records[0]!;
      assert.equal(summary.action, "revised");
      assert.equal(summary.memoryId, previous.id);
      assert.equal(summary.version, 2);
      const current = (await f.head(previous.id)).memory;
      assert.equal(current.lifecycle, "proposed");
      assert.equal(current.verification, "unverified");
      assert.equal(
        (
          await f.service.getRevision({
            projectId: f.projectId,
            id: first.record.records[0]!.importRevisionId,
          })
        ).memoryVersion,
        1,
      );
      await assert.rejects(
        f.service.apply(f.reviewed(changed, f.expected(previous)), "stale"),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), {
        revisions: 2,
        originals: 6,
        evidence: 6,
        memories: 1,
        versions: 2,
        receipts: 2,
      });
    } finally {
      await f.close();
    }
  },
);

test(
  "same key races replay once and same alias races preserve one canonical memory",
  { timeout: 30000 },
  async () => {
    const f = await fixture(5);
    try {
      const input = f.reviewed(f.envelope(3));
      const [a, b] = await Promise.all([
        f.service.apply(input, "race"),
        f.service.apply(input, "race"),
      ]);
      assert.equal(Number(a.replayed) + Number(b.replayed), 1);
      assert.deepEqual(a.record, b.record);
      const next = f.reviewed(f.envelope(3, "second"));
      const results = await Promise.allSettled([
        f.service.apply(next, "alias-a"),
        f.service.apply(next, "alias-b"),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const rejected = results.find((result) => result.status === "rejected");
      assert.ok(
        rejected?.status === "rejected" &&
          denied("INVALID_REFERENCE")(rejected.reason),
      );
      assert.deepEqual(await f.counts(), {
        revisions: 2,
        originals: 6,
        evidence: 6,
        memories: 2,
        versions: 2,
        receipts: 2,
      });
    } finally {
      await f.close();
    }
  },
);

test(
  "late canonical source failure rolls back every selected record and receipt",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope(3);
      e.records.push({
        ...structuredClone(e.records[0]!),
        externalId: "late",
        knowledgeItemId: randomUUID(),
      });
      const before = await f.counts();
      await assert.rejects(
        f.service.apply(f.reviewed(e), "late"),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), before);
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.operation, "memory.import"),
          ),
        );
      assert.deepEqual(
        audits.map((row) => row.decision),
        ["denied"],
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "owner-only reads hide wrong projects and environments and reject foreign references",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope(3);
      const result = await f.service.apply(f.reviewed(e), "scope");
      const id = result.record.records[0]!.importRevisionId;
      await assert.rejects(
        f.service.getRevision({ projectId: f.foreignProject, id }),
        denied("NOT_FOUND"),
      );
      await assert.rejects(
        f.service.listOriginalSources({
          projectId: f.foreignProject,
          revisionId: id,
        }),
        denied("NOT_FOUND"),
      );
      const local = createMnemosyneSelectedImportService(f.port, f.identity, {
        environment: "local",
        now: f.now,
      });
      await assert.rejects(
        local.getRevision({ projectId: f.projectId, id }),
        denied("NOT_FOUND"),
      );
      assert.equal(
        (await local.preview(e)).records[0]!.reason,
        "baseline_unavailable",
      );
      await assert.rejects(
        f.port.withOwner(f.request("memory.review"), async () => null),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.port.withOwner(f.request("foundation.read"), async (records) =>
          records.getImportRevision({ projectId: f.foreignProject, id }),
        ),
        denied("INVALID_REFERENCE"),
      );
      const wrong = f.envelope(3, "wrong-source");
      wrong.records[0]!.sources[0]!.evidence.sourceId = randomUUID();
      await assert.rejects(
        f.service.apply(f.reviewed(wrong), "wrong-source"),
        denied("INVALID_REFERENCE"),
      );
      assert.equal((await f.counts()).revisions, 1);
    } finally {
      await f.close();
    }
  },
);

test(
  "historical originals resolve the exact retained Knowledge revision instead of current text",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      await f.admin.db.insert(knowledgeItemRevision).values({
        id: randomUUID(),
        knowledgeItemId: f.knowledgeId,
        version: 2,
        previousTitle: "Canonical selected anchor",
        previousContent: f.anchorText,
        title: "Updated source",
        content: "Current different text",
        actor: "local-user:unattributed",
      });
      await f.admin.db
        .update(knowledgeItem)
        .set({
          title: "Updated source",
          content: "Current different text",
          version: 2,
        })
        .where(eq(knowledgeItem.id, f.knowledgeId));
      const e = f.envelope(3);
      const applied = await f.service.apply(f.reviewed(e), "historical");
      const originals = await traverse(
        f,
        applied.record.records[0]!.importRevisionId,
        3,
      );
      assert.equal(originals[0]!.originalContent, f.anchorText);
      const missing = f.envelope(3, "missing-history");
      missing.records[0]!.sources[0]!.evidence.sourceVersion = "3";
      await assert.rejects(
        f.service.apply(f.reviewed(missing), "missing"),
        denied("INVALID_REFERENCE"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "late import insert and expired callback roll back canonical writes, baselines, originals and receipts",
  { timeout: 30000 },
  async () => {
    for (const scenario of ["late-insert", "callback-expiry"] as const) {
      const f = await fixture();
      try {
        const port: FoundationSelectedImportPort = {
          withOwner(request, action) {
            return f.port.withOwner(request, async (records) => {
              const wrapped =
                scenario === "late-insert"
                  ? {
                      ...records,
                      async insertImportRevision(
                        input: Parameters<
                          typeof records.insertImportRevision
                        >[0],
                      ) {
                        await records.insertImportRevision(input);
                        throw new FoundationError(
                          "INVALID_REFERENCE",
                          "Synthetic late insert failure",
                        );
                      },
                    }
                  : records;
              const result = await action(wrapped);
              if (scenario === "callback-expiry") f.advance(3600001);
              return result;
            });
          },
        };
        const service = createMnemosyneSelectedImportService(port, f.identity, {
          environment: "test",
          now: f.now,
        });
        await assert.rejects(
          service.apply(f.reviewed(f.envelope(3)), scenario),
          denied(
            scenario === "callback-expiry" ? "EXPIRED" : "INVALID_REFERENCE",
          ),
        );
        assert.deepEqual(await f.counts(), {
          revisions: 0,
          originals: 0,
          evidence: 0,
          memories: 0,
          versions: 0,
          receipts: 0,
        });
        const audits = await f.admin.db
          .select()
          .from(foundationAudit)
          .where(
            and(
              eq(foundationAudit.projectId, f.projectId),
              eq(foundationAudit.operation, "memory.import"),
            ),
          );
        assert.deepEqual(
          audits.map((row) => row.decision),
          ["denied"],
        );
      } finally {
        await f.close();
      }
    }
  },
);

test(
  "a real failed audit atomically rolls back the complete selected import",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const name = "commandry_import_audit_" + f.projectId.replaceAll("-", "");
    try {
      await f.admin.db.execute(
        sql.raw(
          `create function public.${name}() returns trigger language plpgsql as $$ begin if NEW.project_id = '${f.projectId}'::uuid and NEW.operation = 'memory.import' then raise exception 'Synthetic import audit failure'; end if; return NEW; end $$`,
        ),
      );
      await f.admin.db.execute(
        sql.raw(
          `create trigger ${name} before insert on public.foundation_audit for each row execute function public.${name}()`,
        ),
      );
      await assert.rejects(
        f.service.apply(f.reviewed(f.envelope(3)), "audit-failure"),
      );
      assert.deepEqual(await f.counts(), {
        revisions: 0,
        originals: 0,
        evidence: 0,
        memories: 0,
        versions: 0,
        receipts: 0,
      });
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.operation, "memory.import"),
          ),
        );
      assert.equal(audits.length, 0);
    } finally {
      await f.admin.db.execute(
        sql.raw(`drop trigger if exists ${name} on public.foundation_audit`),
      );
      await f.admin.db.execute(
        sql.raw(`drop function if exists public.${name}()`),
      );
      await f.close();
    }
  },
);

test(
  "expiry during a real audit lock wait aborts import before savepoint release",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const name = "commandry_import_wait_" + f.projectId.replaceAll("-", "");
    const lock = 600000000 + Math.floor(Math.random() * 1000000000);
    let unlock: (() => void) | undefined;
    let blocking: Promise<void> | undefined;
    try {
      await f.admin.db.execute(
        sql.raw(
          `create function public.${name}() returns trigger language plpgsql as $$ begin if NEW.project_id = '${f.projectId}'::uuid and NEW.operation = 'memory.import' and NEW.decision = 'allowed' then perform pg_advisory_xact_lock(${lock}); end if; return NEW; end $$`,
        ),
      );
      await f.admin.db.execute(
        sql.raw(
          `create trigger ${name} before insert on public.foundation_audit for each row execute function public.${name}()`,
        ),
      );
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${lock})`);
        ready();
        await held;
      });
      await entered;
      const rejected = assert.rejects(
        f.service.apply(f.reviewed(f.envelope(3)), "audit-expiry"),
        denied("EXPIRED"),
      );
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await f.admin.pool.query(
          "select 1 from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
          [lock],
        );
        if (result.rows.length) {
          waiting = true;
          break;
        }
        await delay(10);
      }
      assert.equal(waiting, true);
      f.advance(3600001);
      unlock!();
      await blocking;
      blocking = undefined;
      await rejected;
      assert.deepEqual(await f.counts(), {
        revisions: 0,
        originals: 0,
        evidence: 0,
        memories: 0,
        versions: 0,
        receipts: 0,
      });
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, f.projectId),
            eq(foundationAudit.operation, "memory.import"),
          ),
        );
      assert.deepEqual(
        audits.map((row) => [row.decision, row.code]),
        [["denied", "EXPIRED"]],
      );
    } finally {
      unlock?.();
      await blocking;
      await f.admin.db.execute(
        sql.raw(`drop trigger if exists ${name} on public.foundation_audit`),
      );
      await f.admin.db.execute(
        sql.raw(`drop function if exists public.${name}()`),
      );
      await f.close();
    }
  },
);

test(
  "owner correction racing the import project lock preserves the corrected canonical head",
  { timeout: 30000 },
  async () => {
    const f = await fixture(5);
    let release: (() => void) | undefined;
    let correction: Promise<unknown> | undefined;
    try {
      const e = f.envelope(3);
      const first = await f.service.apply(f.reviewed(e), "initial");
      const current = (await f.head(first.record.records[0]!.memoryId)).memory;
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      correction = f.access.withOwner(
        f.request("memory.revise"),
        async (records) => {
          const head = await records.getMemory(current.id, true);
          assert.ok(head);
          const content = {
            ...head.content,
            statement: "Concurrent owner correction.",
          };
          const anchor = await records.resolveMemoryAnchor(
            head.knowledgeItemId,
            content.evidenceIds,
          );
          await records.saveMemory(
            {
              ...head,
              content,
              contentDigest: foundationDigest(content),
              version: head.version + 1,
              lifecycle: "proposed",
              verification: "unverified",
              recordedBy: f.identity.principalId,
              recordedAt: f.now().toISOString(),
            },
            head.version,
            null,
            anchor,
          );
          ready();
          await held;
        },
      );
      await entered;
      const changed = structuredClone(e);
      changed.records[0]!.statement =
        "Import candidate prepared before owner correction.";
      const rejected = assert.rejects(
        f.service.apply(f.reviewed(changed, f.expected(current)), "racing"),
        denied("INVALID_REFERENCE"),
      );
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await f.admin.pool.query(
          "select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and wait_event='advisory'",
        );
        if (result.rows.length) {
          waiting = true;
          break;
        }
        await delay(10);
      }
      assert.equal(waiting, true);
      release!();
      await correction;
      correction = undefined;
      await rejected;
      const head = (await f.head(current.id)).memory;
      assert.equal(head.version, 2);
      assert.equal(head.content.statement, "Concurrent owner correction.");
      assert.deepEqual(await f.counts(), {
        revisions: 1,
        originals: 3,
        evidence: 3,
        memories: 1,
        versions: 2,
        receipts: 1,
      });
    } finally {
      release?.();
      await correction;
      await f.close();
    }
  },
);

test(
  "runtime cannot mutate, delete or append to immutable import membership",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const result = await f.service.apply(
        f.reviewed(f.envelope(3)),
        "immutable",
      );
      const revisionId = result.record.records[0]!.importRevisionId;
      const [revision] = await f.admin.db
        .select()
        .from(foundationImportRevision)
        .where(eq(foundationImportRevision.id, revisionId));
      const [original] = await f.admin.db
        .select()
        .from(foundationImportOriginalSource)
        .where(eq(foundationImportOriginalSource.revisionId, revisionId));
      assert.ok(revision && original);
      await assert.rejects(
        f.runtime.db
          .update(foundationImportRevision)
          .set({ sourceCount: 1 })
          .where(eq(foundationImportRevision.id, revisionId)),
        constraint("foundation_import_history_immutable"),
      );
      await assert.rejects(
        f.runtime.db
          .delete(foundationImportRevision)
          .where(eq(foundationImportRevision.id, revisionId)),
        constraint("foundation_import_history_immutable"),
      );
      await assert.rejects(
        f.runtime.db
          .update(foundationImportOriginalSource)
          .set({
            originalContent: "changed",
            contentDigest: foundationByteDigest("changed"),
          })
          .where(eq(foundationImportOriginalSource.revisionId, revisionId)),
        constraint("foundation_import_history_immutable"),
      );
      await assert.rejects(
        f.runtime.db
          .delete(foundationImportOriginalSource)
          .where(eq(foundationImportOriginalSource.revisionId, revisionId)),
        constraint("foundation_import_history_immutable"),
      );
      await assert.rejects(
        f.runtime.db
          .insert(foundationImportOriginalSource)
          .values({ ...original, ordinal: 3 }),
        constraint("foundation_import_membership_closed"),
      );
      assert.equal((await traverse(f, revisionId, 2)).length, 3);
      assert.equal(revision.record.sourceCount, 3);
    } finally {
      await f.close();
    }
  },
);

// These runtime SQL cases deliberately bypass application validation. The root
// migration must enforce creation ownership and closed, complete exact membership.
// No application fixture can substitute for running them against PostgreSQL.
test(
  "runtime SQL rejects incomplete, reordered, rebound, cross-scope and forged-transaction originals",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const result = await f.service.apply(
        f.reviewed(f.envelope(3)),
        "template",
      );
      const summary = result.record.records[0]!;
      const [template] = await f.admin.db
        .select()
        .from(foundationImportRevision)
        .where(eq(foundationImportRevision.id, summary.importRevisionId));
      const originals = await traverse(f, summary.importRevisionId, 3);
      assert.ok(template);
      // New canonical version permits a new baseline without violating the unique
      // memory-version key, while keeping an exact known evidence sequence.
      const current = (await f.head(summary.memoryId)).memory;
      const next = await f.machine.reviseMemory(
        f.grant.token,
        {
          projectId: f.projectId,
          memoryId: current.id,
          expectedVersion: current.version,
          content: {
            ...current.content,
            statement: "Canonical version for SQL guards.",
          },
        },
        "sql-version",
      );
      const record = {
        ...template.record,
        id: randomUUID(),
        memoryVersion: next.record.version,
        memoryContentDigest: next.record.contentDigest,
      };
      const parent = {
        ...template,
        id: record.id,
        memoryVersion: record.memoryVersion,
        record,
      };
      const children = originals.map((row) => ({
        ...row,
        revisionId: record.id,
      }));
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
        }),
        constraint("foundation_import_membership_complete"),
      );
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
          await tx
            .insert(foundationImportOriginalSource)
            .values(children.slice(0, 2));
        }),
        constraint("foundation_import_membership_complete"),
      );
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
          await tx.insert(foundationImportOriginalSource).values(
            children.map((row, ordinal) => ({
              ...row,
              ordinal: (ordinal + 1) % 3,
            })),
          );
        }),
        constraint("foundation_import_membership_closed"),
      );
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
          await tx
            .insert(foundationImportOriginalSource)
            .values({ ...children[0]!, evidenceId: children[1]!.evidenceId });
        }),
        constraint("foundation_import_membership_closed"),
      );
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
          await tx
            .insert(foundationImportOriginalSource)
            .values({ ...children[0]!, projectId: f.foreignProject });
        }),
        constraint("foundation_import_membership_closed"),
      );
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
          await tx.insert(foundationImportOriginalSource).values({
            ...children[0]!,
            originalContent: "different",
            contentDigest: foundationByteDigest("different"),
          });
        }),
        constraint("foundation_import_membership_closed"),
      );
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.insert(foundationImportRevision).values(parent);
          await tx
            .insert(foundationImportOriginalSource)
            .values({ ...children[0]!, originalContent: "digest mismatch" });
        }),
      );
      // Explicit caller values cannot forge an earlier creation transaction.
      await f.runtime.db.transaction(async (tx) => {
        const [stored] = await tx
          .insert(foundationImportRevision)
          .values({ ...parent, creationTransaction: "0" })
          .returning();
        assert.ok(stored);
        assert.notEqual(stored.creationTransaction, "0");
        const xid = await tx.execute(
          sql`select pg_current_xact_id()::text as xid`,
        );
        assert.equal(stored.creationTransaction, xid.rows[0]!.xid);
        await tx.insert(foundationImportOriginalSource).values(children);
        await tx.execute(sql`set constraints all immediate`);
        await assert.rejects(
          tx.transaction(async (nested) => {
            await nested
              .insert(foundationImportOriginalSource)
              .values({ ...children[0]!, ordinal: 3 });
          }),
          constraint("foundation_import_membership_closed"),
        );
      });
      assert.deepEqual(await f.counts(), {
        revisions: 2,
        originals: 6,
        evidence: 3,
        memories: 1,
        versions: 2,
        receipts: 1,
      });
    } finally {
      await f.close();
    }
  },
);

test(
  "temporary shadow tables cannot redirect runtime import guards",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const result = await f.service.apply(
        f.reviewed(f.envelope(3)),
        "shadow-template",
      );
      const summary = result.record.records[0]!;
      const all = await traverse(f, summary.importRevisionId, 3);
      await assert.rejects(
        f.runtime.db.transaction(async (tx) => {
          await tx.execute(
            sql`create temporary table foundation_import_revision (like public.foundation_import_revision including defaults) on commit drop`,
          );
          await tx.execute(
            sql`create temporary table foundation_memory_evidence (like public.foundation_memory_evidence including defaults) on commit drop`,
          );
          await tx.execute(
            sql`create temporary table foundation_evidence (like public.foundation_evidence including defaults) on commit drop`,
          );
          await tx.execute(sql`set local search_path = pg_temp, public`);
          await tx.execute(
            sql`insert into pg_temp.foundation_import_revision select * from public.foundation_import_revision where id=${summary.importRevisionId}`,
          );
          await tx.execute(
            sql`update pg_temp.foundation_import_revision set creation_transaction=pg_current_xact_id()::text, source_count=4 where id=${summary.importRevisionId}`,
          );
          // Explicit permanent insert forces the real guard despite a client search path.
          await tx.execute(
            sql`insert into public.foundation_import_original_source(revision_id,project_id,ordinal,evidence_id,content_digest,original_content) values (${summary.importRevisionId},${f.projectId},3,${all[0]!.evidenceId},${all[0]!.contentDigest},${Buffer.from(all[0]!.originalContent, "utf8")})`,
          );
        }),
        constraint("foundation_import_membership_closed"),
      );
      assert.equal((await f.counts()).originals, 3);
    } finally {
      await f.close();
    }
  },
);

test(
  "corrupt direct-SQL UTF8 fails owner retrieval safely without replacement characters",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const result = await f.service.apply(
        f.reviewed(f.envelope(3)),
        "utf8-corruption",
      );
      const revisionId = result.record.records[0]!.importRevisionId;
      // Admin-only corruption demonstrates the mapper fails closed even if immutable
      // storage was bypassed out of band. Runtime cannot disable these guards.
      await f.admin.pool.query(
        "alter table public.foundation_import_original_source disable trigger user",
      );
      try {
        await f.admin.pool.query(
          "update public.foundation_import_original_source set original_content=decode('ff','hex'), content_digest=encode(sha256(decode('ff','hex')),'hex') where revision_id=$1 and ordinal=1",
          [revisionId],
        );
      } finally {
        await f.admin.pool.query(
          "alter table public.foundation_import_original_source enable trigger user",
        );
      }
      await assert.rejects(
        f.service.listOriginalSources({ projectId: f.projectId, revisionId }),
        denied("INVALID_REFERENCE"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "a same-content owner version invalidates an old exact selection without replacing import history",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const e = f.envelope(3);
      const first = await f.service.apply(f.reviewed(e), "initial");
      const current = (await f.head(first.record.records[0]!.memoryId)).memory;
      const revised = await f.machine.reviseMemory(
        f.grant.token,
        {
          projectId: f.projectId,
          memoryId: current.id,
          expectedVersion: current.version,
          content: current.content,
        },
        "same-content-owner-version",
      );
      assert.equal(revised.record.contentDigest, current.contentDigest);
      assert.equal(revised.record.version, 2);
      const before = await f.counts();
      await assert.rejects(
        f.service.apply(f.reviewed(e, f.expected(current)), "old-review"),
        denied("INVALID_REFERENCE"),
      );
      assert.deepEqual(await f.counts(), before);
      const exactHead = await f.service.apply(
        f.reviewed(e, f.expected(revised.record)),
        "new-review",
      );
      assert.equal(exactHead.record.records[0]!.action, "unchanged");
      assert.equal(exactHead.record.records[0]!.version, 2);
      assert.equal(
        exactHead.record.records[0]!.importRevisionId,
        first.record.records[0]!.importRevisionId,
      );
      assert.equal(
        (
          await f.service.getRevision({
            projectId: f.projectId,
            id: first.record.records[0]!.importRevisionId,
          })
        ).memoryVersion,
        1,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "revoked trusted-session adapters prevent import and original disclosure before persistence",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      let revoked = false;
      const port: FoundationSelectedImportPort = {
        withOwner(request, callback) {
          if (revoked)
            return Promise.reject(
              new FoundationError(
                "REVOKED",
                "Synthetic trusted session revoked",
              ),
            );
          return f.port.withOwner(request, async (records) => {
            if (revoked)
              throw new FoundationError(
                "REVOKED",
                "Synthetic trusted session revoked",
              );
            return callback(records);
          });
        },
      };
      const service = createMnemosyneSelectedImportService(port, f.identity, {
        environment: "test",
        now: f.now,
      });
      const result = await service.apply(
        f.reviewed(f.envelope(3)),
        "before-revocation",
      );
      const revisionId = result.record.records[0]!.importRevisionId;
      const before = await f.counts();
      revoked = true;
      await assert.rejects(
        service.apply(f.reviewed(f.envelope(3, "blocked")), "after-revocation"),
        denied("REVOKED"),
      );
      await assert.rejects(
        service.getRevision({ projectId: f.projectId, id: revisionId }),
        denied("REVOKED"),
      );
      await assert.rejects(
        service.listOriginalSources({ projectId: f.projectId, revisionId }),
        denied("REVOKED"),
      );
      assert.deepEqual(await f.counts(), before);
    } finally {
      await f.close();
    }
  },
);

test(
  "an early immediate constraint check cannot reopen the imported canonical evidence sequence in its creation transaction",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const result = await f.service.apply(
        f.reviewed(f.envelope(3)),
        "canonical-closure",
      );
      const summary = result.record.records[0]!;
      const originals = await traverse(f, summary.importRevisionId, 3);
      const [importTemplate] = await f.admin.db
        .select()
        .from(foundationImportRevision)
        .where(eq(foundationImportRevision.id, summary.importRevisionId));
      const [memoryTemplate] = await f.admin.db
        .select()
        .from(foundationMemoryRevision)
        .where(
          and(
            eq(foundationMemoryRevision.memoryId, summary.memoryId),
            eq(foundationMemoryRevision.version, 1),
          ),
        );
      assert.ok(importTemplate && memoryTemplate);
      const extraId = randomUUID();
      await f.runtime.db.insert(foundationEvidence).values({
        id: extraId,
        projectId: f.projectId,
        sourceKind: "external",
        sourceId: "synthetic-extra-source",
        sourceVersion: null,
        contentDigest: foundationByteDigest("extra"),
        locator: "synthetic://extra",
        observedAt: null,
        availability: "available",
        ingestedAt: f.now(),
        recordedBy: f.identity.principalId,
        verification: "unverified",
        captureId: null,
        knowledgeItemId: null,
        knowledgeVersion: null,
      });
      await f.runtime.db.transaction(async (tx) => {
        await tx
          .update(foundationMemory)
          .set({
            currentVersion: 2,
            lifecycle: "proposed",
            verification: "unverified",
          })
          .where(eq(foundationMemory.id, summary.memoryId));
        await tx
          .insert(foundationMemoryRevision)
          .values({ ...memoryTemplate, version: 2 });
        await tx.insert(foundationMemoryEvidence).values(
          originals.map((row) => ({
            memoryId: summary.memoryId,
            projectId: f.projectId,
            version: 2,
            evidenceId: row.evidenceId,
            ordinal: row.ordinal,
          })),
        );
        const revisionId = randomUUID();
        await tx.insert(foundationImportRevision).values({
          ...importTemplate,
          id: revisionId,
          memoryVersion: 2,
          record: {
            ...importTemplate.record,
            id: revisionId,
            memoryVersion: 2,
          },
        });
        await tx
          .insert(foundationImportOriginalSource)
          .values(originals.map((row) => ({ ...row, revisionId })));
        await tx.execute(sql`set constraints all immediate`);
        await assert.rejects(
          tx.transaction(async (nested) => {
            await nested.insert(foundationMemoryEvidence).values({
              memoryId: summary.memoryId,
              projectId: f.projectId,
              version: 2,
              evidenceId: extraId,
              ordinal: 3,
            });
          }),
          constraint("foundation_import_memory_membership_closed"),
        );
        const canonical = await tx
          .select()
          .from(foundationMemoryEvidence)
          .where(
            and(
              eq(foundationMemoryEvidence.memoryId, summary.memoryId),
              eq(foundationMemoryEvidence.version, 2),
            ),
          );
        assert.equal(canonical.length, 3);
      });
      const head = (await f.head(summary.memoryId)).memory;
      assert.equal(head.version, 2);
      assert.equal(head.contentDigest, summary.contentDigest);
      assert.deepEqual(
        head.content.evidenceIds,
        originals.map((row) => row.evidenceId),
      );
      assert.deepEqual(await f.counts(), {
        revisions: 2,
        originals: 6,
        evidence: 4,
        memories: 1,
        versions: 2,
        receipts: 1,
      });
    } finally {
      await f.close();
    }
  },
);
