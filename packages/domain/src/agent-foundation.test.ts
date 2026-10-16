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
  "memory.review",
  "memory.verify",
  "instruction.approve",
];

test("operation policies enumerate every operation without expanding owner authority", () => {
  assert.deepEqual(FOUNDATION_OPERATIONS, [
    "foundation.read",
    "evidence.record",
    "memory.propose",
    "memory.revise",
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
        : operation === "foundation.read"
          ? "read_only"
          : "reversible",
    );
    assert.equal(
      policy.concurrency,
      operation === "foundation.read"
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
