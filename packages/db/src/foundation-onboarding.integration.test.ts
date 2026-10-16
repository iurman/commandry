import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq } from "drizzle-orm";
import {
  createFoundationMachineService,
  createFoundationOnboardingService,
  createFoundationOwnerService,
  createResourceTopologyService,
} from "@commandry/application";
import {
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import type { FoundationOnboardingProposal } from "@commandry/contracts";
import { createDatabase } from "./client";
import { fileCaptureNoteInTransaction } from "./capture-note-filing";
import { foundationByteDigest } from "./foundation-record-repository";
import { createResourceTopologyRepository } from "./resource-topology-repository";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationOnboardingAccessRepository } from "./foundation-onboarding-repository";
import { resourceIdentityClaim } from "./foundation-onboarding-schema";
import {
  capture,
  knowledgeItem,
  knowledgeItemRevision,
  project,
  projectResourceLink,
  resource,
  session,
  user,
} from "./schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = password;
const denied = (code: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === code;
const sqlError = (code: string, constraint?: string) => (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code &&
  (constraint === undefined ||
    ("constraint" in error && error.constraint === constraint));
const signed = <T extends object>(value: T) => ({
  ...value,
  contentDigest: foundationDigest(value),
});
before(async () => {
  const admin = createDatabase({ connectionString: adminUrl!, max: 1 });
  try {
    assert.match(
      (await admin.pool.query("show server_version")).rows[0].server_version,
      /^18\./,
    );
    const statements = readFileSync(
      new URL("../migrations/0067_foundation_onboarding.sql", import.meta.url),
      "utf8",
    ).split("--> statement-breakpoint");
    for (let n = 0; n < 2; n++) {
      const connection = await admin.pool.connect();
      try {
        await connection.query("begin");
        for (const statement of statements)
          if (statement.trim()) {
            try {
              await connection.query(statement);
            } catch (error) {
              throw new Error("Onboarding DDL " + statement.slice(0, 100), {
                cause: error,
              });
            }
          }
        await connection.query("commit");
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
    }
  } finally {
    await admin.close();
  }
});
async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 5 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  await runtime.pool.query("set statement_timeout=15000");
  const peer = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = randomUUID(),
    userId = randomUUID(),
    sessionId = randomUUID();
  let offset = 0;
  const now = () => new Date(Date.now() + offset);
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await admin.db
    .insert(project)
    .values({ id: projectId, name: "Onboarding " + projectId });
  await admin.db.insert(user).values({
    id: userId,
    name: "Onboarding owner",
    email: projectId + "@example.test",
  });
  await admin.db.insert(session).values({
    id: sessionId,
    userId,
    token: randomUUID(),
    expiresAt: new Date(expiresAt),
  });
  const identity = { principalId: "user:" + userId, sessionId, expiresAt };
  const base = createFoundationAccessRepository(runtime.db, { now });
  const owner = createFoundationOwnerService(base, identity, {
    environment: "test",
    now,
  });
  const port = createFoundationOnboardingAccessRepository(runtime.db, { now });
  const service = createFoundationOnboardingService(port, {
    environment: "test",
    now,
  });
  const peerService = createFoundationOnboardingService(
    createFoundationOnboardingAccessRepository(peer.db, { now }),
    { environment: "test", now },
  );
  const issued = await owner.createClient(
    {
      name: "Onboarding test",
      projectId,
      environment: "test",
      operations: ["onboarding.read", "onboarding.propose", "evidence.record"],
      ttlSeconds: 3600,
    },
    randomUUID(),
  );
  const machine = createFoundationMachineService(base, {
    environment: "test",
    now,
  });
  const input = (
    target: FoundationOnboardingProposal["target"] = {
      mode: "create",
      name: "Host " + projectId,
      subtype: null,
      externalUrl: null,
      identity: {
        namespace: "provider",
        authority: projectId,
        externalId: randomUUID(),
        assurance: "owner_asserted",
      },
    },
  ) => ({
    projectId,
    target,
    relationship: "supports" as const,
    rationale: "Reviewed source intent",
    evidenceIds: [] as string[],
  });
  const propose = async (
    target?: FoundationOnboardingProposal["target"],
    evidenceIds: string[] = [],
  ) =>
    (
      await service.propose(issued.token, randomUUID(), {
        ...input(target),
        evidenceIds,
      })
    ).record;
  const review = async (
    p: FoundationOnboardingProposal,
    version = 0,
    decision: "approved" | "rejected" | "revoked" = "approved",
    expires = new Date(now().getTime() + 60000).toISOString(),
  ) => {
    const preview = await service.preview(identity, { projectId, id: p.id });
    return service.review(identity, randomUUID(), {
      projectId,
      proposalId: p.id,
      expectedProposalDigest: p.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: version,
      decision,
      reason: "Owner inventory review",
      expiresAt: expires,
      inventoryReviewed: decision === "approved",
    });
  };
  const applyInput = (
    p: FoundationOnboardingProposal,
    d: Awaited<ReturnType<typeof review>>["record"],
  ) => ({
    projectId,
    proposalId: p.id,
    expectedProposalDigest: p.contentDigest,
    decisionId: d.id,
    expectedDecisionVersion: d.version,
    expectedDecisionDigest: d.contentDigest,
  });
  const counts = async () => {
    const { rows } = await admin.pool.query(
      "select (select count(*) from resource)::int resources,(select count(*) from project_resource_link)::int links,(select count(*) from resource_identity_claim)::int claims,(select count(*) from foundation_onboarding_outcome)::int outcomes,(select count(*) from foundation_idempotency where project_id=$1 and operation='onboarding.apply')::int receipts,(select count(*) from foundation_audit where project_id=$1 and operation='onboarding.apply' and decision='allowed')::int allowed",
      [projectId],
    );
    return rows[0];
  };
  return {
    admin,
    runtime,
    peer,
    projectId,
    userId,
    identity,
    owner,
    port,
    service,
    peerService,
    issued,
    machine,
    input,
    propose,
    review,
    applyInput,
    now,
    counts,
    advance: (ms: number) => {
      offset += ms;
    },
    close: () => Promise.all([admin.close(), runtime.close(), peer.close()]),
  };
}
type World = Awaited<ReturnType<typeof fixture>>;
async function sourceMutationCounts(w: World) {
  const effects = await w.counts();
  const { rows } = await w.admin.pool.query(
    "select (select count(*) from foundation_evidence where project_id=$1)::int evidence,(select count(*) from foundation_onboarding_proposal where project_id=$1)::int proposals,(select count(*) from foundation_onboarding_decision where project_id=$1)::int decisions,(select count(*) from foundation_idempotency where project_id=$1 and operation=any($2::text[]))::int mutation_receipts,(select count(*) from foundation_audit where project_id=$1 and operation=any($2::text[]) and decision='allowed')::int mutation_allowed",
    [
      w.projectId,
      [
        "evidence.record",
        "onboarding.propose",
        "onboarding.review",
        "onboarding.apply",
      ],
    ],
  );
  return { ...effects, ...rows[0] };
}
async function canonicalKnowledge(w: World, content: string, title: string) {
  const captureId = randomUUID(),
    knowledgeId = randomUUID();
  await w.admin.db.insert(capture).values({
    id: captureId,
    inputType: "text",
    originalContent: content,
    projectId: w.projectId,
  });
  const filed = await w.runtime.db.transaction((tx) =>
    fileCaptureNoteInTransaction(tx, {
      captureId,
      recordId: knowledgeId,
      projectId: w.projectId,
      title,
      content,
      at: w.now(),
    }),
  );
  assert.equal(filed.record.version, 1);
  return { captureId, knowledgeId, content, title };
}
async function exactReview(w: World, p: FoundationOnboardingProposal) {
  const preview = await w.service.preview(w.identity, {
    projectId: w.projectId,
    id: p.id,
  });
  const input = {
    projectId: w.projectId,
    proposalId: p.id,
    expectedProposalDigest: p.contentDigest,
    expectedPreviewDigest: preview.previewDigest,
    expectedDecisionVersion: 0,
    decision: "approved" as const,
    reason: "Canonical source control",
    expiresAt: new Date(w.now().getTime() + 60000).toISOString(),
    inventoryReviewed: true,
  };
  const key = randomUUID();
  const result = await w.service.review(w.identity, key, input);
  return { key, input, result };
}
async function waitForLock(w: World, pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await w.admin.pool.query(
      "select wait_event_type from pg_stat_activity where pid=$1",
      [pid],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await delay(10);
  }
  assert.fail("Expected an observed PostgreSQL lock");
}
async function auditGate(
  w: World,
  operation = "onboarding.apply",
  failure = false,
) {
  const name = "onboarding_gate_" + w.projectId.replaceAll("-", "");
  const key = "onboarding-test:" + w.projectId;
  await w.admin.pool.query(
    `create function ${name}() returns trigger language plpgsql as $$ begin if NEW.project_id='${w.projectId}'::uuid and NEW.operation='${operation}' and NEW.decision='allowed' then ${failure ? "raise exception 'injected onboarding audit failure'" : "perform pg_advisory_xact_lock(hashtextextended('" + key + "',0))"}; end if; return NEW; end $$`,
  );
  await w.admin.pool.query(
    `create trigger ${name} before insert on foundation_audit for each row execute function ${name}()`,
  );
  const connection = await w.admin.pool.connect();
  await connection.query("begin");
  if (!failure)
    await connection.query(
      "select pg_advisory_xact_lock(hashtextextended($1,0))",
      [key],
    );
  return {
    release: async () => {
      await connection.query("commit");
      connection.release();
    },
    drop: async () => {
      await w.admin.pool.query(
        `drop trigger if exists ${name} on foundation_audit`,
      );
      await w.admin.pool.query(`drop function if exists ${name}()`);
    },
  };
}

test("canonical create, exact apply receipt replay, redaction, and immutable history", async () => {
  const w = await fixture();
  try {
    const p = await w.propose();
    const preview = await w.service.preview(w.identity, {
      projectId: w.projectId,
      id: p.id,
    });
    assert.deepEqual(preview.preconditions, {
      resource: null,
      link: null,
      identityResourceId: null,
    });
    assert.equal(preview.canApply, true);
    const d = await w.review(p);
    const key = randomUUID(),
      input = w.applyInput(p, d.record);
    const result = await w.service.apply(w.identity, key, input);
    assert.equal(result.record.resourceCreated, true);
    assert.equal(result.record.linkCreated, true);
    assert.equal(result.record.identity?.assurance, "owner_asserted");
    const [stored] = await w.admin.db
      .select()
      .from(resource)
      .where(eq(resource.id, result.record.resource.id));
    assert.equal(stored?.kind, "host");
    const [claim] = await w.admin.db
      .select()
      .from(resourceIdentityClaim)
      .where(eq(resourceIdentityClaim.resourceId, result.record.resource.id));
    assert.equal(claim?.recordedBy, w.identity.principalId);
    const machine = await w.service.get(w.issued.token, {
      projectId: w.projectId,
      id: p.id,
    });
    assert.deepEqual(Object.keys(machine.currentDecision!).sort(), [
      "decision",
      "expiresAt",
      "id",
      "version",
    ]);
    assert.deepEqual(Object.keys(machine.outcome!).sort(), [
      "id",
      "linkId",
      "recordedAt",
      "resourceId",
    ]);
    await w.admin.db
      .update(resource)
      .set({
        name: "Later canonical metadata",
        state: "running",
        lastObservedAt: new Date(),
      })
      .where(eq(resource.id, result.record.resource.id));
    await w.admin.db
      .update(projectResourceLink)
      .set({ lifecycle: "archived" })
      .where(eq(projectResourceLink.id, result.record.link.id));
    await w.review(p, 1, "revoked");
    w.advance(61000);
    const replay = await w.service.apply(w.identity, key, input);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.record, result.record);
    assert.equal(replay.correlationId, result.correlationId);
    assert.deepEqual(
      (
        await w.service.getOwner(w.identity, {
          projectId: w.projectId,
          id: p.id,
        })
      ).outcome,
      result.record,
    );
    await assert.rejects(
      w.service.apply(w.identity, randomUUID(), input),
      denied("VERSION_CONFLICT"),
    );
    assert.equal((await w.counts()).outcomes >= 1, true);
    await assert.rejects(
      w.runtime.pool.query(
        "update foundation_onboarding_proposal set record=record where id=$1",
        [p.id],
      ),
    );
    await assert.rejects(
      w.runtime.pool.query(
        "delete from resource_identity_claim where resource_id=$1",
        [result.record.resource.id],
      ),
    );
  } finally {
    await w.close();
  }
});

test("reuse sees global owner inventory, active links, archived links, missing IDs and non-host blockers", async () => {
  const w = await fixture();
  try {
    const host = randomUUID();
    await w.admin.db
      .insert(resource)
      .values({ id: host, kind: "host", name: "Global host" });
    const p = await w.propose({ mode: "reuse", resourceId: host });
    assert.equal(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: p.id,
        })
      ).preconditions.resource?.id,
      host,
    );
    const d = await w.review(p);
    const first = await w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(p, d.record),
    );
    assert.equal(first.record.resourceCreated, false);
    assert.equal(first.record.linkCreated, true);
    const p2 = await w.propose({ mode: "reuse", resourceId: host }),
      d2 = await w.review(p2);
    const second = await w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(p2, d2.record),
    );
    assert.equal(second.record.linkCreated, false);
    assert.equal(second.record.link.id, first.record.link.id);
    await w.admin.db
      .update(projectResourceLink)
      .set({ lifecycle: "archived" })
      .where(eq(projectResourceLink.id, first.record.link.id));
    assert.deepEqual(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: p2.id,
        })
      ).blockers,
      ["archived_connection"],
    );
    const missing = await w.propose({
      mode: "reuse",
      resourceId: randomUUID(),
    });
    assert.deepEqual(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: missing.id,
        })
      ).blockers,
      ["resource_unavailable"],
    );
    const nonhost = randomUUID();
    await w.admin.db
      .insert(resource)
      .values({ id: nonhost, kind: "service", name: "Non-host" });
    const other = await w.propose({ mode: "reuse", resourceId: nonhost });
    assert.deepEqual(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: other.id,
        })
      ).blockers,
      ["resource_not_host"],
    );
    const conflict = await w.propose(
      first.record.resourceCreated
        ? undefined
        : {
            mode: "create",
            name: "Other label",
            subtype: null,
            externalUrl: null,
            identity: {
              namespace: "provider",
              authority: w.projectId,
              externalId: "same",
              assurance: "owner_asserted",
            },
          },
    );
    if (conflict.target.mode === "create") {
      const approved = await w.review(conflict);
      await w.service.apply(
        w.identity,
        randomUUID(),
        w.applyInput(conflict, approved.record),
      );
      const duplicate = await w.propose(conflict.target);
      assert.deepEqual(
        (
          await w.service.preview(w.identity, {
            projectId: w.projectId,
            id: duplicate.id,
          })
        ).blockers,
        ["identity_conflict"],
      );
    }
  } finally {
    await w.close();
  }
});

test("all project proposals remain reachable and cursor scope/anchors are checked", async () => {
  const w = await fixture();
  try {
    for (let i = 0; i < 28; i++)
      await w.propose({ mode: "reuse", resourceId: randomUUID() });
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const page = await w.service.list(w.issued.token, {
        projectId: w.projectId,
        limit: 7,
        ...(cursor ? { cursor } : {}),
      });
      ids.push(...page.items.map((x) => x.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(ids.length, 28);
    assert.equal(new Set(ids).size, 28);
    assert.deepEqual(ids, [...ids].sort());
    const first = await w.service.list(w.issued.token, {
      projectId: w.projectId,
      limit: 1,
    });
    await assert.rejects(
      w.service.listOwner(w.identity, {
        projectId: w.projectId,
        limit: 1,
        cursor: first.nextCursor!,
      }),
    );
    await assert.rejects(
      w.port.withOwner(
        {
          ...w.identity,
          operation: "onboarding.read",
          projectId: w.projectId,
          environment: "test",
          targetId: null,
          correlationId: randomUUID(),
        },
        (r) =>
          r.listProposals({
            limit: 2,
            afterId: randomUUID(),
            asOf: w.now().toISOString(),
          }),
      ),
      denied("INVALID_REFERENCE"),
    );
    await assert.rejects(
      w.port.withOwner(
        {
          ...w.identity,
          operation: "onboarding.read",
          projectId: w.projectId,
          environment: "test",
          targetId: null,
          correlationId: randomUUID(),
        },
        (r) =>
          r.listProposals({
            limit: 2,
            afterId: ids[0]!,
            asOf: "2000-01-01T00:00:00.000Z",
          }),
      ),
      denied("INVALID_REFERENCE"),
    );
  } finally {
    await w.close();
  }
});

test("machine IDs stay opaque and owner operations require the canonical live session", async () => {
  const w = await fixture();
  try {
    const p = await w.propose({ mode: "reuse", resourceId: randomUUID() });
    assert.equal(
      (
        await w.service.get(w.issued.token, {
          projectId: w.projectId,
          id: p.id,
        })
      ).proposal.id,
      p.id,
    );
    await assert.rejects(
      w.port.withClient(
        {
          operation: "onboarding.read",
          projectId: w.projectId,
          environment: "test",
          targetId: p.id,
          correlationId: randomUUID(),
          tokenDigest: foundationTokenDigest(w.issued.token),
        },
        (_c, r) => r.inspectProposal(p, false),
      ),
      denied("FORBIDDEN"),
    );
    for (const identity of [
      { ...w.identity, sessionId: randomUUID() },
      { ...w.identity, principalId: "user:" + randomUUID() },
      { principalId: w.identity.principalId, expiresAt: w.identity.expiresAt },
    ])
      await assert.rejects(
        w.service.preview(identity, { projectId: w.projectId, id: p.id }),
        denied("FORBIDDEN"),
      );
    const legacy = await w.owner.createClient(
      {
        name: "Legacy",
        projectId: w.projectId,
        environment: "test",
        operations: ["resources.read"],
        ttlSeconds: 60,
      },
      randomUUID(),
    );
    await assert.rejects(
      w.service.list(legacy.token, { projectId: w.projectId, limit: 10 }),
      denied("FORBIDDEN"),
    );
    await w.owner.revokeClient({ clientId: w.issued.client.id });
    await assert.rejects(
      w.service.get(w.issued.token, { projectId: w.projectId, id: p.id }),
    );
  } finally {
    await w.close();
  }
});

test("same-key parallel apply and different-key apply have exactly one effect", async () => {
  const w = await fixture();
  try {
    const p = await w.propose(),
      d = await w.review(p),
      input = w.applyInput(p, d.record),
      key = randomUUID();
    const before = await w.counts();
    const [a, b] = await Promise.all([
      w.service.apply(w.identity, key, input),
      w.peerService.apply(w.identity, key, input),
    ]);
    assert.deepEqual(a.record, b.record);
    assert.equal(Number(a.replayed) + Number(b.replayed), 1);
    const after = await w.counts();
    for (const field of [
      "resources",
      "links",
      "claims",
      "outcomes",
      "receipts",
    ] as const)
      assert.equal(after[field] - before[field], 1);
    await assert.rejects(
      w.service.apply(w.identity, key, {
        ...input,
        expectedDecisionDigest: "a".repeat(64),
      }),
      denied("IDEMPOTENCY_CONFLICT"),
    );
    await assert.rejects(
      w.peerService.apply(w.identity, randomUUID(), input),
      denied("VERSION_CONFLICT"),
    );
    const q = await w.propose(),
      e = await w.review(q),
      qInput = w.applyInput(q, e.record);
    const result = await Promise.allSettled([
      w.service.apply(w.identity, randomUUID(), qInput),
      w.peerService.apply(w.identity, randomUUID(), qInput),
    ]);
    assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  } finally {
    await w.close();
  }
});

test("cross-project exact identity claims have one canonical winner and case-sensitive tuples", async () => {
  const a = await fixture(),
    b = await fixture();
  try {
    const target = {
      mode: "create" as const,
      name: "Same physical assertion",
      subtype: null,
      externalUrl: null,
      identity: {
        namespace: "provider" as const,
        authority: a.projectId,
        externalId: "CaseSensitive",
        assurance: "owner_asserted" as const,
      },
    };
    const pa = await a.propose(target),
      pb = await b.propose(target),
      da = await a.review(pa),
      db = await b.review(pb);
    const before = await a.counts();
    const results = await Promise.allSettled([
      a.service.apply(a.identity, randomUUID(), a.applyInput(pa, da.record)),
      b.service.apply(b.identity, randomUUID(), b.applyInput(pb, db.record)),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    const after = await a.counts();
    for (const field of ["resources", "links", "claims", "outcomes"] as const)
      assert.equal(after[field] - before[field], 1);
    const different = await b.propose({
      ...target,
      identity: { ...target.identity, externalId: "casesensitive" },
    });
    assert.equal(
      (
        await b.service.preview(b.identity, {
          projectId: b.projectId,
          id: different.id,
        })
      ).canApply,
      true,
    );
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});

test("audit failure and deadline after the allowed audit waits roll back all local effects", async () => {
  const w = await fixture();
  try {
    const p = await w.propose(),
      d = await w.review(p),
      input = w.applyInput(p, d.record),
      before = await w.counts();
    const gate = await auditGate(w, "onboarding.apply", true);
    try {
      await assert.rejects(w.service.apply(w.identity, randomUUID(), input));
      assert.deepEqual(await w.counts(), before);
    } finally {
      await gate.release();
      await gate.drop();
    }
    const expires = new Date(Date.now() + 1000).toISOString();
    const q = await w.propose(),
      e = await w.review(q, 0, "approved", expires);
    const beforeExpiry = await w.counts();
    const wait = await auditGate(w);
    const { rows } = await w.runtime.pool.query("select pg_backend_pid() pid");
    const pending = w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(q, e.record),
    );
    try {
      await waitForLock(w, rows[0].pid);
      await delay(Math.max(1, Date.parse(expires) - Date.now() + 30));
      await wait.release();
      await assert.rejects(pending);
      assert.deepEqual(await w.counts(), beforeExpiry);
    } finally {
      await wait.drop();
    }
  } finally {
    await w.close();
  }
});

test("ordinary link archive owns its row before tuple locking and invalidates waiting apply", async () => {
  const w = await fixture();
  const blocker = await w.admin.pool.connect();
  try {
    const host = randomUUID(),
      linkId = randomUUID();
    await w.admin.db
      .insert(resource)
      .values({ id: host, kind: "host", name: "Concurrent existing link" });
    await w.admin.db.insert(projectResourceLink).values({
      id: linkId,
      projectId: w.projectId,
      resourceId: host,
      type: "supports",
      sourceKind: "resource",
      targetKind: "project",
    });
    const p = await w.propose({ mode: "reuse", resourceId: host }),
      d = await w.review(p),
      before = await w.counts();
    await blocker.query("begin");
    await blocker.query(
      "update project_resource_link set lifecycle='archived' where id=$1",
      [linkId],
    );
    const { rows } = await w.runtime.pool.query("select pg_backend_pid() pid");
    const pending = w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(p, d.record),
    );
    await waitForLock(w, rows[0].pid);
    await blocker.query("commit");
    await assert.rejects(pending, denied("VERSION_CONFLICT"));
    assert.deepEqual(await w.counts(), before);
  } finally {
    await blocker.query("rollback");
    blocker.release();
    await w.close();
  }
});

test("generic link insert and metadata/topology writers wait on actual apply locks", async () => {
  const w = await fixture();
  const generic = await w.admin.pool.connect();
  try {
    const host = randomUUID();
    await w.admin.db
      .insert(resource)
      .values({ id: host, kind: "host", name: "Concurrent canonical host" });
    const p = await w.propose({ mode: "reuse", resourceId: host }),
      d = await w.review(p);
    const gate = await auditGate(w);
    const { rows } = await w.runtime.pool.query("select pg_backend_pid() pid");
    const pending = w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(p, d.record),
    );
    await waitForLock(w, rows[0].pid);
    const genericPid = (await generic.query("select pg_backend_pid() pid"))
      .rows[0].pid;
    const insert = generic.query(
      "insert into project_resource_link(id,project_id,resource_id,type,source_kind,target_kind) values($1,$2,$3,'supports','resource','project') on conflict do nothing",
      [randomUUID(), w.projectId, host],
    );
    await waitForLock(w, genericPid);
    await gate.release();
    const applied = await pending;
    assert.equal((await insert).rowCount, 0);
    await gate.drop();
    const p2 = await w.propose({ mode: "reuse", resourceId: host }),
      d2 = await w.review(p2);
    const stale = await w.propose({ mode: "reuse", resourceId: host });
    const staleDecision = await w.review(stale);
    const parentId = randomUUID();
    await w.admin.db
      .insert(resource)
      .values({ id: parentId, kind: "host", name: "Actual topology parent" });
    const topology = createResourceTopologyService(
      createResourceTopologyRepository(w.peer.db),
    );
    const peerPid = (await w.peer.pool.query("select pg_backend_pid() pid"))
      .rows[0].pid;
    const gate2 = await auditGate(w);
    const pending2 = w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(p2, d2.record),
    );
    let released = false;
    try {
      await waitForLock(w, rows[0].pid);
      const move = topology.setParent(host, {
        parentResourceId: parentId,
        expectedParentResourceId: null,
      });
      await waitForLock(w, peerPid);
      await gate2.release();
      released = true;
      const applied2 = await pending2;
      const moved = await move;
      assert.equal(moved.parentResourceId, parentId);
      assert.equal(applied2.record.resource.parentResourceId, null);
      const historical = await w.service.getOwner(w.identity, {
        projectId: w.projectId,
        id: p2.id,
      });
      assert.deepEqual(historical.outcome, applied2.record);
      const beforeConflict = await w.counts();
      await assert.rejects(
        w.service.apply(
          w.identity,
          randomUUID(),
          w.applyInput(stale, staleDecision.record),
        ),
        denied("VERSION_CONFLICT"),
      );
      assert.deepEqual(await w.counts(), beforeConflict);
    } finally {
      if (!released) await gate2.release();
      await gate2.drop();
    }
    assert.equal(applied.record.resource.name, "Concurrent canonical host");
    await assert.rejects(
      generic.query("delete from project_resource_link where id=$1", [
        applied.record.link.id,
      ]),
    );
  } finally {
    await generic.query("rollback");
    generic.release();
    await w.close();
  }
});

test("SQL strict records, scope, digest, evidence population, decision CAS, and TEMP shadow guards", async () => {
  const w = await fixture();
  try {
    const e = await w.machine.recordEvidence(
      w.issued.token,
      {
        projectId: w.projectId,
        sourceKind: "external",
        sourceId: "source-" + w.projectId,
        sourceVersion: null,
        contentDigest: foundationDigest("source"),
        locator: "https://example.test/source",
        observedAt: null,
        availability: "available",
      },
      randomUUID(),
    );
    const p = await w.propose(undefined, [e.record.id]);
    const evidenceId = e.record.id;
    async function insertRaw(record: FoundationOnboardingProposal) {
      return w.runtime.pool.query(
        "insert into foundation_onboarding_proposal(id,project_id,environment,client_id,version,record,recorded_at) values($1,$2,$3,$4,1,$5,$6)",
        [
          record.id,
          w.projectId,
          "test",
          w.issued.client.id,
          record,
          record.recordedAt,
        ],
      );
    }
    for (const mutate of [
      (base: Record<string, unknown>) => ({ ...base, unexpected: "sensitive" }),
      (base: Record<string, unknown>) => ({ ...base, projectId: randomUUID() }),
      (base: Record<string, unknown>) => ({
        ...base,
        environment: "production",
      }),
      (base: Record<string, unknown>) => ({
        ...base,
        contentDigest: "a".repeat(64),
      }),
    ]) {
      const { contentDigest: _digest, ...unsigned } = p;
      const candidate = mutate({
        ...unsigned,
        id: randomUUID(),
        evidenceIds: [],
      });
      const record = (
        "contentDigest" in candidate ? candidate : signed(candidate)
      ) as FoundationOnboardingProposal;
      await assert.rejects(
        insertRaw(record),
        sqlError("23514", "foundation_onboarding_proposal_valid"),
      );
    }
    const { contentDigest: _digest, ...unsigned } = p;
    await assert.rejects(
      insertRaw(
        signed({ ...unsigned, id: randomUUID(), evidenceIds: [evidenceId] }),
      ),
    );
    const connection = await w.admin.pool.connect();
    try {
      await connection.query("begin");
      const value = signed({ ...unsigned, id: randomUUID(), evidenceIds: [] });
      await connection.query(
        "insert into foundation_onboarding_proposal(id,project_id,environment,client_id,version,record,recorded_at,creation_transaction) values($1,$2,'test',$3,1,$4,$5,'forged')",
        [value.id, w.projectId, w.issued.client.id, value, value.recordedAt],
      );
      const stamped = (
        await connection.query(
          "select creation_transaction from foundation_onboarding_proposal where id=$1",
          [value.id],
        )
      ).rows[0].creation_transaction;
      assert.notEqual(stamped, "forged");
      await connection.query("commit");
      await assert.rejects(
        connection.query(
          "insert into foundation_onboarding_proposal_evidence(proposal_id,project_id,evidence_id,ordinal,creation_transaction) values($1,$2,$3,0,$4)",
          [value.id, w.projectId, evidenceId, stamped],
        ),
      );
      const canonicalHost = randomUUID();
      await w.admin.db.insert(resource).values({
        id: canonicalHost,
        kind: "host",
        name: "Canonical TEMP-shadow control",
      });
      const reuse = await w.propose({
        mode: "reuse",
        resourceId: canonicalHost,
      });
      await connection.query(
        "create temporary table resource(id uuid,kind text,name text)",
      );
      await connection.query(
        "insert into pg_temp.resource values($1,'host','Wrong TEMP shadow')",
        [canonicalHost],
      );
      await connection.query("set search_path=pg_temp,public");
      const pc = (
        await connection.query(
          "select public.foundation_onboarding_actual_preconditions(record) actual from public.foundation_onboarding_proposal where id=$1",
          [reuse.id],
        )
      ).rows[0].actual;
      assert.equal(pc.resource.id, canonicalHost);
      assert.equal(pc.resource.name, "Canonical TEMP-shadow control");
      assert.equal(pc.link, null);
      assert.equal(pc.identityResourceId, null);
    } finally {
      await connection.query("rollback");
      connection.release();
    }
    const d = await w.review(p);
    const { contentDigest: _decisionDigest, ...decisionUnsigned } = d.record;
    const skipped = signed({
      ...decisionUnsigned,
      id: randomUUID(),
      version: 3,
      expectedDecisionVersion: 2,
    });
    await assert.rejects(
      w.runtime.pool.query(
        "insert into foundation_onboarding_decision(id,proposal_id,project_id,environment,version,owner_user_id,record) values($1,$2,$3,'test',3,$4,$5)",
        [skipped.id, p.id, w.projectId, w.userId, skipped],
      ),
    );
    for (const value of [
      {
        z: "astral \u{1F680}",
        a: "control\n\t\u000b",
        nested: [true, null, 2147483647],
      },
      { "\u{10000}": 1, "\ue000": 2 },
      [0, 9007199254740991, -1],
    ]) {
      const actual = (
        await w.admin.pool.query(
          "select foundation_onboarding_canonical($1::jsonb) canonical,foundation_onboarding_digest($1::jsonb) digest",
          [JSON.stringify(value)],
        )
      ).rows[0];
      assert.equal(actual.canonical, canonicalFoundationJson(value));
      assert.equal(actual.digest, foundationDigest(value));
    }
    await assert.rejects(
      w.admin.pool.query(
        "select foundation_onboarding_canonical('1.25'::jsonb)",
      ),
    );
    await assert.rejects(
      w.runtime.pool.query("create table onboarding_must_not_create(id int)"),
      (error: unknown) =>
        !!error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "42501",
    );
  } finally {
    await w.close();
  }
});

test("historical proposal and review keys replay after later revocation and expiry", async () => {
  const w = await fixture();
  try {
    const key = randomUUID(),
      input = w.input();
    const [a, b] = await Promise.all([
      w.service.propose(w.issued.token, key, input),
      w.peerService.propose(w.issued.token, key, input),
    ]);
    assert.deepEqual(a.record, b.record);
    assert.equal(Number(a.replayed) + Number(b.replayed), 1);
    await assert.rejects(
      w.service.propose(w.issued.token, key, {
        ...input,
        rationale: "Different intent",
      }),
      denied("IDEMPOTENCY_CONFLICT"),
    );
    const p = a.record,
      preview = await w.service.preview(w.identity, {
        projectId: w.projectId,
        id: p.id,
      }),
      reviewKey = randomUUID();
    const raw = {
      projectId: w.projectId,
      proposalId: p.id,
      expectedProposalDigest: p.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: 0,
      decision: "approved",
      reason: "Exact review receipt",
      expiresAt: new Date(w.now().getTime() + 60000).toISOString(),
      inventoryReviewed: true,
    };
    const d = await w.service.review(w.identity, reviewKey, raw);
    await w.review(p, 1, "revoked");
    w.advance(61000);
    const replay = await w.service.review(w.identity, reviewKey, raw);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.record, d.record);
    assert.equal(replay.correlationId, d.correlationId);
    assert.deepEqual(
      (await w.service.propose(w.issued.token, key, input)).record,
      p,
    );
    const expired = await w.owner.createClient(
      {
        name: "Short actual grant",
        projectId: w.projectId,
        environment: "test",
        operations: ["onboarding.read"],
        ttlSeconds: 60,
      },
      randomUUID(),
    );
    w.advance(61000);
    await assert.rejects(
      w.service.list(expired.token, { projectId: w.projectId, limit: 1 }),
      denied("EXPIRED"),
    );
  } finally {
    await w.close();
  }
});

test("review CAS, rejection of blocked previews, and SQL expired-approval/outcome integrity", async () => {
  const w = await fixture();
  try {
    const p = await w.propose(),
      preview = await w.service.preview(w.identity, {
        projectId: w.projectId,
        id: p.id,
      });
    const raw = {
      projectId: w.projectId,
      proposalId: p.id,
      expectedProposalDigest: p.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: 0,
      decision: "approved",
      reason: "Parallel review",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      inventoryReviewed: true,
    };
    const decisions = await Promise.allSettled([
      w.service.review(w.identity, randomUUID(), raw),
      w.peerService.review(w.identity, randomUUID(), raw),
    ]);
    assert.equal(decisions.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(decisions.filter((x) => x.status === "rejected").length, 1);
    const current = (
      await w.service.getOwner(w.identity, { projectId: w.projectId, id: p.id })
    ).currentDecision!;
    const { contentDigest: _digest, ...unsigned } = current;
    const old = signed({
      ...unsigned,
      id: randomUUID(),
      expectedDecisionVersion: 1,
      version: 2,
      recordedAt: new Date(Date.now() - 2000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await assert.rejects(
      w.runtime.pool.query(
        "insert into foundation_onboarding_decision(id,proposal_id,project_id,environment,version,owner_user_id,record) values($1,$2,$3,'test',2,$4,$5)",
        [old.id, p.id, w.projectId, w.userId, old],
      ),
    );
    assert.equal(
      (
        await w.service.getOwner(w.identity, {
          projectId: w.projectId,
          id: p.id,
        })
      ).currentDecision?.version,
      1,
    );
    const missing = await w.propose({
      mode: "reuse",
      resourceId: randomUUID(),
    });
    await assert.rejects(w.review(missing), denied("APPROVAL_REQUIRED"));
    assert.equal(
      (await w.review(missing, 0, "rejected")).record.decision,
      "rejected",
    );
    const applied = await w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(p, current),
    );
    const { contentDigest: _outcomeDigest, ...outcome } = applied.record;
    const forged = signed({
      ...outcome,
      id: randomUUID(),
      projectId: randomUUID(),
    });
    await assert.rejects(
      w.runtime.pool.query(
        "insert into foundation_onboarding_outcome(id,proposal_id,project_id,environment,decision_id,decision_version,resource_id,link_id,owner_user_id,record) values($1,$2,$3,'test',$4,$5,$6,$7,$8,$9)",
        [
          forged.id,
          p.id,
          w.projectId,
          current.id,
          current.version,
          applied.record.resource.id,
          applied.record.link.id,
          w.userId,
          forged,
        ],
      ),
    );
  } finally {
    await w.close();
  }
});

test("expiry during feature, identity tuple, canonical resource and link locks creates no outcome", async () => {
  const w = await fixture();
  const blocker = await w.admin.pool.connect();
  try {
    for (const kind of ["feature", "identity", "resource", "link"]) {
      let p: FoundationOnboardingProposal;
      if (kind === "resource" || kind === "link") {
        const id = randomUUID();
        await w.admin.db
          .insert(resource)
          .values({ id, kind: "host", name: "Deadline " + kind });
        p = await w.propose({ mode: "reuse", resourceId: id });
      } else p = await w.propose();
      const expires = new Date(Date.now() + 500).toISOString(),
        d = await w.review(p, 0, "approved", expires),
        before = await w.counts();
      await blocker.query("begin");
      if (kind === "feature")
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          ["foundation-onboarding:" + w.projectId],
        );
      else if (kind === "identity" && p.target.mode === "create")
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [
            "foundation-onboarding-identity:" +
              canonicalFoundationJson([
                p.target.identity.namespace,
                p.target.identity.authority,
                p.target.identity.externalId,
              ]),
          ],
        );
      else if (p.target.mode === "reuse" && kind === "resource")
        await blocker.query("select id from resource where id=$1 for update", [
          p.target.resourceId,
        ]);
      else if (p.target.mode === "reuse")
        await blocker.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [
            "foundation-onboarding-link:" +
              w.projectId +
              ":" +
              p.target.resourceId +
              ":supports",
          ],
        );
      const { rows } = await w.runtime.pool.query(
        "select pg_backend_pid() pid",
      );
      const pending = w.service.apply(
        w.identity,
        randomUUID(),
        w.applyInput(p, d.record),
      );
      await waitForLock(w, rows[0].pid);
      await delay(Math.max(1, Date.parse(expires) - Date.now() + 25));
      await blocker.query("commit");
      await assert.rejects(pending);
      assert.deepEqual(await w.counts(), before);
    }
  } finally {
    await blocker.query("rollback");
    blocker.release();
    await w.close();
  }
});

test("new review deadline after an allowed audit wait rolls back decision and receipt", async () => {
  const w = await fixture();
  try {
    const p = await w.propose(),
      preview = await w.service.preview(w.identity, {
        projectId: w.projectId,
        id: p.id,
      }),
      expiresAt = new Date(Date.now() + 600).toISOString();
    const gate = await auditGate(w, "onboarding.review");
    const { rows } = await w.runtime.pool.query("select pg_backend_pid() pid");
    const pending = w.service.review(w.identity, randomUUID(), {
      projectId: w.projectId,
      proposalId: p.id,
      expectedProposalDigest: p.contentDigest,
      expectedPreviewDigest: preview.previewDigest,
      expectedDecisionVersion: 0,
      decision: "approved",
      reason: "Expires in observed audit wait",
      expiresAt,
      inventoryReviewed: true,
    });
    try {
      await waitForLock(w, rows[0].pid);
      await delay(Math.max(1, Date.parse(expiresAt) - Date.now() + 25));
      await gate.release();
      await assert.rejects(pending);
      assert.equal(
        (
          await w.service.getOwner(w.identity, {
            projectId: w.projectId,
            id: p.id,
          })
        ).currentDecision,
        null,
      );
      const { rows: counts } = await w.admin.pool.query(
        "select (select count(*) from foundation_idempotency where project_id=$1 and operation='onboarding.review')::int receipts,(select count(*) from foundation_audit where project_id=$1 and operation='onboarding.review' and decision='allowed')::int allowed",
        [w.projectId],
      );
      assert.deepEqual(counts[0], { receipts: 0, allowed: 0 });
    } finally {
      await gate.drop();
    }
  } finally {
    await w.close();
  }
});

test("foreign/future anchors and high precision proposal cutoffs stay scoped without Date truncation", async () => {
  const w = await fixture(),
    other = await fixture();
  try {
    const foreign = await other.propose();
    const request = {
      ...w.identity,
      operation: "onboarding.read" as const,
      projectId: w.projectId,
      environment: "test" as const,
      targetId: null,
      correlationId: randomUUID(),
    };
    await assert.rejects(
      w.port.withOwner(request, (r) =>
        r.listProposals({
          limit: 1,
          afterId: foreign.id,
          asOf: w.now().toISOString(),
        }),
      ),
      denied("INVALID_REFERENCE"),
    );
    const p = await w.propose(),
      { contentDigest: _digest, ...unsigned } = p,
      recordedAt = "2099-01-01T00:00:00.123456789Z",
      future = signed({ ...unsigned, id: randomUUID(), recordedAt });
    await w.runtime.pool.query(
      "insert into foundation_onboarding_proposal(id,project_id,environment,client_id,version,record,recorded_at) values($1,$2,'test',$3,1,$4,$5)",
      [future.id, w.projectId, w.issued.client.id, future, recordedAt],
    );
    await assert.rejects(
      w.port.withOwner(request, (r) =>
        r.listProposals({
          limit: 1,
          afterId: future.id,
          asOf: "2099-01-01T00:00:00.123456788Z",
        }),
      ),
      denied("INVALID_REFERENCE"),
    );
    const exact = await w.port.withOwner(request, (r) =>
      r.listProposals({ limit: 100, afterId: null, asOf: recordedAt }),
    );
    assert.equal(
      exact.items.find((x) => x.id === future.id)?.recordedAt,
      recordedAt,
    );
    const precision = (
      await w.admin.pool.query(
        "select foundation_onboarding_at_lte($1,$2) before,foundation_onboarding_at_lte($2,$1) after",
        [recordedAt, "2099-01-01T00:00:00.123456788Z"],
      )
    ).rows[0];
    assert.deepEqual(precision, { before: false, after: true });
  } finally {
    await Promise.all([w.close(), other.close()]);
  }
});

test("canonical capture immutability and byte validation preserve valid dependent operations and exact receipts", async () => {
  const w = await fixture();
  try {
    const captureId = randomUUID(),
      original = "Capture UTF-8 \u{1f680} source bytes\n";
    await w.admin.db.insert(capture).values({
      id: captureId,
      inputType: "text",
      originalContent: original,
      projectId: w.projectId,
    });
    const source = {
      projectId: w.projectId,
      sourceKind: "capture" as const,
      sourceId: captureId,
      sourceVersion: null,
      contentDigest: foundationByteDigest(original),
      locator: "A locator label is not source identity",
      observedAt: null,
      availability: "available" as const,
    };
    const evidence = await w.machine.recordEvidence(
      w.issued.token,
      source,
      randomUUID(),
    );
    assert.equal(evidence.record.contentDigest, foundationByteDigest(original));
    const proposalInput = { ...w.input(), evidenceIds: [evidence.record.id] },
      proposalKey = randomUUID();
    const proposed = await w.service.propose(
      w.issued.token,
      proposalKey,
      proposalInput,
    );
    assert.equal(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: proposed.record.id,
        })
      ).canApply,
      true,
    );
    const reviewed = await exactReview(w, proposed.record),
      applyKey = randomUUID(),
      applyInput = w.applyInput(proposed.record, reviewed.result.record);
    const committed = await w.service.apply(w.identity, applyKey, applyInput);
    const databaseError =
      (code: string, message?: string) => (error: unknown) => {
        let current = error;
        for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
          if (
            "code" in current &&
            current.code === code &&
            (!message ||
              ("message" in current &&
                typeof current.message === "string" &&
                current.message.includes(message)))
          )
            return true;
          current = "cause" in current ? current.cause : null;
        }
        return false;
      };
    const before = await sourceMutationCounts(w);
    await assert.rejects(
      w.admin.db
        .update(capture)
        .set({ originalContent: "Changed canonical capture bytes" })
        .where(eq(capture.id, captureId)),
      databaseError("23514", "capture source fields are immutable"),
    );
    const [unchanged] = await w.admin.db
      .select()
      .from(capture)
      .where(eq(capture.id, captureId));
    assert.equal(unchanged?.originalContent, original);
    // The row, scope and locator are valid controls; only the claimed digest differs from the canonical bytes.
    await assert.rejects(
      w.machine.recordEvidence(
        w.issued.token,
        {
          ...source,
          contentDigest: foundationByteDigest(
            "Changed canonical capture bytes",
          ),
        },
        randomUUID(),
      ),
      denied("INVALID_REFERENCE"),
    );
    await assert.rejects(
      w.admin.db.delete(capture).where(eq(capture.id, captureId)),
      databaseError("23503"),
    );
    assert.deepEqual(await sourceMutationCounts(w), before);
    const proposalReplay = await w.service.propose(
        w.issued.token,
        proposalKey,
        proposalInput,
      ),
      reviewReplay = await w.service.review(
        w.identity,
        reviewed.key,
        reviewed.input,
      ),
      applyReplay = await w.service.apply(w.identity, applyKey, applyInput);
    for (const replay of [proposalReplay, reviewReplay, applyReplay])
      assert.equal(replay.replayed, true);
    assert.deepEqual(proposalReplay.record, proposed.record);
    assert.deepEqual(reviewReplay.record, reviewed.result.record);
    assert.deepEqual(applyReplay.record, committed.record);
    assert.equal(applyReplay.correlationId, committed.correlationId);
    const afterReplay = await sourceMutationCounts(w);
    for (const key of [
      "resources",
      "links",
      "claims",
      "outcomes",
      "mutation_receipts",
      "evidence",
      "proposals",
      "decisions",
    ])
      assert.equal(afterReplay[key], before[key]);
    // Forbidden source mutation left the original source valid for new work.
    const next = await w.propose(undefined, [evidence.record.id]);
    assert.equal(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: next.id,
        })
      ).canApply,
      true,
    );
    const approved = await w.review(next),
      beforeApply = await w.counts();
    await w.service.apply(
      w.identity,
      randomUUID(),
      w.applyInput(next, approved.record),
    );
    const afterApply = await w.counts();
    for (const key of ["resources", "links", "claims", "outcomes", "receipts"])
      assert.equal(afterApply[key] - beforeApply[key], 1);
  } finally {
    await w.close();
  }
});

test("canonical knowledge revisions preserve historical evidence and reject changed current bytes without phantom effects", async () => {
  const w = await fixture();
  try {
    const source = await canonicalKnowledge(
      w,
      "Knowledge version one \u{1f680}",
      "Version one title",
    );
    const input1 = {
      projectId: w.projectId,
      sourceKind: "knowledge_revision" as const,
      sourceId: source.knowledgeId,
      sourceVersion: "1",
      contentDigest: foundationByteDigest(source.content),
      locator: "Knowledge locator label",
      observedAt: null,
      availability: "available" as const,
    };
    const evidence1 = await w.machine.recordEvidence(
      w.issued.token,
      input1,
      randomUUID(),
    );
    const original = await w.propose(undefined, [evidence1.record.id]);
    assert.equal(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: original.id,
        })
      ).canApply,
      true,
    );
    const secondContent = "Knowledge version two UTF-8\n",
      secondTitle = "Version two title";
    await w.admin.db.transaction(async (tx) => {
      await tx
        .update(knowledgeItem)
        .set({
          title: secondTitle,
          content: secondContent,
          version: 2,
          updatedAt: w.now(),
        })
        .where(eq(knowledgeItem.id, source.knowledgeId));
      await tx.insert(knowledgeItemRevision).values({
        id: randomUUID(),
        knowledgeItemId: source.knowledgeId,
        version: 2,
        previousTitle: source.title,
        previousContent: source.content,
        title: secondTitle,
        content: secondContent,
        actor: "local-user:unattributed",
      });
    });
    // Version 1 resolves revision 2.previousContent after the normal canonical history is present.
    assert.equal(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: original.id,
        })
      ).canApply,
      true,
    );
    const oldAgain = await w.machine.recordEvidence(
      w.issued.token,
      input1,
      randomUUID(),
    );
    assert.equal(oldAgain.record.sourceVersion, "1");
    const input2 = {
      ...input1,
      sourceVersion: "2",
      contentDigest: foundationByteDigest(secondContent),
    };
    const evidence2 = await w.machine.recordEvidence(
      w.issued.token,
      input2,
      randomUUID(),
    );
    const proposalInput = { ...w.input(), evidenceIds: [evidence2.record.id] },
      proposalKey = randomUUID();
    const proposed = await w.service.propose(
      w.issued.token,
      proposalKey,
      proposalInput,
    );
    const reviewed = await exactReview(w, proposed.record),
      applyKey = randomUUID(),
      applyInput = w.applyInput(proposed.record, reviewed.result.record);
    const committed = await w.service.apply(w.identity, applyKey, applyInput);
    const pending = await w.propose(undefined, [evidence2.record.id]),
      pendingDecision = await w.review(pending);
    // A canonical writer drifts the bytes of the current version without appending a new version.
    await w.admin.db
      .update(knowledgeItem)
      .set({ content: "Drifted current version two bytes", updatedAt: w.now() })
      .where(eq(knowledgeItem.id, source.knowledgeId));
    // The historical version-one bytes still resolve from the real immutable history shape.
    const oldProposal = await w.propose(undefined, [evidence1.record.id]);
    assert.equal(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: oldProposal.id,
        })
      ).canApply,
      true,
    );
    const before = await sourceMutationCounts(w);
    assert.deepEqual(
      (
        await w.service.preview(w.identity, {
          projectId: w.projectId,
          id: pending.id,
        })
      ).blockers,
      ["source_unavailable"],
    );
    await assert.rejects(
      w.machine.recordEvidence(w.issued.token, input2, randomUUID()),
      denied("INVALID_REFERENCE"),
    );
    await assert.rejects(
      w.service.propose(w.issued.token, randomUUID(), {
        ...w.input(),
        evidenceIds: [evidence2.record.id],
      }),
      denied("INVALID_REFERENCE"),
    );
    await assert.rejects(w.review(pending, 1), denied("APPROVAL_REQUIRED"));
    await assert.rejects(
      w.service.apply(
        w.identity,
        randomUUID(),
        w.applyInput(pending, pendingDecision.record),
      ),
      denied("VERSION_CONFLICT"),
    );
    assert.deepEqual(await sourceMutationCounts(w), before);
    const proposalReplay = await w.service.propose(
        w.issued.token,
        proposalKey,
        proposalInput,
      ),
      reviewReplay = await w.service.review(
        w.identity,
        reviewed.key,
        reviewed.input,
      ),
      applyReplay = await w.service.apply(w.identity, applyKey, applyInput);
    assert.equal(proposalReplay.replayed, true);
    assert.equal(reviewReplay.replayed, true);
    assert.equal(applyReplay.replayed, true);
    assert.deepEqual(proposalReplay.record, proposed.record);
    assert.deepEqual(reviewReplay.record, reviewed.result.record);
    assert.deepEqual(applyReplay.record, committed.record);
    const afterReplay = await sourceMutationCounts(w);
    for (const key of [
      "resources",
      "links",
      "claims",
      "outcomes",
      "mutation_receipts",
      "evidence",
      "proposals",
      "decisions",
    ])
      assert.equal(afterReplay[key], before[key]);
  } finally {
    await w.close();
  }
});

test("deleted unreferenced canonical Capture and Knowledge sources are unavailable at real evidence intake", async () => {
  const w = await fixture();
  try {
    const source = await canonicalKnowledge(
      w,
      "Deleted knowledge source",
      "Deleted note",
    );
    const captureId = randomUUID(),
      captureContent = "Deleted capture source";
    await w.admin.db.insert(capture).values({
      id: captureId,
      inputType: "text",
      originalContent: captureContent,
      projectId: w.projectId,
    });
    await w.admin.db.delete(capture).where(eq(capture.id, captureId));
    await w.admin.db
      .delete(knowledgeItem)
      .where(eq(knowledgeItem.id, source.knowledgeId));
    const before = await sourceMutationCounts(w);
    for (const input of [
      {
        projectId: w.projectId,
        sourceKind: "capture" as const,
        sourceId: captureId,
        sourceVersion: null,
        contentDigest: foundationByteDigest(captureContent),
        locator: "Deleted capture",
        observedAt: null,
        availability: "available" as const,
      },
      {
        projectId: w.projectId,
        sourceKind: "knowledge_revision" as const,
        sourceId: source.knowledgeId,
        sourceVersion: "1",
        contentDigest: foundationByteDigest(source.content),
        locator: "Deleted knowledge",
        observedAt: null,
        availability: "available" as const,
      },
    ])
      await assert.rejects(
        w.machine.recordEvidence(w.issued.token, input, randomUUID()),
        denied("INVALID_REFERENCE"),
      );
    assert.deepEqual(await sourceMutationCounts(w), before);
    const { rows } = await w.admin.pool.query(
      "select (select count(*) from capture where id=$1)::int captures,(select count(*) from knowledge_item where id=$2)::int knowledge",
      [captureId, source.knowledgeId],
    );
    assert.deepEqual(rows[0], { captures: 0, knowledge: 0 });
  } finally {
    await w.close();
  }
});

test("raw signed onboarding URL proposals use the same bounded authority policy", async () => {
  const w = await fixture();
  try {
    const p = await w.propose();
    assert.equal(p.target.mode, "create");
    const valid = [
      "https://example.test",
      "https://example.test/a\u2028b\u2029c",
      "HTTP://LOCALHOST:0/a",
      "https://host.example:65535/路径?q=é#part",
      "http://192.168.0.1:8080/",
      "https://[::1]:443/",
      "http://[2001:db8:0:0:0:0:0:1]/",
      "http://[::ffff:192.168.0.1]/",
      "https://host.example./",
    ];
    const invalid = [
      "https://example.test:99999",
      "https://[bad",
      "http://[::ffff:192.168.01.1]/",
      "https://example.test:",
      "https://@example.test",
      "https://user:secret@example.test",
      "https://127.1",
      "http://0x7f000001",
      "http://a.123",
      "https://xn--broken-",
      "https://例子.test/",
      "https://host..test",
      "https://host.test/a\nb",
      "https://host.test/a b",
      "https://host.test/a\\b",
    ];
    for (const externalUrl of [...valid, ...invalid]) {
      const { contentDigest: _old, ...unsigned } = p;
      const record: FoundationOnboardingProposal = signed({
        ...unsigned,
        id: randomUUID(),
        target: { ...p.target, externalUrl },
      });
      const insertion = () =>
        w.runtime.pool.query(
          "insert into foundation_onboarding_proposal(id,project_id,environment,client_id,version,record,recorded_at) values($1,$2,'test',$3,1,$4,$5)",
          [
            record.id,
            w.projectId,
            w.issued.client.id,
            record,
            record.recordedAt,
          ],
        );
      if (invalid.includes(externalUrl))
        await assert.rejects(
          insertion(),
          sqlError("23514", "foundation_onboarding_proposal_valid"),
          externalUrl,
        );
      else {
        await insertion();
        assert.equal(
          (
            await w.service.get(w.issued.token, {
              projectId: w.projectId,
              id: record.id,
            })
          ).proposal.target.mode,
          "create",
        );
      }
    }
  } finally {
    await w.close();
  }
});
