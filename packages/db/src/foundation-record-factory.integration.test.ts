import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import {
  createFoundationOwnerService,
  type FoundationMachineRequest,
  type FoundationOwnerRequest,
  type FoundationRecordPort,
} from "@commandry/application";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import {
  createFoundationAccessRepository,
  createFoundationOwnerRecordsAccessRepository,
  createFoundationRecordsAccessRepository,
  type FoundationMachineRecordFactory,
  type FoundationOwnerRecordFactory,
} from "./foundation-access-repository";
import type { FoundationTransaction } from "./foundation-record-repository";
import {
  foundationAudit,
  foundationClient,
  foundationIdempotency,
} from "./foundation-schema";
import { project } from "./schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL integration harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;
const denied = (error: unknown) => error instanceof FoundationError;

type Marker = {
  projectId: string;
  principalId: string;
  clientId: string | null;
  operation: string;
  environment: string;
  correlationId: string;
  targetId: string | null;
  at: string;
  marker: string;
  transactionId: string;
};
type MachineRecords = FoundationRecordPort & {
  machineMarker(marker: string): Promise<Marker>;
};
type OwnerRecords = FoundationRecordPort & {
  ownerMarker(marker: string): Promise<Marker>;
};

async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 3 });
  // Every factory method, core receipt and audit must use this one connection.
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = randomUUID();
  const otherId = randomUUID();
  const originalName = "Trusted record factory fixture";
  await admin.db.insert(project).values([
    { id: projectId, name: originalName },
    { id: otherId, name: "Outside record factory scope" },
  ]);
  let time = Date.now();
  const now = () => new Date(time);
  const identity = {
    principalId: "user:record-factory-owner",
    expiresAt: new Date(time + 7_200_000).toISOString(),
  };
  const core = createFoundationAccessRepository(runtime.db, { now });
  const owner = createFoundationOwnerService(core, identity, {
    environment: "test",
    now,
  });
  const issued = await owner.createClient(
    {
      name: "Synthetic record factory client",
      projectId,
      environment: "test",
      operations: ["foundation.read"],
      ttlSeconds: 3600,
    },
    "record-factory-client",
  );
  const tokenDigest = foundationTokenDigest(issued.token);
  const state = {
    machineCalls: 0,
    ownerCalls: 0,
    markerCalls: 0,
    throwMachine: false,
    throwOwner: false,
  };
  const marker = async (
    tx: FoundationTransaction,
    request:
      | FoundationOwnerRequest
      | (FoundationMachineRequest & {
          principalId: string;
          clientId: string;
        }),
    clientId: string | null,
    clock: () => Date,
    value: string,
  ): Promise<Marker> => {
    state.markerCalls += 1;
    // A synthetic fixture effect only; this method grants no product read API.
    await tx.execute(
      sql`select set_config('commandry.record_factory_marker', ${value}, true)`,
    );
    await tx
      .update(project)
      .set({ name: value })
      .where(eq(project.id, projectId));
    const result = await tx.execute<{
      marker: string;
      transactionId: string;
    }>(sql`select current_setting('commandry.record_factory_marker') as marker,
      txid_current()::text as "transactionId"`);
    assert.ok(result.rows[0]);
    return {
      projectId: request.projectId,
      principalId: request.principalId,
      clientId,
      operation: request.operation,
      environment: request.environment,
      correlationId: request.correlationId,
      targetId: request.targetId,
      at: clock().toISOString(),
      ...result.rows[0],
    };
  };
  const machineFactory: FoundationMachineRecordFactory<MachineRecords> = (
    tx,
    request,
    records,
    clock,
  ) => {
    state.machineCalls += 1;
    assert.equal(clock, now);
    assert.ok(request.tokenDigest === tokenDigest);
    if (state.throwMachine)
      throw new FoundationError("FORBIDDEN", "Synthetic factory denial");
    return {
      ...records,
      machineMarker: (value) =>
        marker(tx, request, request.clientId, clock, value),
    };
  };
  const ownerFactory: FoundationOwnerRecordFactory<OwnerRecords> = (
    tx,
    request,
    records,
    clock,
  ) => {
    state.ownerCalls += 1;
    assert.equal(clock, now);
    if (state.throwOwner)
      throw new FoundationError("FORBIDDEN", "Synthetic owner factory denial");
    return {
      ...records,
      ownerMarker: (value) => marker(tx, request, null, clock, value),
    };
  };
  const access = createFoundationRecordsAccessRepository(
    runtime.db,
    { machine: machineFactory, owner: ownerFactory },
    { now },
  );
  const request = (): FoundationMachineRequest => ({
    operation: "foundation.read",
    projectId,
    environment: "test",
    correlationId: randomUUID(),
    targetId: randomUUID(),
    tokenDigest,
  });
  const ownerRequest = (): FoundationOwnerRequest => ({
    ...identity,
    operation: "foundation.read",
    projectId,
    environment: "test",
    correlationId: randomUUID(),
    targetId: randomUUID(),
  });
  return {
    admin,
    runtime,
    core,
    access,
    machineFactory,
    ownerFactory,
    projectId,
    otherId,
    originalName,
    identity,
    issued,
    state,
    request,
    ownerRequest,
    now,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    audit: (correlationId: string) =>
      admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.correlationId, correlationId)),
    receipts: (correlationId: string) =>
      admin.db
        .select()
        .from(foundationIdempotency)
        .where(eq(foundationIdempotency.correlationId, correlationId)),
    name: async () => {
      const [row] = await admin.db
        .select({ name: project.name })
        .from(project)
        .where(eq(project.id, projectId));
      return row?.name;
    },
    close: () => Promise.all([runtime.close(), admin.close()]),
  };
}

test("independent factories receive trusted scope and keep existing constructors", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(Object.keys(f.access).sort(), ["withClient", "withOwner"]);
    const request = {
      ...f.request(),
      principalId: "user:forged-principal",
      clientId: randomUUID(),
    };
    const result = await f.access.withClient(
      request,
      async (client, records) => {
        assert.equal(client.id, f.issued.client.id);
        assert.equal(client.projectId, f.projectId);
        assert.equal(await records.getEvidence(randomUUID()), null);
        return records.machineMarker("machine fixture effect");
      },
    );
    assert.deepEqual(result, {
      projectId: f.projectId,
      principalId: `foundation-client:${f.issued.client.id}`,
      clientId: f.issued.client.id,
      operation: request.operation,
      environment: request.environment,
      correlationId: request.correlationId,
      targetId: request.targetId,
      at: f.now().toISOString(),
      marker: "machine fixture effect",
      transactionId: result.transactionId,
    });
    assert.match(result.transactionId, /^\d+$/);
    assert.equal(await f.name(), result.marker);
    assert.ok(!("tokenDigest" in result));
    assert.equal(f.state.machineCalls, 1);
    assert.equal(f.state.ownerCalls, 0);
    const [audit] = await f.audit(request.correlationId);
    assert.equal(audit?.principalId, result.principalId);
    assert.equal(audit?.clientId, result.clientId);
    assert.equal(audit?.code, "OK");

    const ownerRequest = f.ownerRequest();
    const ownerResult = await f.access.withOwner(ownerRequest, (records) =>
      records.ownerMarker("owner fixture effect"),
    );
    assert.equal(ownerResult.principalId, f.identity.principalId);
    assert.equal(ownerResult.clientId, null);
    assert.equal(ownerResult.correlationId, ownerRequest.correlationId);
    assert.equal(f.state.ownerCalls, 1);
    assert.equal(f.state.machineCalls, 1);

    assert.equal(
      await f.core.withClient(f.request(), (_client, records) =>
        records.getConfiguration(randomUUID()),
      ),
      null,
    );
    assert.equal(
      await f.core.withOwner(f.ownerRequest(), (records) =>
        records.getConfiguration(randomUUID()),
      ),
      null,
    );
    const legacy = createFoundationOwnerRecordsAccessRepository(
      f.runtime.db,
      f.ownerFactory,
      { now: f.now },
    );
    assert.deepEqual(Object.keys(legacy), ["withOwner"]);
    const legacyResult = await legacy.withOwner(f.ownerRequest(), (records) =>
      records.ownerMarker("legacy owner factory effect"),
    );
    assert.equal(legacyResult.principalId, f.identity.principalId);
    assert.equal(f.state.ownerCalls, 2);
  } finally {
    await f.close();
  }
});

for (const rejection of [
  "project",
  "environment",
  "operation",
  "revoked",
  "expired",
] as const) {
  test(`machine ${rejection} denial precedes factory invocation`, async () => {
    const f = await fixture();
    try {
      const request = f.request();
      if (rejection === "project") request.projectId = f.otherId;
      if (rejection === "environment") request.environment = "local";
      if (rejection === "operation") request.operation = "configuration.record";
      if (rejection === "revoked")
        await f.admin.db
          .update(foundationClient)
          .set({ revokedAt: f.now() })
          .where(eq(foundationClient.id, f.issued.client.id));
      if (rejection === "expired") f.advance(3_600_000);
      let callbackCalls = 0;
      await assert.rejects(
        f.access.withClient(request, async (_client, records) => {
          callbackCalls += 1;
          return records.machineMarker("unreachable fixture effect");
        }),
        denied,
      );
      assert.equal(callbackCalls, 0);
      assert.equal(f.state.machineCalls, 0);
      assert.equal(await f.name(), f.originalName);
      const audits = await f.audit(request.correlationId);
      assert.equal(audits.length, 1);
      assert.equal(audits[0]?.decision, "denied");
      assert.equal(audits[0]?.projectId, f.projectId);
      assert.equal(audits[0]?.environment, "test");
      assert.equal(
        audits[0]?.principalId,
        `foundation-client:${f.issued.client.id}`,
      );
    } finally {
      await f.close();
    }
  });
}

test("known factory failures use the bounded denial audit route", async () => {
  const f = await fixture();
  try {
    f.state.throwMachine = true;
    f.state.throwOwner = true;
    const machineRequest = f.request();
    const ownerRequest = f.ownerRequest();
    let callbackCalls = 0;
    await assert.rejects(
      f.access.withClient(machineRequest, async () => {
        callbackCalls += 1;
      }),
      denied,
    );
    await assert.rejects(
      f.access.withOwner(ownerRequest, async () => {
        callbackCalls += 1;
      }),
      denied,
    );
    assert.equal(callbackCalls, 0);
    assert.equal(f.state.machineCalls, 1);
    assert.equal(f.state.ownerCalls, 1);
    for (const request of [machineRequest, ownerRequest]) {
      const audits = await f.audit(request.correlationId);
      assert.equal(audits.length, 1);
      assert.equal(audits[0]?.decision, "denied");
      assert.equal(audits[0]?.code, "FORBIDDEN");
      assert.ok(!JSON.stringify(audits).includes("Synthetic"));
      assert.ok(!("tokenDigest" in audits[0]!));
    }
  } finally {
    await f.close();
  }
});

test("core receipts replay through extended records with REPLAYED audit", async () => {
  const f = await fixture();
  try {
    const request = f.request();
    const perform = () =>
      f.access.withClient(request, (_client, records) =>
        records.idempotent(
          "same-factory-key",
          foundationDigest({ fixture: 1 }),
          () => records.machineMarker("one immutable fixture effect"),
        ),
      );
    const first = await perform();
    const second = await perform();
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.value, first.value);
    assert.equal(f.state.machineCalls, 2);
    assert.equal(f.state.markerCalls, 1);
    const audits = await f.audit(request.correlationId);
    assert.deepEqual(audits.map((row) => row.code).sort(), ["OK", "REPLAYED"]);
    assert.ok(audits.every((row) => row.decision === "allowed"));
    const receipts = await f.receipts(request.correlationId);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]?.principalId, first.value.principalId);
    assert.equal(receipts[0]?.resultDigest, foundationDigest(first.value));
    assert.ok(!("tokenDigest" in (receipts[0]?.result as Marker)));
  } finally {
    await f.close();
  }
});

test("audit failure rolls back factory methods and core receipts atomically", async () => {
  const f = await fixture();
  const request = f.request();
  const suffix = randomUUID().replaceAll("-", "");
  const functionName = `record_factory_audit_${suffix}`;
  const triggerName = `record_factory_audit_${suffix}`;
  let functionCreated = false;
  let triggerCreated = false;
  try {
    await f.admin.pool
      .query(`CREATE FUNCTION "${functionName}"() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.correlation_id = '${request.correlationId}'::uuid THEN
          RAISE EXCEPTION 'synthetic audit unavailable';
        END IF;
        RETURN NEW;
      END $$`);
    functionCreated = true;
    await f.admin.pool
      .query(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON foundation_audit
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    triggerCreated = true;
    await assert.rejects(
      f.access.withClient(request, (_client, records) =>
        records.idempotent(
          "audit-rollback",
          foundationDigest({ fixture: 2 }),
          () => records.machineMarker("must roll back fixture effect"),
        ),
      ),
    );
    assert.equal(f.state.markerCalls, 1);
    assert.equal(await f.name(), f.originalName);
    assert.equal((await f.receipts(request.correlationId)).length, 0);
    assert.equal((await f.audit(request.correlationId)).length, 0);
  } finally {
    if (triggerCreated)
      await f.admin.pool.query(
        `DROP TRIGGER "${triggerName}" ON foundation_audit`,
      );
    if (functionCreated)
      await f.admin.pool.query(`DROP FUNCTION "${functionName}"()`);
    await f.close();
  }
});

test("late client expiry withholds delivery and rolls back effects and receipts", async () => {
  const f = await fixture();
  try {
    const request = f.request();
    await assert.rejects(
      f.access.withClient(request, async (_client, records) => {
        const result = await records.idempotent(
          "late-expiry",
          foundationDigest({ fixture: 3 }),
          () => records.machineMarker("expired fixture effect"),
        );
        f.advance(3_600_000);
        return result;
      }),
      (error: unknown) =>
        error instanceof FoundationError && error.code === "EXPIRED",
    );
    assert.equal(f.state.markerCalls, 1);
    assert.equal(await f.name(), f.originalName);
    assert.equal((await f.receipts(request.correlationId)).length, 0);
    const audits = await f.audit(request.correlationId);
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.decision, "denied");
    assert.equal(audits[0]?.code, "EXPIRED");
  } finally {
    await f.close();
  }
});

test("owner factory retains expiry checks before invocation and after callback", async () => {
  const f = await fixture();
  try {
    const expired = { ...f.ownerRequest(), expiresAt: f.now().toISOString() };
    await assert.rejects(
      f.access.withOwner(expired, (records) =>
        records.ownerMarker("unreachable"),
      ),
      denied,
    );
    assert.equal(f.state.ownerCalls, 0);
    const request = f.ownerRequest();
    await assert.rejects(
      f.access.withOwner(request, async (records) => {
        const result = await records.ownerMarker(
          "expired owner fixture effect",
        );
        f.advance(7_200_000);
        return result;
      }),
      denied,
    );
    assert.equal(f.state.ownerCalls, 1);
    assert.equal(await f.name(), f.originalName);
    const audits = await f.audit(request.correlationId);
    assert.equal(audits.length, 1);
    assert.equal(audits[0]?.decision, "denied");
    assert.equal(audits[0]?.code, "EXPIRED");
  } finally {
    await f.close();
  }
});
