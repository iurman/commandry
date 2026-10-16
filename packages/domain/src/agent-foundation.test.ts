import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "vitest";
import {
  FOUNDATION_OPERATIONS,
  FOUNDATION_OPERATION_POLICIES,
  FoundationError,
  canonicalFoundationJson,
  foundationDigest,
  foundationTokenDigest,
  requireFoundationGrant,
  requireFoundationReview,
  requireFoundationVersion,
  type FoundationAuthorizationRequest,
  type FoundationErrorCode,
  type FoundationGrant,
  type FoundationInstructionApproval,
  type FoundationOperation,
  type FoundationReviewMemory,
} from "./agent-foundation.js";

const now = new Date("2026-10-15T12:00:00Z");
const projectId = "11111111-1111-4111-8111-111111111111";
const otherProjectId = "22222222-2222-4222-8222-222222222222";
const digest = foundationDigest({ statement: "Use explicit owner approval" });

function denies(action: () => unknown, code: FoundationErrorCode) {
  assert.throws(
    action,
    (error: unknown) => error instanceof FoundationError && error.code === code,
  );
}

function grant(overrides: Partial<FoundationGrant> = {}): FoundationGrant {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    projectId,
    operations: FOUNDATION_OPERATIONS,
    environment: "test",
    expiresAt: "2026-10-15T13:00:00Z",
    revokedAt: null,
    ...overrides,
  };
}

function request(
  overrides: Partial<FoundationAuthorizationRequest> = {},
): FoundationAuthorizationRequest {
  return {
    operation: "foundation.read",
    projectId,
    environment: "test",
    now,
    ...overrides,
  };
}

function memory(
  overrides: Partial<FoundationReviewMemory> = {},
): FoundationReviewMemory {
  return {
    category: "instruction",
    lifecycle: "accepted",
    verification: "unverified",
    version: 2,
    contentDigest: digest,
    hasUnresolvedContradictions: false,
    ...overrides,
  };
}

function approval(
  overrides: Partial<FoundationInstructionApproval> = {},
): FoundationInstructionApproval {
  return {
    version: 2,
    contentDigest: digest,
    expiresAt: "2026-10-15T13:00:00Z",
    disclosureProjectId: projectId,
    ...overrides,
  };
}

const ownerOnly: readonly FoundationOperation[] = [
  "work.proposal.review",
  "memory.import",
  "memory.review",
  "memory.verify",
  "instruction.approve",
];

test("operation policies enumerate every operation without expanding owner authority", () => {
  assert.deepEqual(FOUNDATION_OPERATIONS, [
    "foundation.read",
    "work.read",
    "work.propose",
    "work.proposal.review",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "memory.import",
    "memory.review",
    "memory.verify",
    "instruction.approve",
    "configuration.record",
    "evaluation.record",
  ]);
  assert.deepEqual(
    Object.keys(FOUNDATION_OPERATION_POLICIES),
    FOUNDATION_OPERATIONS,
  );
  for (const operation of FOUNDATION_OPERATIONS) {
    const policy = FOUNDATION_OPERATION_POLICIES[operation];
    assert.equal(policy.scope, "project");
    assert.equal(policy.requiredCapability, operation);
    assert.equal(policy.auditEvent, operation);
    assert.equal(policy.idempotency, "principal_operation_key");
    assert.equal(
      policy.approval,
      ownerOnly.includes(operation) ? "owner_only" : "automatic_with_grant",
    );
    assert.equal(
      policy.risk,
      ownerOnly.includes(operation)
        ? "sensitive"
        : operation === "foundation.read" || operation === "work.read"
          ? "read_only"
          : "reversible",
    );
    assert.equal(
      policy.concurrency,
      operation === "foundation.read" || operation === "work.read"
        ? "read_snapshot"
        : operation === "memory.revise" || ownerOnly.includes(operation)
          ? "expected_version"
          : "immutable_create",
    );
    assert.ok(Object.isFrozen(policy));
  }
  assert.ok(Object.isFrozen(FOUNDATION_OPERATION_POLICIES));
  assert.ok(Object.isFrozen(FOUNDATION_OPERATIONS));
});

test("task proposal submission and owner review have separate exact frozen policies", () => {
  assert.deepEqual(FOUNDATION_OPERATION_POLICIES["work.propose"], {
    scope: "project",
    risk: "reversible",
    requiredCapability: "work.propose",
    approval: "automatic_with_grant",
    auditEvent: "work.propose",
    concurrency: "immutable_create",
    idempotency: "principal_operation_key",
  });
  assert.deepEqual(FOUNDATION_OPERATION_POLICIES["work.proposal.review"], {
    scope: "project",
    risk: "sensitive",
    requiredCapability: "work.proposal.review",
    approval: "owner_only",
    auditEvent: "work.proposal.review",
    concurrency: "expected_version",
    idempotency: "principal_operation_key",
  });
  for (const operation of ["work.propose", "work.proposal.review"] as const) {
    const policy = FOUNDATION_OPERATION_POLICIES[operation];
    assert.ok(Object.isFrozen(policy));
    assert.equal(
      Reflect.set(policy, "approval", "automatic_with_grant"),
      false,
    );
    assert.equal(Reflect.set(policy, "risk", "read_only"), false);
  }
});

test("existing read grants gain neither task submission nor owner review authority", () => {
  for (const operation of ["foundation.read", "work.read"] as const) {
    const operations = Object.freeze([operation]);
    const existingGrant = Object.freeze(grant({ operations }));
    assert.equal(
      requireFoundationGrant(existingGrant, request({ operation })),
      undefined,
    );
    for (const requested of ["work.propose", "work.proposal.review"] as const) {
      denies(
        () =>
          requireFoundationGrant(
            existingGrant,
            request({ operation: requested }),
          ),
        "FORBIDDEN",
      );
    }
    assert.deepEqual(existingGrant.operations, [operation]);
  }
});

test("task proposal grants allow only their exact project and environment", () => {
  const environments = ["local", "test", "preview", "production"] as const;
  const operations = Object.freeze(["work.propose"] as const);
  for (const environment of environments) {
    const proposalGrant = Object.freeze(grant({ operations, environment }));
    const proposalRequest = request({ operation: "work.propose", environment });
    assert.equal(
      requireFoundationGrant(proposalGrant, proposalRequest),
      undefined,
    );
    denies(
      () =>
        requireFoundationGrant(proposalGrant, {
          ...proposalRequest,
          projectId: otherProjectId,
        }),
      "FORBIDDEN",
    );
    for (const mismatch of environments.filter(
      (value) => value !== environment,
    )) {
      denies(
        () =>
          requireFoundationGrant(proposalGrant, {
            ...proposalRequest,
            environment: mismatch,
          }),
        "FORBIDDEN",
      );
    }
    for (const requested of FOUNDATION_OPERATIONS.filter(
      (value) => value !== "work.propose",
    )) {
      denies(
        () =>
          requireFoundationGrant(
            proposalGrant,
            request({ operation: requested, environment }),
          ),
        "FORBIDDEN",
      );
    }
    assert.deepEqual(proposalGrant.operations, ["work.propose"]);
  }
});

test("task proposal submission requires live expiry, no revocation and valid time", () => {
  const proposalRequest = request({ operation: "work.propose" });
  const proposalGrant = grant({ operations: ["work.propose"] });
  assert.equal(
    requireFoundationGrant(
      { ...proposalGrant, expiresAt: new Date(now.getTime() + 1) },
      proposalRequest,
    ),
    undefined,
  );
  for (const expiresAt of [
    now,
    new Date(now.getTime() - 1),
    "2026-10-15T14:00:00+02:00",
  ]) {
    denies(
      () =>
        requireFoundationGrant(
          { ...proposalGrant, expiresAt },
          proposalRequest,
        ),
      "EXPIRED",
    );
  }
  denies(
    () =>
      requireFoundationGrant(
        {
          ...proposalGrant,
          expiresAt: "2026-10-15T12:00:00.099999999999999999Z",
        },
        { ...proposalRequest, now: new Date(now.getTime() + 100) },
      ),
    "EXPIRED",
  );
  for (const revokedAt of [now, "2026-10-15T13:00:00Z"]) {
    denies(
      () =>
        requireFoundationGrant(
          { ...proposalGrant, revokedAt },
          proposalRequest,
        ),
      "REVOKED",
    );
  }
  for (const expiresAt of ["invalid", "2026-02-30T12:00:00Z"]) {
    denies(
      () =>
        requireFoundationGrant(
          { ...proposalGrant, expiresAt },
          proposalRequest,
        ),
      "FORBIDDEN",
    );
  }
  denies(
    () =>
      requireFoundationGrant(proposalGrant, {
        ...proposalRequest,
        now: new Date(NaN),
      }),
    "FORBIDDEN",
  );
});

test("a forged proposal review capability still cannot authorize a machine", () => {
  for (const operations of [
    ["work.proposal.review"],
    ["work.propose", "work.proposal.review"],
    ["foundation.read", "work.read", "work.proposal.review"],
  ] as const) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ operations }),
          request({ operation: "work.proposal.review" }),
        ),
      "FORBIDDEN",
    );
  }
});

test("foundation credentials hash exact validated af_ bytes without exposing them in errors", () => {
  for (const suffix of [
    "a".repeat(43),
    "_".repeat(43),
    "-".repeat(43),
    "A0_-".repeat(10) + "Ab9",
  ]) {
    const token = "af_" + suffix;
    assert.equal(
      foundationTokenDigest(token),
      createHash("sha256").update(token).digest("hex"),
    );
    assert.match(foundationTokenDigest(token), /^[a-f0-9]{64}$/);
  }
  assert.notEqual(
    foundationTokenDigest("af_" + "a".repeat(43)),
    foundationTokenDigest("af_" + "b".repeat(43)),
  );
  for (const token of [
    "",
    "ck_" + "a".repeat(43),
    "af_" + "a".repeat(42),
    "af_" + "a".repeat(44),
    "af_" + "+".repeat(43),
    "af_" + "a".repeat(43) + "\n",
    " af_" + "a".repeat(43),
    undefined,
    null,
    42,
  ]) {
    denies(() => foundationTokenDigest(token as string), "INVALID_CREDENTIAL");
  }
});

test("canonical JSON recursively sorts keys including numeric keys and preserves arrays", () => {
  assert.equal(
    canonicalFoundationJson({
      z: [{ y: 2, a: 1 }, null],
      a: { b: true, a: "text" },
    }),
    '{"a":{"a":"text","b":true},"z":[{"a":1,"y":2},null]}',
  );
  assert.equal(
    canonicalFoundationJson({ "2": "second", "10": "tenth" }),
    '{"10":"tenth","2":"second"}',
  );
  assert.equal(canonicalFoundationJson([3, 1, 2]), "[3,1,2]");
  assert.equal(
    canonicalFoundationJson(Object.assign(Object.create(null), { b: 2, a: 1 })),
    '{"a":1,"b":2}',
  );
  assert.equal(
    canonicalFoundationJson(JSON.parse('{"__proto__":{"value":1}}')),
    '{"__proto__":{"value":1}}',
  );
  for (const value of [null, true, false, 'quoted " text', 0, -0, 1.5]) {
    assert.equal(canonicalFoundationJson(value), JSON.stringify(value));
  }
});

test("digests are key-order stable and sensitive to every JSON value and array order", () => {
  const content = { b: [1, { z: "yes", a: false }], a: 1 };
  assert.equal(
    foundationDigest(content),
    foundationDigest({ a: 1, b: [1, { a: false, z: "yes" }] }),
  );
  assert.equal(
    foundationDigest(content),
    createHash("sha256").update(canonicalFoundationJson(content)).digest("hex"),
  );
  for (const changed of [
    { ...content, a: 2 },
    { ...content, c: null },
    { ...content, b: [{ z: "yes", a: false }, 1] },
    { ...content, b: [1, { z: "no", a: false }] },
  ]) {
    assert.notEqual(foundationDigest(content), foundationDigest(changed));
  }
  const shared = { a: 1 };
  assert.equal(canonicalFoundationJson([shared, shared]), '[{"a":1},{"a":1}]');
});

test("canonical JSON rejects lossy values, cycles, prototypes, getters and hidden keys", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const cyclicArray: unknown[] = [];
  cyclicArray.push(cyclicArray);
  let getterCalled = false;
  const accessor = {
    get value() {
      getterCalled = true;
      return 1;
    },
  };
  const arrayExtra = Object.assign([1], { extra: 2 });
  const replacedHole = Object.assign(new Array(1), { extra: 2 });
  const symbolKey = { [Symbol("secret")]: 1 };
  const hidden = Object.defineProperty({}, "value", { value: 1 });
  for (const value of [
    undefined,
    Number.NaN,
    Infinity,
    -Infinity,
    1n,
    Symbol("value"),
    () => 1,
    { value: undefined },
    [undefined],
    new Array(1),
    arrayExtra,
    replacedHole,
    new Date(),
    new Map(),
    new Set(),
    /pattern/,
    new Number(1),
    new (class {
      value = 1;
    })(),
    cyclic,
    cyclicArray,
    accessor,
    symbolKey,
    hidden,
    { nested: Number.NaN },
  ]) {
    assert.throws(() => canonicalFoundationJson(value), TypeError);
    assert.throws(() => foundationDigest(value), TypeError);
  }
  assert.equal(getterCalled, false);
});

for (const operation of FOUNDATION_OPERATIONS.filter(
  (operation) => !ownerOnly.includes(operation),
)) {
  test("machine grant permits scoped operation " + operation, () => {
    assert.equal(
      requireFoundationGrant(
        grant({ operations: [operation] }),
        request({ operation }),
      ),
      undefined,
    );
  });
}

for (const operation of ownerOnly) {
  test("machine grant cannot perform owner-only operation " + operation, () => {
    denies(
      () => requireFoundationGrant(grant(), request({ operation })),
      "FORBIDDEN",
    );
  });
}

test("Work reads require their own exact capability and grant no other operation", () => {
  const workRequest = request({ operation: "work.read" });
  denies(
    () =>
      requireFoundationGrant(
        grant({ operations: ["foundation.read"] }),
        workRequest,
      ),
    "FORBIDDEN",
  );
  const workGrant = Object.freeze(
    grant({ operations: Object.freeze(["work.read"] as const) }),
  );
  assert.equal(requireFoundationGrant(workGrant, workRequest), undefined);
  for (const operation of FOUNDATION_OPERATIONS.filter(
    (value) => value !== "work.read",
  )) {
    denies(
      () => requireFoundationGrant(workGrant, request({ operation })),
      "FORBIDDEN",
    );
  }
  for (const operation of ownerOnly) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ operations: ["work.read", operation] }),
          request({ operation }),
        ),
      "FORBIDDEN",
    );
  }
});

test("Work read grants match exactly one project and environment", () => {
  const environments = ["local", "test", "preview", "production"] as const;
  for (const environment of environments) {
    const workGrant = grant({ operations: ["work.read"], environment });
    const workRequest = request({ operation: "work.read", environment });
    assert.equal(requireFoundationGrant(workGrant, workRequest), undefined);
    denies(
      () =>
        requireFoundationGrant(workGrant, {
          ...workRequest,
          projectId: otherProjectId,
        }),
      "FORBIDDEN",
    );
    for (const mismatch of environments.filter(
      (value) => value !== environment,
    )) {
      denies(
        () =>
          requireFoundationGrant(workGrant, {
            ...workRequest,
            environment: mismatch,
          }),
        "FORBIDDEN",
      );
    }
  }
});

test("Work read grants require live expiry and no revocation", () => {
  const workRequest = request({ operation: "work.read" });
  for (const expiresAt of [
    new Date(now.getTime() + 1),
    "2026-10-15T14:00:00.001+02:00",
  ]) {
    assert.equal(
      requireFoundationGrant(
        grant({ operations: ["work.read"], expiresAt }),
        workRequest,
      ),
      undefined,
    );
  }
  for (const expiresAt of [
    new Date(now.getTime() - 1),
    now,
    "2026-10-15T14:00:00+02:00",
    "2026-10-15T11:59:59.999999999999999999Z",
  ]) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ operations: ["work.read"], expiresAt }),
          workRequest,
        ),
      "EXPIRED",
    );
  }
  for (const expiresAt of ["invalid", "2026-02-30T12:00:00Z"]) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ operations: ["work.read"], expiresAt }),
          workRequest,
        ),
      "FORBIDDEN",
    );
  }
  for (const revokedAt of ["2026-10-15T11:00:00Z", "2026-10-15T13:00:00Z"]) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ operations: ["work.read"], revokedAt }),
          workRequest,
        ),
      "REVOKED",
    );
  }
  denies(
    () =>
      requireFoundationGrant(
        grant({ operations: ["work.read"], revokedAt: "invalid" }),
        workRequest,
      ),
    "FORBIDDEN",
  );
});

test("authority denies absent operations and exact project/environment mismatches", () => {
  denies(
    () => requireFoundationGrant(grant({ operations: [] }), request()),
    "FORBIDDEN",
  );
  denies(
    () =>
      requireFoundationGrant(grant(), request({ projectId: otherProjectId })),
    "FORBIDDEN",
  );
  for (const environment of ["local", "preview", "production"] as const) {
    denies(
      () => requireFoundationGrant(grant(), request({ environment })),
      "FORBIDDEN",
    );
  }
  for (const operation of [
    "unknown",
    "toString",
    "__proto__",
  ] as unknown as FoundationOperation[]) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ operations: [operation] }),
          request({ operation }),
        ),
      "FORBIDDEN",
    );
  }
});

test("revocation takes precedence over expiry and exact expiry is denied", () => {
  denies(
    () =>
      requireFoundationGrant(
        grant({
          revokedAt: "2026-10-15T10:00:00Z",
          expiresAt: "2026-10-15T11:00:00Z",
        }),
        request(),
      ),
    "REVOKED",
  );
  denies(
    () =>
      requireFoundationGrant(
        grant({ revokedAt: "2026-10-15T13:00:00Z" }),
        request(),
      ),
    "REVOKED",
  );
  for (const expiresAt of ["2026-10-15T11:59:59.999Z", now, new Date(now)]) {
    denies(
      () => requireFoundationGrant(grant({ expiresAt }), request()),
      "EXPIRED",
    );
  }
  assert.doesNotThrow(() =>
    requireFoundationGrant(
      grant({ expiresAt: new Date(now.getTime() + 1) }),
      request(),
    ),
  );
});

test("authorization fails closed for invalid dates", () => {
  for (const expiresAt of [
    "invalid",
    "",
    new Date(Number.NaN),
    undefined as unknown as string,
  ]) {
    denies(
      () => requireFoundationGrant(grant({ expiresAt }), request()),
      "FORBIDDEN",
    );
  }
  for (const revokedAt of [
    "invalid",
    "",
    new Date(Number.NaN),
    undefined as unknown as string,
  ]) {
    denies(
      () => requireFoundationGrant(grant({ revokedAt }), request()),
      "FORBIDDEN",
    );
  }
  for (const invalidNow of [
    new Date(Number.NaN),
    "2026-10-15T12:00:00Z",
    undefined,
  ]) {
    denies(
      () =>
        requireFoundationGrant(grant(), request({ now: invalidNow as Date })),
      "FORBIDDEN",
    );
  }
});

test("version guard requires positive matching safe integers", () => {
  for (const version of [1, 2, Number.MAX_SAFE_INTEGER])
    assert.equal(requireFoundationVersion(version, version), undefined);
  for (const version of [
    0,
    -1,
    1.5,
    Infinity,
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    denies(
      () => requireFoundationVersion(version, version),
      "VERSION_CONFLICT",
    );
    denies(() => requireFoundationVersion(1, version), "VERSION_CONFLICT");
    denies(() => requireFoundationVersion(version, 1), "VERSION_CONFLICT");
  }
  denies(() => requireFoundationVersion(2, 1), "VERSION_CONFLICT");
  denies(() => requireFoundationVersion(1, 2), "VERSION_CONFLICT");
});

test("instruction selection requires acceptance, explicit contradiction resolution and owner approval", () => {
  denies(
    () => requireFoundationReview(memory(), null, projectId, now),
    "APPROVAL_REQUIRED",
  );
  for (const lifecycle of ["proposed", "rejected", "superseded"] as const) {
    denies(
      () =>
        requireFoundationReview(
          memory({ lifecycle }),
          approval(),
          projectId,
          now,
        ),
      "FORBIDDEN",
    );
  }
  denies(
    () =>
      requireFoundationReview(
        memory({ hasUnresolvedContradictions: true }),
        approval(),
        projectId,
        now,
      ),
    "FORBIDDEN",
  );
  denies(
    () =>
      requireFoundationReview(
        memory({
          hasUnresolvedContradictions: undefined as unknown as boolean,
        }),
        approval(),
        projectId,
        now,
      ),
    "FORBIDDEN",
  );
  denies(
    () =>
      requireFoundationReview(
        memory({ category: "unknown" as FoundationReviewMemory["category"] }),
        approval(),
        projectId,
        now,
      ),
    "FORBIDDEN",
  );
  assert.equal(
    requireFoundationReview(memory(), approval(), projectId, now),
    undefined,
  );
});

test("approval binds version and digest independently even when one binding still matches", () => {
  denies(
    () =>
      requireFoundationReview(
        memory({ version: 3 }),
        approval(),
        projectId,
        now,
      ),
    "APPROVAL_REQUIRED",
  );
  denies(
    () =>
      requireFoundationReview(
        memory({ contentDigest: foundationDigest("changed wording") }),
        approval(),
        projectId,
        now,
      ),
    "APPROVAL_REQUIRED",
  );
  for (const changedApproval of [
    approval({ version: 1 }),
    approval({ version: 0 }),
    approval({ version: 2.5 }),
    approval({ contentDigest: foundationDigest("changed approval") }),
  ]) {
    denies(
      () => requireFoundationReview(memory(), changedApproval, projectId, now),
      "APPROVAL_REQUIRED",
    );
  }
});

test("instruction approval is live and disclosed only to its exact project", () => {
  denies(
    () =>
      requireFoundationReview(
        memory(),
        approval({ disclosureProjectId: otherProjectId }),
        projectId,
        now,
      ),
    "APPROVAL_REQUIRED",
  );
  for (const expiresAt of [
    now,
    new Date(now.getTime() - 1),
    "invalid",
    "",
    new Date(Number.NaN),
  ]) {
    denies(
      () =>
        requireFoundationReview(
          memory(),
          approval({ expiresAt }),
          projectId,
          now,
        ),
      "APPROVAL_REQUIRED",
    );
  }
  assert.doesNotThrow(() =>
    requireFoundationReview(
      memory(),
      approval({ expiresAt: new Date(now.getTime() + 1) }),
      projectId,
      now,
    ),
  );
  denies(
    () =>
      requireFoundationReview(
        memory(),
        approval(),
        projectId,
        new Date(Number.NaN),
      ),
    "FORBIDDEN",
  );
});

test("selection cannot manufacture valid version or digest identity", () => {
  for (const version of [0, -1, 1.5, Number.NaN]) {
    denies(
      () =>
        requireFoundationReview(
          memory({ version }),
          approval({ version }),
          projectId,
          now,
        ),
      "VERSION_CONFLICT",
    );
  }
  for (const contentDigest of [
    "",
    "a".repeat(63),
    "A".repeat(64),
    "a".repeat(64) + "\n",
    "not-a-digest",
  ]) {
    denies(
      () =>
        requireFoundationReview(
          memory({ contentDigest }),
          approval({ contentDigest }),
          projectId,
          now,
        ),
      "INVALID_REFERENCE",
    );
  }
});

test("review and instruction approval never imply factual verification or mutate records", () => {
  for (const verification of [
    "unverified",
    "source_matched",
    "independently_verified",
  ] as const) {
    const selectedMemory = Object.freeze(memory({ verification }));
    const selectedApproval = Object.freeze(approval());
    assert.equal(
      requireFoundationReview(selectedMemory, selectedApproval, projectId, now),
      undefined,
    );
    assert.equal(selectedMemory.verification, verification);
    assert.equal(selectedMemory.lifecycle, "accepted");
  }
  const preference = Object.freeze(
    memory({ category: "preference", verification: "unverified" }),
  );
  assert.equal(
    requireFoundationReview(preference, null, projectId, now),
    undefined,
  );
  assert.equal(preference.verification, "unverified");
  denies(
    () =>
      requireFoundationReview(
        memory({ category: "preference", lifecycle: "proposed" }),
        null,
        projectId,
        now,
      ),
    "FORBIDDEN",
  );
  denies(
    () =>
      requireFoundationReview(
        memory({ category: "preference", hasUnresolvedContradictions: true }),
        null,
        projectId,
        now,
      ),
    "FORBIDDEN",
  );
});

test("impossible February expiry cannot authorize a grant", () => {
  const observedAt = new Date("2027-03-01T12:00:00Z");
  const expiresAt = "2027-02-30T00:00:00Z";
  denies(
    () =>
      requireFoundationGrant(
        grant({ expiresAt }),
        request({ now: observedAt }),
      ),
    "FORBIDDEN",
  );
});

test("impossible February expiry cannot authorize an instruction approval", () => {
  const observedAt = new Date("2027-03-01T12:00:00Z");
  const expiresAt = "2027-02-30T00:00:00Z";
  denies(
    () =>
      requireFoundationReview(
        memory(),
        approval({ expiresAt }),
        projectId,
        observedAt,
      ),
    "APPROVAL_REQUIRED",
  );
});

test("both expiry consumers reject impossible calendars and ambiguous ISO timezones", () => {
  const observedAt = new Date("1800-01-01T00:00:00Z");
  const invalidExpiries = [
    "2027-02-29T00:00:00Z",
    "1900-02-29T00:00:00Z",
    "2027-02-30T00:00:00Z",
    "2028-02-30T00:00:00Z",
    "2027-04-31T00:00:00Z",
    "2027-01-00T00:00:00Z",
    "2027-01-32T00:00:00Z",
    "2027-00-01T00:00:00Z",
    "2027-13-01T00:00:00Z",
    "2027-01-01T24:00:00Z",
    "2027-01-01T00:60:00Z",
    "2027-01-01T00:00:60Z",
    "2027-01-01",
    "2027-01-01T00:00:00",
    "2027-01-01 00:00:00Z",
    "2027-01-01t00:00:00z",
    "2027-01-01T00:00:00+02",
    "2027-01-01T00:00:00+0200",
    "2027-01-01T00:00:00+2:00",
    "2027-01-01T00:00:00+24:00",
    "2027-01-01T00:00:00+01:60",
    "2027-01-01T00:00:00Z\n",
    " 2027-01-01T00:00:00Z",
  ];
  for (const expiresAt of invalidExpiries) {
    denies(
      () =>
        requireFoundationGrant(
          grant({ expiresAt }),
          request({ now: observedAt }),
        ),
      "FORBIDDEN",
    );
    denies(
      () =>
        requireFoundationReview(
          memory(),
          approval({ expiresAt }),
          projectId,
          observedAt,
        ),
      "APPROVAL_REQUIRED",
    );
  }
});

test("revocation timestamps use the same strict calendar and timezone validation", () => {
  for (const revokedAt of [
    "2027-02-30T00:00:00Z",
    "2027-02-29T00:00:00Z",
    "2027-01-01T00:00:00",
    "2027-01-01T00:00:00+0200",
  ]) {
    denies(
      () => requireFoundationGrant(grant({ revokedAt }), request()),
      "FORBIDDEN",
    );
  }
});

test("valid leap days, offset ISO strings and Date objects retain exact expiry boundaries", () => {
  const expiries = [
    "2000-02-29T00:00:00Z",
    "2028-02-29T00:00Z",
    "2028-02-29T00:00:00Z",
    "2028-02-29T00:00:00.123Z",
    "2028-02-29T00:00:00.123456Z",
    "2028-02-29T00:00:00+00:00",
    "2028-02-29T00:00:00+05:30",
    "2028-02-29T23:59:59-07:00",
    "2028-03-01T00:00:00+14:00",
    "2028-02-29T00:00:00-12:00",
    new Date("2028-02-29T12:00:00Z"),
  ];
  for (const expiresAt of expiries) {
    const instant =
      expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
    const justBefore = new Date(instant - 1);
    const exactlyAt = new Date(instant);
    assert.doesNotThrow(() =>
      requireFoundationGrant(
        grant({ expiresAt }),
        request({ now: justBefore }),
      ),
    );
    assert.doesNotThrow(() =>
      requireFoundationReview(
        memory(),
        approval({ expiresAt }),
        projectId,
        justBefore,
      ),
    );
    denies(
      () =>
        requireFoundationGrant(
          grant({ expiresAt }),
          request({ now: exactlyAt }),
        ),
      "EXPIRED",
    );
    denies(
      () =>
        requireFoundationReview(
          memory(),
          approval({ expiresAt }),
          projectId,
          exactlyAt,
        ),
      "APPROVAL_REQUIRED",
    );
  }
});

test("long fractional timestamps cannot extend an expired grant or instruction approval", () => {
  const at = new Date("2026-10-15T12:00:00.100Z");
  const expired = "2026-10-15T12:00:00.099999999999999999Z";
  denies(
    () =>
      requireFoundationGrant(
        grant({ expiresAt: expired }),
        request({ now: at }),
      ),
    "EXPIRED",
  );
  denies(
    () =>
      requireFoundationReview(
        memory({ verification: "source_matched" }),
        approval({ expiresAt: expired }),
        projectId,
        at,
      ),
    "APPROVAL_REQUIRED",
  );
  requireFoundationGrant(
    grant({ expiresAt: "2026-10-15T13:00:00.101000000000000001+01:00" }),
    request({ now: at }),
  );
});
