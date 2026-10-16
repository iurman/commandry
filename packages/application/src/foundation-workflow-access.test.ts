import assert from "node:assert/strict";
import { test } from "vitest";
import { foundationAliasSchema } from "@commandry/contracts";
import type { FoundationClient } from "@commandry/contracts";
import { FoundationError } from "@commandry/domain";
import {
  createFoundationWorkflowAccess,
  foundationWorkflowInput,
  foundationWorkflowOutput,
  FoundationWorkflowUnavailableError,
  type FoundationWorkflowPort,
} from "./foundation-workflow-access";
import type {
  FoundationMachineRequest,
  FoundationOwnerRequest,
} from "./agent-foundation";

const projectId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";
const token = "af_" + "A".repeat(43);
const principalId = "user:owner-fixture";
const expiresAt = "2026-10-16T13:00:00.000Z";
const object = foundationAliasSchema;
const code = (expected: string) => (error: unknown) =>
  error instanceof FoundationError && error.code === expected;

function setup() {
  let at = new Date("2026-10-16T12:00:00.000Z");
  let request: FoundationMachineRequest | FoundationOwnerRequest | undefined;
  const records = { get: async () => ({ value: "canonical" }) };
  const client: FoundationClient = {
    schemaVersion: 1,
    id: clientId,
    projectId,
    name: "Disposable workflow fixture",
    operations: ["improvement.read", "improvement.propose"],
    environment: "test",
    createdAt: "2026-10-16T11:00:00.000Z",
    createdBy: principalId,
    expiresAt,
    revokedAt: null,
  };
  const port: FoundationWorkflowPort<typeof records> = {
    async withClient(input, action) {
      request = input;
      return action(client, records);
    },
    async withOwner(input, action) {
      request = input;
      return action(records);
    },
  };
  const access = () =>
    createFoundationWorkflowAccess(port, {
      environment: "test",
      now: () => at,
      createId: () => correlationId,
    });
  return {
    access,
    port,
    client,
    records,
    request: () => request,
    setTime(value: string) {
      at = new Date(value);
    },
  };
}

test("machine workflow derives canonical attribution and detaches returned data", async () => {
  const world = setup();
  const producer = { value: "canonical" };
  const result = await world
    .access()
    .machine(
      token,
      "improvement.read",
      projectId,
      null,
      async ({ actor, request, records, guard }) => {
        assert.equal(actor.principalId, "foundation-client:" + clientId);
        assert.equal(actor.clientId, clientId);
        assert.equal(actor.correlationId, correlationId);
        assert.equal(request.operation, "improvement.read");
        assert.equal(request.projectId, projectId);
        assert.equal(request.environment, "test");
        assert.ok(Object.isFrozen(actor));
        assert.ok(Object.isFrozen(actor.capabilities));
        assert.ok(Object.isFrozen(request));
        guard();
        assert.deepEqual(await records.get(), producer);
        return producer;
      },
    );
  producer.value = "changed after completion";
  assert.deepEqual(result, { value: "canonical" });
  assert.match(
    (world.request() as FoundationMachineRequest).tokenDigest,
    /^[a-f0-9]{64}$/,
  );
});

test("old grants do not obtain new read, proposal or owner authority", async () => {
  for (const operation of [
    "improvement.read",
    "improvement.propose",
    "improvement.review",
  ] as const) {
    const world = setup();
    world.client.operations = ["foundation.read"];
    let called = false;
    await assert.rejects(
      world.access().machine(token, operation, projectId, null, async () => {
        called = true;
        return { value: "must not execute" };
      }),
      code("FORBIDDEN"),
    );
    assert.equal(called, false);
  }
});

test("machine scope, environment, revocation and expiry fail before callback", async () => {
  for (const change of [
    (world: ReturnType<typeof setup>) => {
      world.client.projectId = clientId;
    },
    (world: ReturnType<typeof setup>) => {
      world.client.environment = "local";
    },
    (world: ReturnType<typeof setup>) => {
      world.client.revokedAt = "2026-10-16T11:30:00.000Z";
    },
    (world: ReturnType<typeof setup>) => {
      world.setTime(expiresAt);
    },
  ]) {
    const world = setup();
    change(world);
    let called = false;
    await assert.rejects(
      world
        .access()
        .machine(token, "improvement.read", projectId, null, async () => {
          called = true;
          return { value: "not authorized" };
        }),
      (error: unknown) => error instanceof FoundationError,
    );
    assert.equal(called, false);
  }
});

test("expiry after an action withholds its delivery using the detached client", async () => {
  const world = setup();
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => {
        world.client.expiresAt = "2099-01-01T00:00:00.000Z";
        world.setTime(expiresAt);
        return { value: "historical only" };
      }),
    code("EXPIRED"),
  );
});

test("expiry after adapter completion cannot be reported as current success", async () => {
  const world = setup();
  world.port.withClient = async (_input, action) => {
    const result = await action(world.client, world.records);
    world.setTime(expiresAt);
    return result;
  };
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => ({
        value: "completed",
      })),
    code("EXPIRED"),
  );
});

test("missing and unfinished adapter callbacks reject fabricated output", async () => {
  const world = setup();
  world.port.withClient = async <T>() => ({ value: "fabricated" }) as T;
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => ({
        value: "real",
      })),
    FoundationWorkflowUnavailableError,
  );
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let callback: Promise<unknown> | undefined;
  world.port.withClient = async <T>(
    _input: FoundationMachineRequest,
    action: (
      client: FoundationClient,
      records: typeof world.records,
    ) => Promise<T>,
  ) => {
    callback = action(world.client, world.records);
    return { value: "fabricated" } as T;
  };
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => {
        await pending;
        return { value: "eventually real" };
      }),
    FoundationWorkflowUnavailableError,
  );
  finish!();
  await assert.rejects(callback!, FoundationWorkflowUnavailableError);
});

test("an adapter callback cannot start an action after its invocation settled", async () => {
  const world = setup();
  let late: (() => Promise<unknown>) | undefined;
  let performed = false;
  world.port.withClient = async <T>(
    _input: FoundationMachineRequest,
    action: (
      client: FoundationClient,
      records: typeof world.records,
    ) => Promise<T>,
  ) => {
    late = () => action(world.client, world.records);
    return { value: "fabricated" } as T;
  };
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => {
        performed = true;
        return { value: "must never start" };
      }),
    FoundationWorkflowUnavailableError,
  );
  await assert.rejects(late!(), FoundationWorkflowUnavailableError);
  assert.equal(performed, false);
});

test("double callbacks and substituted adapter output fail", async () => {
  const world = setup();
  world.port.withClient = async (_input, action) => {
    const result = await action(world.client, world.records);
    await assert.rejects(
      action(world.client, world.records),
      FoundationWorkflowUnavailableError,
    );
    return result;
  };
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => ({
        value: "real",
      })),
    FoundationWorkflowUnavailableError,
  );
  world.port.withClient = async <T>(
    _input: FoundationMachineRequest,
    action: (
      client: FoundationClient,
      records: typeof world.records,
    ) => Promise<T>,
  ) => {
    await action(world.client, world.records);
    return { value: "substitution" } as T;
  };
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => ({
        value: "real",
      })),
    FoundationWorkflowUnavailableError,
  );
});

test("a denied callback attempt cannot be retried with a substituted client", async () => {
  const world = setup();
  let performed = false;
  world.port.withClient = async (_input, action) => {
    await assert.rejects(
      action(
        { ...world.client, operations: ["foundation.read"] },
        world.records,
      ),
      code("FORBIDDEN"),
    );
    return action(world.client, world.records);
  };
  await assert.rejects(
    world
      .access()
      .machine(token, "improvement.read", projectId, null, async () => {
        performed = true;
        return { value: "must never start" };
      }),
    FoundationWorkflowUnavailableError,
  );
  assert.equal(performed, false);
});

test("snapshot input/output rejects getters without invoking them", () => {
  let reads = 0;
  const source = Object.defineProperty({}, "value", {
    enumerable: true,
    get() {
      reads++;
      return "must not execute";
    },
  });
  assert.throws(
    () => foundationWorkflowInput(object, source),
    code("INVALID_REFERENCE"),
  );
  assert.throws(
    () => foundationWorkflowOutput(object, source),
    FoundationWorkflowUnavailableError,
  );
  assert.equal(reads, 0);
  assert.throws(
    () =>
      foundationWorkflowOutput(object, {
        namespace: "valid",
        externalId: "source",
        extra: true,
      }),
    FoundationWorkflowUnavailableError,
  );
  const changed = object.transform((value) => ({
    ...value,
    namespace: value.namespace.toLowerCase(),
  }));
  assert.throws(
    () =>
      foundationWorkflowOutput(changed, {
        namespace: "NOT CANONICAL",
        externalId: "source",
      }),
    FoundationWorkflowUnavailableError,
  );
});

test("owner workflow carries trusted identity and checks expiry at each boundary", async () => {
  const world = setup();
  const identity = { principalId, expiresAt };
  const result = await world
    .access()
    .owner(
      identity,
      "improvement.review",
      projectId,
      clientId,
      async ({ actor, request }) => {
        assert.equal(actor.principalId, principalId);
        assert.equal(actor.clientId, null);
        assert.equal(request.targetId, clientId);
        identity.principalId = "user:changed-by-producer";
        return { value: "owner result" };
      },
    );
  assert.deepEqual(result, { value: "owner result" });
  assert.equal(
    (world.request() as FoundationOwnerRequest).principalId,
    principalId,
  );
  for (const bad of ["foundation-client:" + clientId, "user:", "user:   "]) {
    await assert.rejects(
      world
        .access()
        .owner(
          { principalId: bad, expiresAt },
          "improvement.review",
          projectId,
          clientId,
          async () => ({ value: "not human" }),
        ),
      code("FORBIDDEN"),
    );
  }
  await assert.rejects(
    world
      .access()
      .owner(
        { principalId, expiresAt },
        "improvement.review",
        projectId,
        clientId,
        async () => {
          world.setTime(expiresAt);
          return { value: "too late" };
        },
      ),
    code("FORBIDDEN"),
  );
});

test("invalid runtime clock fails rather than creating an observation time", () => {
  const access = createFoundationWorkflowAccess(setup().port, {
    environment: "test",
    now: () => new Date(Number.NaN),
  });
  assert.throws(() => access.now(), FoundationWorkflowUnavailableError);
});
