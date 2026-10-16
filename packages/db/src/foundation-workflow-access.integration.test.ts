import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq } from "drizzle-orm";
import {
  createFoundationOwnerService,
  type FoundationOwnerRequest,
} from "@commandry/application";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationWorkflowAccessRepository } from "./foundation-workflow-access-repository";
import { foundationAudit, foundationIdempotency } from "./foundation-schema";
import { project, session, user } from "./schema";

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
  const admin = createDatabase({ connectionString: adminUrl!, max: 4 });
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  let time = Date.now();
  const now = () => new Date(time);
  const expiresAt = new Date(time + 3_600_000).toISOString();
  await admin.db
    .insert(project)
    .values({ id: projectId, name: "Disposable workflow session" });
  await admin.db.insert(user).values({
    id: userId,
    name: "Workflow fixture owner",
    email: `workflow-${userId}@example.test`,
  });
  await admin.db.insert(session).values({
    id: sessionId,
    userId,
    token: "disposable-session-" + randomUUID(),
    expiresAt: new Date(expiresAt),
  });
  const identity = { principalId: "user:" + userId, sessionId, expiresAt };
  const owner = createFoundationOwnerService(
    createFoundationAccessRepository(runtime.db, { now }),
    identity,
    { environment: "test", now },
  );
  const port = createFoundationWorkflowAccessRepository(
    runtime.db,
    (_tx, _context, records) => records,
    {
      machineOperations: ["improvement.read", "improvement.propose"],
      ownerOperations: ["improvement.read", "improvement.review"],
      lockNamespace: "foundation-evaluation:",
      now,
    },
  );
  const request = (
    overrides: Partial<FoundationOwnerRequest> = {},
  ): FoundationOwnerRequest => ({
    ...identity,
    operation: "improvement.review",
    projectId,
    environment: "test",
    correlationId: randomUUID(),
    targetId: randomUUID(),
    ...overrides,
  });
  const issue = (
    operations: (
      "improvement.read" | "improvement.propose" | "foundation.read"
    )[],
    key: string,
  ) =>
    owner.createClient(
      { name: key, projectId, environment: "test", operations, ttlSeconds: 60 },
      key,
    );
  const counts = async () => ({
    receipts: (
      await admin.db
        .select()
        .from(foundationIdempotency)
        .where(
          and(
            eq(foundationIdempotency.projectId, projectId),
            eq(foundationIdempotency.operation, "improvement.review"),
          ),
        )
    ).length,
    allowed: (
      await admin.db
        .select()
        .from(foundationAudit)
        .where(
          and(
            eq(foundationAudit.projectId, projectId),
            eq(foundationAudit.operation, "improvement.review"),
            eq(foundationAudit.decision, "allowed"),
          ),
        )
    ).length,
  });
  return {
    admin,
    runtime,
    projectId,
    userId,
    sessionId,
    now,
    identity,
    port,
    request,
    issue,
    counts,
    advance: (ms: number) => {
      time += ms;
    },
    close: () => Promise.all([runtime.close(), admin.close()]),
  };
}
type World = Awaited<ReturnType<typeof fixture>>;
async function waitForLock(world: World, pid: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await world.admin.pool.query(
      "select wait_event_type from pg_stat_activity where pid = $1",
      [pid],
    );
    if (result.rows[0]?.wait_event_type === "Lock") return;
    await delay(10);
  }
  assert.fail("Disposable workflow did not reach the expected lock");
}

test("workflow owner uses a real canonical session and one transaction for receipt and audit", async () => {
  const world = await fixture();
  try {
    const input = { proof: "disposable PostgreSQL" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await world.port.withOwner(world.request(), (records) =>
        records.idempotent(
          "same-operation",
          foundationDigest(input),
          async () => input,
        ),
      );
      assert.deepEqual(result, { value: input, replayed: attempt === 1 });
    }
    assert.deepEqual(await world.counts(), { receipts: 1, allowed: 2 });
  } finally {
    await world.close();
  }
});

test("missing, wrong-user, revoked and overstated owner sessions never enter the callback", async () => {
  const world = await fixture();
  try {
    const absent = world.request();
    delete absent.sessionId;
    const requests = [
      absent,
      world.request({ sessionId: randomUUID() }),
      world.request({ principalId: "user:" + randomUUID() }),
      world.request({
        expiresAt: new Date(world.now().getTime() + 7_200_000).toISOString(),
      }),
    ];
    for (const request of requests) {
      let called = false;
      await assert.rejects(
        world.port.withOwner(request, async () => {
          called = true;
          return { forbidden: true };
        }),
        (error: unknown) =>
          error instanceof FoundationError &&
          ["FORBIDDEN", "EXPIRED"].includes(error.code),
      );
      assert.equal(called, false);
    }
    await world.admin.db.delete(session).where(eq(session.id, world.sessionId));
    await assert.rejects(
      world.port.withOwner(world.request(), async () => ({ forbidden: true })),
      denied("FORBIDDEN"),
    );
    assert.deepEqual(await world.counts(), { receipts: 0, allowed: 0 });
  } finally {
    await world.close();
  }
});

test("new machine scopes are explicit and legacy read cannot call a workflow", async () => {
  const world = await fixture();
  try {
    const old = await world.issue(["foundation.read"], "legacy");
    const issued = await world.issue(["improvement.read"], "workflow-read");
    const request = (token: string) => ({
      operation: "improvement.read" as const,
      projectId: world.projectId,
      environment: "test" as const,
      targetId: null,
      correlationId: randomUUID(),
      tokenDigest: foundationTokenDigest(token),
    });
    let called = false;
    await assert.rejects(
      world.port.withClient(request(old.token), async () => {
        called = true;
        return {};
      }),
      denied("FORBIDDEN"),
    );
    assert.equal(called, false);
    assert.deepEqual(
      await world.port.withClient(request(issued.token), async (client) => ({
        operations: client.operations,
      })),
      { operations: ["improvement.read"] },
    );
    assert.deepEqual(old.client.operations, ["foundation.read"]);
  } finally {
    await world.close();
  }
});

test("feature composition cannot mix namespaces or grant machine review authority", async () => {
  const world = await fixture();
  try {
    for (const machineOperations of [
      ["improvement.review"],
      ["finding.read"],
      ["foundation.read"],
      ["improvement.read", "improvement.read"],
    ] as const) {
      assert.throws(
        () =>
          createFoundationWorkflowAccessRepository(
            world.runtime.db,
            (_tx, _context, records) => records,
            {
              machineOperations,
              ownerOperations: ["improvement.review"],
              lockNamespace: "foundation-evaluation:",
            },
          ),
        denied("FORBIDDEN"),
      );
    }
  } finally {
    await world.close();
  }
});

test("owner revocation committed before the session lock blocks the operation", async () => {
  const world = await fixture();
  const blocker = await world.admin.pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await blocker.query("begin");
    await blocker.query("select id from session where id=$1 for update", [
      world.sessionId,
    ]);
    const { rows } = await world.runtime.pool.query(
      "select pg_backend_pid() as pid",
    );
    let called = false;
    pending = world.port.withOwner(world.request(), async () => {
      called = true;
      return {};
    });
    const rejected = assert.rejects(pending, denied("FORBIDDEN"));
    await waitForLock(world, rows[0].pid as number);
    await blocker.query("delete from session where id=$1", [world.sessionId]);
    await blocker.query("commit");
    await rejected;
    assert.equal(called, false);
    assert.deepEqual(await world.counts(), { receipts: 0, allowed: 0 });
  } finally {
    await blocker.query("rollback");
    blocker.release();
    if (pending) await pending.catch(() => {});
    await world.close();
  }
});

test("expiry while waiting for the feature lock rolls back without a receipt", async () => {
  const world = await fixture();
  const blocker = await world.admin.pool.connect();
  let pending: Promise<unknown> | undefined;
  try {
    await blocker.query("begin");
    await blocker.query(
      "select pg_advisory_xact_lock(hashtextextended($1,0))",
      ["foundation-evaluation:" + world.projectId],
    );
    const { rows } = await world.runtime.pool.query(
      "select pg_backend_pid() as pid",
    );
    let called = false;
    pending = world.port.withOwner(world.request(), async (records) => {
      called = true;
      return records.idempotent(
        "too-late",
        foundationDigest({ value: 1 }),
        async () => ({ value: 1 }),
      );
    });
    const rejected = assert.rejects(pending, denied("EXPIRED"));
    await waitForLock(world, rows[0].pid as number);
    world.advance(3_600_000);
    await blocker.query("commit");
    await rejected;
    assert.equal(called, false);
    assert.deepEqual(await world.counts(), { receipts: 0, allowed: 0 });
  } finally {
    await blocker.query("rollback");
    blocker.release();
    if (pending) await pending.catch(() => {});
    await world.close();
  }
});

test("an audit failure rolls back the same-transaction operation receipt", async () => {
  const world = await fixture();
  const suffix = world.projectId.replaceAll("-", "");
  const name = "workflow_audit_" + suffix;
  try {
    await world.admin.pool.query(
      `create function ${name}() returns trigger language plpgsql as $$ begin if NEW.project_id = '${world.projectId}'::uuid and NEW.operation = 'improvement.review' and NEW.decision = 'allowed' then raise exception 'disposable injected audit failure'; end if; return NEW; end $$`,
    );
    await world.admin.pool.query(
      `create trigger ${name} before insert on foundation_audit for each row execute function ${name}()`,
    );
    await assert.rejects(
      world.port.withOwner(world.request(), (records) =>
        records.idempotent(
          "audit-failure",
          foundationDigest({ value: 1 }),
          async () => ({ value: 1 }),
        ),
      ),
    );
    assert.deepEqual(await world.counts(), { receipts: 0, allowed: 0 });
  } finally {
    await world.admin.pool.query(
      `drop trigger if exists ${name} on foundation_audit`,
    );
    await world.admin.pool.query(`drop function if exists ${name}()`);
    await world.close();
  }
});

test("expiry after callback while the allowed audit waits rolls back its receipt", async () => {
  const world = await fixture();
  const blocker = await world.admin.pool.connect();
  const name = "workflow_audit_wait_" + world.projectId.replaceAll("-", "");
  const key = "disposable-audit:" + world.projectId;
  let pending: Promise<unknown> | undefined;
  try {
    await world.admin.pool.query(
      `create function ${name}() returns trigger language plpgsql as $$ begin if NEW.project_id = '${world.projectId}'::uuid and NEW.operation = 'improvement.review' and NEW.decision = 'allowed' then perform pg_advisory_xact_lock(hashtextextended('${key}',0)); end if; return NEW; end $$`,
    );
    await world.admin.pool.query(
      `create trigger ${name} before insert on foundation_audit for each row execute function ${name}()`,
    );
    await blocker.query("begin");
    await blocker.query(
      "select pg_advisory_xact_lock(hashtextextended($1,0))",
      [key],
    );
    const { rows } = await world.runtime.pool.query(
      "select pg_backend_pid() as pid",
    );
    let performed = false;
    pending = world.port.withOwner(world.request(), async (records) => {
      performed = true;
      return records.idempotent(
        "audit-expiry",
        foundationDigest({ value: 1 }),
        async () => ({ value: 1 }),
      );
    });
    const rejected = assert.rejects(pending, denied("EXPIRED"));
    await waitForLock(world, rows[0].pid as number);
    assert.equal(performed, true);
    world.advance(3_600_000);
    await blocker.query("commit");
    await rejected;
    assert.deepEqual(await world.counts(), { receipts: 0, allowed: 0 });
  } finally {
    await blocker.query("rollback");
    blocker.release();
    if (pending) await pending.catch(() => {});
    await world.admin.pool.query(
      `drop trigger if exists ${name} on foundation_audit`,
    );
    await world.admin.pool.query(`drop function if exists ${name}()`);
    await world.close();
  }
});

test("a session revoker waits for an already authorized transaction", async () => {
  const world = await fixture();
  const revoker = await world.admin.pool.connect();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let deletion: Promise<unknown> | undefined;
  const outcome = world.port
    .withOwner(world.request(), async (records) => {
      const result = await records.idempotent(
        "before-revocation",
        foundationDigest({ value: 1 }),
        async () => ({ value: 1 }),
      );
      entered!();
      await gate;
      return result;
    })
    .then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
  try {
    await started;
    const { rows } = await revoker.query("select pg_backend_pid() as pid");
    deletion = revoker.query("delete from session where id=$1", [
      world.sessionId,
    ]);
    await waitForLock(world, rows[0].pid as number);
    release!();
    const result = await outcome;
    await deletion;
    if (result.error !== null) assert.ok(denied("FORBIDDEN")(result.error));
    else
      assert.deepEqual(result.value, { value: { value: 1 }, replayed: false });
    assert.deepEqual(await world.counts(), { receipts: 1, allowed: 1 });
    await assert.rejects(
      world.port.withOwner(world.request(), async () => ({})),
      denied("FORBIDDEN"),
    );
  } finally {
    release?.();
    await outcome;
    if (deletion) await deletion;
    revoker.release();
    await world.close();
  }
});
