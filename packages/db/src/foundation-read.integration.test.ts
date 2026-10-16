import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import {
  createFoundationGeneralContextService,
  createFoundationInventoryService,
  createFoundationMachineService,
  createFoundationOwnerService,
} from "@commandry/application";
import { FoundationError, foundationTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationReadAccessRepository } from "./foundation-read-repository";
import { foundationByteDigest } from "./foundation-record-repository";
import { createKnowledgeRevisionRepository } from "./knowledge-revision-repository";
import { capture, knowledgeItem, project } from "./schema";
import {
  foundationAudit,
  foundationClient,
  foundationEvidence,
} from "./foundation-schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;

async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 3 });
  // A single connection proves candidate reads do not open a second pooled transaction.
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  const knowledgeId = crypto.randomUUID();
  const captureId = crypto.randomUUID();
  const original = "Selected synthetic project instruction source.";
  await admin.db.insert(project).values([
    { id: projectId, name: "Read integration" },
    { id: otherId, name: "Outside scope" },
  ]);
  await admin.db.insert(capture).values({
    id: captureId,
    inputType: "text",
    projectId,
    originalContent: original,
  });
  await admin.db.insert(knowledgeItem).values({
    id: knowledgeId,
    projectId,
    sourceCaptureId: captureId,
    kind: "instruction",
    title: "Selected source",
    content: original,
  });
  let time = Date.now();
  const now = () => new Date(time);
  const corePort = createFoundationAccessRepository(runtime.db, { now });
  const owner = createFoundationOwnerService(
    corePort,
    {
      principalId: "user:read-integration-owner",
      expiresAt: new Date(time + 7200000).toISOString(),
    },
    { environment: "test", now },
  );
  const issued = await owner.createClient(
    {
      name: "Scoped reads",
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
    "issue-read",
  );
  const core = createFoundationMachineService(corePort, {
    environment: "test",
    now,
  });
  const port = createFoundationReadAccessRepository(runtime.db, { now });
  const inventory = createFoundationInventoryService(port, {
    environment: "test",
    now,
  });
  const source = (
    await core.recordEvidence(
      issued.token,
      {
        projectId,
        sourceKind: "knowledge_revision",
        sourceId: knowledgeId,
        sourceVersion: "1",
        contentDigest: foundationByteDigest(original),
        locator: `commandry:knowledge/${knowledgeId}/versions/1`,
        observedAt: null,
        availability: "available",
      },
      "source",
    )
  ).record;
  const propose = async (
    key: string,
    evidenceIds = [source.id],
    statement = "Prefer selected local project tools.",
  ) =>
    (
      await core.proposeMemory(
        issued.token,
        {
          projectId,
          knowledgeItemId: knowledgeId,
          content: {
            statement,
            category: "instruction",
            evidenceIds,
            relatedMemoryIds: [],
            relationType: null,
          },
          alias: { namespace: "read-integration", externalId: key },
        },
        key,
      )
    ).record;
  const approve = async (
    memory: Awaited<ReturnType<typeof propose>>,
    ttl = 3600000,
  ) => {
    await owner.reviewMemory(
      {
        projectId,
        memoryId: memory.id,
        expectedVersion: memory.version,
        decision: "accepted",
        reason: "Reviewed synthetic instruction",
      },
      "review-" + memory.id,
    );
    await owner.verifyMemory(
      {
        projectId,
        memoryId: memory.id,
        expectedVersion: memory.version,
        verification: "source_matched",
        evidenceIds: [source.id],
        reason: "Exact canonical source",
      },
      "verify-" + memory.id,
    );
    return owner.approveInstruction(
      {
        projectId,
        memoryId: memory.id,
        expectedVersion: memory.version,
        contentDigest: memory.contentDigest,
        disclosureProjectId: projectId,
        expiresAt: new Date(time + ttl).toISOString(),
      },
      "approve-" + memory.id,
    );
  };
  const request = () => ({
    operation: "foundation.read" as const,
    projectId,
    environment: "test" as const,
    targetId: null,
    correlationId: crypto.randomUUID(),
    tokenDigest: foundationTokenDigest(issued.token),
  });
  const contextService = createFoundationGeneralContextService(port, {
    environment: "test",
    now,
  });
  const context = () =>
    contextService.get(issued.token, {
      projectId,
      limit: 100,
      maxCharacters: 30000,
      taskDirection: "Current request takes precedence.",
    });
  return {
    admin,
    runtime,
    projectId,
    otherId,
    knowledgeId,
    owner,
    core,
    issued,
    source,
    port,
    inventory,
    propose,
    approve,
    context,
    request,
    now,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    close: async () => {
      await runtime.close();
      await admin.close();
    },
  };
}

test(
  "real scoped inventories reach every eligible record and use first memory creation across revisions",
  { timeout: 60000 },
  async () => {
    const f = await fixture();
    try {
      const ids = new Set<string>();
      for (let index = 0; index < 105; index++) {
        ids.add((await f.propose("memory-" + index)).id);
        await f.core.recordConfiguration(
          f.issued.token,
          {
            projectId: f.projectId,
            kind: "skill",
            content: "Private configuration " + index,
            parentIds: [],
            sourceCommit: null,
          },
          "config-" + index,
        );
        if (index > 0)
          await f.core.recordEvidence(
            f.issued.token,
            {
              projectId: f.projectId,
              sourceKind: "external",
              sourceId: "synthetic-" + index,
              sourceVersion: null,
              contentDigest: foundationByteDigest("Synthetic " + index),
              locator: "fixture://" + index,
              observedAt: null,
              availability: "unavailable",
            },
            "evidence-" + index,
          );
      }
      await f.admin.db.insert(foundationEvidence).values({
        id: "00000000-0000-4000-8000-000000000001",
        projectId: f.otherId,
        sourceKind: "external",
        sourceId: "Private foreign source",
        sourceVersion: null,
        contentDigest: "a".repeat(64),
        locator: "fixture://foreign",
        observedAt: null,
        availability: "unavailable",
        ingestedAt: f.now(),
        recordedBy: "fixture",
        verification: "unverified",
      });
      for (const method of [
        "listEvidence",
        "listMemory",
        "listConfigurations",
      ] as const) {
        let after: string | undefined;
        let asOf: string | undefined;
        const seen = new Set<string>();
        do {
          const result = await f.inventory[method](f.issued.token, {
            projectId: f.projectId,
            limit: 37,
            ...(after ? { after, asOf } : {}),
          });
          asOf ??= result.asOf;
          assert.equal(result.asOf, asOf);
          assert.equal(
            result.items.every((row) => row.projectId === f.projectId),
            true,
          );
          if (method !== "listEvidence")
            assert.equal(
              JSON.stringify(result).includes("Private configuration"),
              false,
            );
          for (const row of result.items) {
            assert.equal(seen.has(row.id), false);
            seen.add(row.id);
          }
          after = result.nextCursor ?? undefined;
        } while (after);
        assert.equal(seen.size, 105);
        if (method === "listMemory") assert.deepEqual(seen, ids);
      }
      const memoryId = [...ids][0]!;
      const memory = (
        await f.core.getMemory(f.issued.token, {
          projectId: f.projectId,
          id: memoryId,
        })
      ).memory;
      const cutoff = f.now().toISOString();
      f.advance(20000);
      await f.core.reviseMemory(
        f.issued.token,
        {
          projectId: f.projectId,
          memoryId,
          expectedVersion: 1,
          content: { ...memory.content, statement: "Revised after cutoff" },
        },
        "later-revision",
      );
      let after: string | undefined;
      let found = false;
      do {
        const result = await f.inventory.listMemory(f.issued.token, {
          projectId: f.projectId,
          limit: 37,
          asOf: cutoff,
          ...(after ? { after } : {}),
        });
        const current = result.items.find((row) => row.id === memoryId);
        if (current) {
          found = true;
          assert.equal(current.version, 2);
          assert.ok(current.recordedAt > cutoff);
        }
        after = result.nextCursor ?? undefined;
      } while (after);
      assert.equal(found, true);
      await assert.rejects(
        f.inventory.listEvidence(f.issued.token, { projectId: f.otherId }),
        denied("FORBIDDEN"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "real candidate context preserves all provenance and excludes changed, unapproved, expired and contradicted instructions",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      const evidenceIds = [f.source.id];
      for (let i = 0; i < 13; i++)
        evidenceIds.push(
          (
            await f.core.recordEvidence(
              f.issued.token,
              {
                projectId: f.projectId,
                sourceKind: "external",
                sourceId: "Selected supporting evidence " + i,
                sourceVersion: null,
                contentDigest: foundationByteDigest("support" + i),
                locator: "fixture://support/" + i,
                observedAt: null,
                availability: "available",
              },
              "support-" + i,
            )
          ).record.id,
        );
      const memory = await f.propose("approved", evidenceIds);
      await f.approve(memory, 30000);
      const original = await f.context();
      assert.equal(original.instructions.length, 1);
      assert.equal(original.snapshot.sourceVersions.length, 14);
      assert.equal(original.instructions[0]!.memoryId, memory.id);
      await f.propose("unapproved");
      assert.equal((await f.context()).instructions.length, 1);
      f.advance(30000);
      assert.equal((await f.context()).instructions.length, 0);
      const fresh = await f.propose("fresh");
      await f.approve(fresh);
      assert.equal((await f.context()).instructions.length, 1);
      const contradiction = (
        await f.core.proposeMemory(
          f.issued.token,
          {
            projectId: f.projectId,
            knowledgeItemId: f.knowledgeId,
            content: {
              statement: "Unresolved contrary evidence needs review.",
              category: "finding",
              evidenceIds: [f.source.id],
              relatedMemoryIds: [fresh.id],
              relationType: "contradicts",
            },
            alias: { namespace: "read-integration", externalId: "contrary" },
          },
          "contrary",
        )
      ).record;
      assert.equal((await f.context()).instructions.length, 0);
      await f.owner.reviewMemory(
        {
          projectId: f.projectId,
          memoryId: contradiction.id,
          expectedVersion: 1,
          decision: "rejected",
          reason: "Synthetic contradiction resolved by review",
        },
        "reject-contrary",
      );
      assert.equal((await f.context()).instructions.length, 1);
      await createKnowledgeRevisionRepository(f.admin.db).revise(
        f.knowledgeId,
        {
          expectedVersion: 1,
          title: "Changed canonical source",
          content: "Changed source requires new evidence and review.",
        },
      );
      const stale = await f.context();
      assert.equal(stale.instructions.length, 0);
      assert.equal(
        stale.snapshot.omissions.some((row) => row.reason === "source_stale"),
        true,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "read denial and late audit failure cannot return successful context",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const correlationId = crypto.randomUUID();
    try {
      await assert.rejects(
        f.port.withClient(
          { ...f.request(), correlationId },
          async (_client, records) => {
            await records.listEvidence({
              projectId: f.projectId,
              limit: 1,
              asOf: f.now().toISOString(),
            });
            throw new FoundationError("INVALID_REFERENCE");
          },
        ),
        denied("INVALID_REFERENCE"),
      );
      const [audit] = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.correlationId, correlationId));
      assert.equal(audit!.decision, "denied");
      assert.equal(audit!.code, "INVALID_REFERENCE");
      await f.admin.db.execute(
        sql`create function commandry_test_read_audit_fail() returns trigger language plpgsql as $$ begin if NEW.operation = 'foundation.read' then raise exception 'Injected read audit failure'; end if; return NEW; end $$`,
      );
      try {
        await f.admin.db.execute(
          sql`create trigger commandry_test_read_audit_fail before insert on foundation_audit for each row execute function commandry_test_read_audit_fail()`,
        );
        const failedCorrelation = crypto.randomUUID();
        await assert.rejects(
          f.port.withClient(
            { ...f.request(), correlationId: failedCorrelation },
            async () => "must not return",
          ),
        );
        assert.equal(
          (
            await f.admin.db
              .select()
              .from(foundationAudit)
              .where(eq(foundationAudit.correlationId, failedCorrelation))
          ).length,
          0,
        );
      } finally {
        await f.admin.db.execute(
          sql`drop trigger if exists commandry_test_read_audit_fail on foundation_audit`,
        );
        await f.admin.db.execute(
          sql`drop function commandry_test_read_audit_fail()`,
        );
      }
    } finally {
      await f.close();
    }
  },
);

test(
  "approval expiry during a real audit lock wait rolls back the successful context audit",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    let unlock: (() => void) | undefined;
    let blocking: Promise<void> | undefined;
    try {
      const memory = await f.propose("audit-expiry");
      await f.approve(memory, 10000);
      await f.admin.db.execute(
        sql`create function commandry_test_read_expiry_wait() returns trigger language plpgsql as $$ begin if NEW.operation = 'foundation.read' then perform pg_advisory_xact_lock(542331); end if; return NEW; end $$`,
      );
      try {
        await f.admin.db.execute(
          sql`create trigger commandry_test_read_expiry_wait before insert on foundation_audit for each row execute function commandry_test_read_expiry_wait()`,
        );
        let ready!: () => void;
        const entered = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const held = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        blocking = f.admin.db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(542331)`);
          ready();
          await held;
        });
        await entered;
        const rejected = assert.rejects(f.context(), denied("EXPIRED"));
        let observedWait = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const result = await f.admin.db.execute(
            sql`select count(*)::int as count from pg_locks where locktype = 'advisory' and objid = 542331 and not granted`,
          );
          if (Number(result.rows[0]!.count) > 0) {
            observedWait = true;
            break;
          }
          await delay(10);
        }
        assert.equal(observedWait, true);
        f.advance(10000);
        unlock!();
        await blocking;
        await rejected;
        const audits = await f.admin.db
          .select()
          .from(foundationAudit)
          .where(
            and(
              eq(foundationAudit.clientId, f.issued.client.id),
              eq(foundationAudit.operation, "foundation.read"),
            ),
          );
        assert.equal(
          audits.some((row) => row.decision === "allowed"),
          false,
        );
        assert.equal(
          audits.some(
            (row) => row.code === "EXPIRED" && row.decision === "denied",
          ),
          true,
        );
      } finally {
        unlock?.();
        await blocking;
        await f.admin.db.execute(
          sql`drop trigger if exists commandry_test_read_expiry_wait on foundation_audit`,
        );
        await f.admin.db.execute(
          sql`drop function commandry_test_read_expiry_wait()`,
        );
      }
    } finally {
      await f.close();
    }
  },
);

test(
  "read transactions hold revocation lock through audit and reject expiry while waiting for project lock",
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    try {
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const reading = f.port.withClient(
        f.request(),
        async (_client, records) => {
          await records.listEvidence({
            projectId: f.projectId,
            limit: 1,
            asOf: f.now().toISOString(),
          });
          entered();
          await held;
          return "read";
        },
      );
      await started;
      let revoked = false;
      const revoking = f.admin.db
        .update(foundationClient)
        .set({ revokedAt: f.now() })
        .where(eq(foundationClient.id, f.issued.client.id))
        .then(() => {
          revoked = true;
        });
      await delay(40);
      assert.equal(revoked, false);
      release();
      assert.equal(await reading, "read");
      await revoking;
      await assert.rejects(
        f.inventory.listEvidence(f.issued.token, { projectId: f.projectId }),
        denied("REVOKED"),
      );
      const rows = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.clientId, f.issued.client.id),
            eq(foundationAudit.operation, "foundation.read"),
          ),
        );
      assert.equal(
        rows.some((row) => row.decision === "allowed"),
        true,
      );
      assert.equal(
        rows.some((row) => row.decision === "denied" && row.code === "REVOKED"),
        true,
      );
    } finally {
      await f.close();
    }
    const g = await fixture();
    try {
      let unlock!: () => void;
      let locked!: () => void;
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const blocking = g.admin.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"foundation-memory:" + g.projectId}, 0))`,
        );
        locked();
        await held;
      });
      await ready;
      let called = false;
      const pending = g.port.withClient(g.request(), async () => {
        called = true;
        return "invalid";
      });
      // Attach rejection immediately while the database is waiting.
      const rejected = assert.rejects(pending, denied("EXPIRED"));
      await delay(40);
      g.advance(3600000);
      unlock();
      await blocking;
      await rejected;
      assert.equal(called, false);
    } finally {
      await g.close();
    }
  },
);
