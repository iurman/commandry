import assert from "node:assert/strict";
import { test } from "vitest";
import { foundationOperationSchema } from "./agent-foundation.js";
import {
  foundationClientSchema,
  foundationCreateClientSchema,
  foundationCreateConfigurationSchema,
  foundationIdempotencyKeySchema,
  foundationGeneralContextRequestSchema,
  foundationInstructionApprovalSchema,
  foundationIssuedClientSchema,
  foundationMachineOperationSchema,
  foundationReadRecordSchema,
  foundationRevokeClientSchema,
  foundationScopedPageSchema,
} from "./foundation-access.js";

const projectId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";

test("general context is strict, bounded and distinct from task authority", () => {
  const request = foundationGeneralContextRequestSchema.parse({ projectId });
  assert.equal(request.projectId, projectId.toLowerCase());
  assert.equal(request.maxCharacters, 12000);
  assert.equal(request.taskDirection, "");
  for (const extra of [
    { maxCharacters: 0 },
    { maxCharacters: 100001 },
    { maxCharacters: 1.5 },
    { taskDirection: "x".repeat(32001) },
    { ownerApproved: true },
    { taskId: projectId },
  ]) {
    assert.equal(
      foundationGeneralContextRequestSchema.safeParse({ projectId, ...extra })
        .success,
      false,
    );
  }
});
const clientId = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
const memoryId = "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC";
const createdAt = "2026-10-15T10:00:00Z";
const expiresAt = "2026-10-16T10:00:00Z";
const notice = "Credential shown once; store it outside Commandry knowledge.";
// Fixed fixture text exercises format only and is never issued as a credential.
const token = "af_" + "A".repeat(43);
const machineOperations = [
  "foundation.read",
  "work.read",
  "resources.read",
  "work.propose",
  "evidence.record",
  "memory.propose",
  "memory.revise",
  "configuration.record",
  "evaluation.record",
];
const ownerOperations = [
  "work.proposal.read",
  "work.proposal.review",
  "memory.review",
  "memory.import",
  "memory.verify",
  "instruction.approve",
];
const createClient = () => ({
  name: "  Foundation recorder  ",
  projectId,
  operations: ["foundation.read"],
  environment: "test",
  ttlSeconds: 60,
});
const client = () => ({
  schemaVersion: 1,
  id: clientId,
  projectId,
  name: "Foundation recorder",
  operations: ["foundation.read"],
  environment: "test",
  createdAt,
  expiresAt,
  revokedAt: null,
  createdBy: "owner:isaac",
});
const approval = () => ({
  schemaVersion: 1,
  id: clientId,
  projectId,
  memoryId,
  version: 1,
  contentDigest: "a".repeat(64),
  disclosureProjectId: projectId,
  approvedAt: createdAt,
  expiresAt,
  approvedBy: "owner:isaac",
  revokedAt: null,
});
const configuration = () => ({
  projectId,
  kind: "prompt",
  content: "  original\r\ncontent\t\n",
  parentIds: [clientId],
  sourceCommit: null,
});
const reject = (
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) => assert.equal(schema.safeParse(value).success, false);

const invalidDatetimes = [
  "2026-02-30T10:00:00Z",
  "2025-02-29T10:00:00Z",
  "2026-13-01T10:00:00Z",
  "2026-10-15T24:00:00Z",
  "2026-10-15T10:60:00Z",
  "2026-10-15T10:00:60Z",
  "2026-10-15T10:00:00+24:00",
  "2026-10-25T02:30:00",
  "2026-10-15",
  "10/15/2026 10:00:00 UTC",
  "2026-10-15T10:00:00Z\n",
  " 2026-10-15T10:00:00Z",
  1792058400000,
  new Date(createdAt),
];

test("machine operations include exactly nine opt-in capabilities", () => {
  assert.deepEqual(foundationMachineOperationSchema.options, machineOperations);
  for (const operation of machineOperations) {
    assert.equal(foundationMachineOperationSchema.parse(operation), operation);
  }
  for (const operation of ownerOperations) {
    assert.equal(foundationOperationSchema.parse(operation), operation);
    reject(foundationMachineOperationSchema, operation);
    reject(foundationCreateClientSchema, {
      ...createClient(),
      operations: [operation],
    });
    reject(foundationClientSchema, { ...client(), operations: [operation] });
  }
  reject(foundationMachineOperationSchema, "foundation.write");
});

test("create requests normalize UUIDs and names with explicit authority fields", () => {
  const parsed = foundationCreateClientSchema.parse(createClient());
  assert.equal(parsed.projectId, projectId.toLowerCase());
  assert.equal(parsed.name, "Foundation recorder");
  assert.deepEqual(parsed.operations, ["foundation.read"]);
  assert.equal(parsed.environment, "test");
  assert.equal(parsed.ttlSeconds, 60);
  for (const environment of ["local", "test", "preview", "production"]) {
    assert.equal(
      foundationCreateClientSchema.parse({ ...createClient(), environment })
        .environment,
      environment,
    );
  }
  for (const field of Object.keys(createClient())) {
    const candidate: Record<string, unknown> = createClient();
    delete candidate[field];
    reject(foundationCreateClientSchema, candidate);
  }
  reject(foundationCreateClientSchema, {
    ...createClient(),
    environment: "staging",
  });
  reject(foundationCreateClientSchema, { ...createClient(), projectId: "p1" });
});

test("operation lists are nonempty, unique and limited to the complete population", () => {
  for (const [schema, value] of [
    [foundationCreateClientSchema, createClient()],
    [foundationClientSchema, client()],
  ] as const) {
    assert.equal(
      schema.parse({ ...value, operations: machineOperations }).operations
        .length,
      machineOperations.length,
    );
    for (const operations of [
      [],
      ["foundation.read", "foundation.read"],
      [...machineOperations, "foundation.read"],
      ["foundation.read", "unknown"],
    ]) {
      reject(schema, { ...value, operations });
    }
  }
});

test("client names and lifetime reject empty, oversized and noninteger inputs", () => {
  assert.equal(
    foundationCreateClientSchema.parse({
      ...createClient(),
      name: "a".repeat(100),
      ttlSeconds: 2592000,
    }).ttlSeconds,
    2592000,
  );
  for (const name of ["", " \t\n", "a".repeat(101)]) {
    reject(foundationCreateClientSchema, { ...createClient(), name });
    reject(foundationClientSchema, { ...client(), name });
  }
  for (const ttlSeconds of [
    59,
    2592001,
    60.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN,
    "60",
  ]) {
    reject(foundationCreateClientSchema, { ...createClient(), ttlSeconds });
  }
});

test("owner control inputs and public snapshots reject injected authority or secrets", () => {
  for (const field of [
    "actor",
    "principalId",
    "clientId",
    "capabilities",
    "resourceIds",
    "token",
    "tokenDigest",
    "verified",
  ]) {
    reject(foundationCreateClientSchema, { ...createClient(), [field]: token });
    reject(foundationClientSchema, { ...client(), [field]: token });
  }
  for (const field of ["id", "schemaVersion", "createdBy", "expiresAt"]) {
    reject(foundationCreateClientSchema, { ...createClient(), [field]: 1 });
  }
});

test("public client snapshots normalize IDs and require server record fields", () => {
  const parsed = foundationClientSchema.parse(client());
  assert.equal(parsed.id, clientId.toLowerCase());
  assert.equal(parsed.projectId, projectId.toLowerCase());
  assert.equal(parsed.revokedAt, null);
  assert.equal(parsed.createdBy, "owner:isaac");
  assert.equal("token" in parsed, false);
  assert.equal("tokenDigest" in parsed, false);
  assert.equal(
    foundationClientSchema.parse({ ...client(), createdBy: "h".repeat(500) })
      .createdBy.length,
    500,
  );
  for (const createdBy of ["", " \t", "h".repeat(501)]) {
    reject(foundationClientSchema, { ...client(), createdBy });
  }
  for (const field of Object.keys(client())) {
    const candidate: Record<string, unknown> = client();
    delete candidate[field];
    reject(foundationClientSchema, candidate);
  }
  reject(foundationClientSchema, { ...client(), schemaVersion: 2 });
});

test("client timestamps reject invalid, overflowing and ambiguous instants", () => {
  for (const field of ["createdAt", "expiresAt", "revokedAt"]) {
    for (const value of invalidDatetimes) {
      reject(foundationClientSchema, { ...client(), [field]: value });
    }
  }
  assert.equal(
    foundationClientSchema.parse({
      ...client(),
      createdAt: "2024-02-29T00:00:00+00:00",
    }).createdAt,
    "2024-02-29T00:00:00+00:00",
  );
});

test("client lifecycle compares instants across offsets and permits later revocation", () => {
  reject(foundationClientSchema, { ...client(), expiresAt: createdAt });
  reject(foundationClientSchema, {
    ...client(),
    expiresAt: "2026-10-15T11:00:00+02:00",
  });
  reject(foundationClientSchema, {
    ...client(),
    revokedAt: "2026-10-15T09:59:59Z",
  });
  assert.equal(
    foundationClientSchema.parse({
      ...client(),
      createdAt: "2026-10-15T12:00:00+02:00",
      expiresAt: "2026-10-15T11:00:00Z",
      revokedAt: "2026-10-15T10:00:00Z",
    }).revokedAt,
    createdAt,
  );
  assert.equal(
    foundationClientSchema.parse({
      ...client(),
      revokedAt: "2026-10-17T10:00:00Z",
    }).revokedAt,
    "2026-10-17T10:00:00Z",
  );
});

test("timestamp ordering preserves submillisecond precision", () => {
  assert.equal(
    foundationClientSchema.parse({
      ...client(),
      createdAt: "2026-10-15T10:00:00.000001Z",
      expiresAt: "2026-10-15T12:00:00.000002+02:00",
    }).expiresAt,
    "2026-10-15T12:00:00.000002+02:00",
  );
  reject(foundationClientSchema, {
    ...client(),
    createdAt: "2026-10-15T10:00:00.123456Z",
    expiresAt: "2026-10-15T10:00:00.123455Z",
  });
  reject(foundationClientSchema, {
    ...client(),
    createdAt: "2026-10-15T10:00:00.1000Z",
    expiresAt: "2026-10-15T10:00:00.1Z",
  });
});

test("issuance alone accepts an exact credential with the mandatory notice", () => {
  const issued = foundationIssuedClientSchema.parse({
    client: client(),
    token,
    notice,
  });
  assert.equal(issued.token, token);
  assert.equal(issued.token.length, 46);
  assert.equal(issued.notice, notice);
  assert.equal(
    foundationIssuedClientSchema.parse({
      client: client(),
      token: "af_" + "aZ09_-".repeat(7) + "x",
      notice,
    }).token.length,
    46,
  );
  for (const invalidToken of [
    "af_" + "A".repeat(42),
    "af_" + "A".repeat(44),
    "ck_" + "A".repeat(43),
    "AF_" + "A".repeat(43),
    token + "\n",
    " " + token,
    "af_" + "A".repeat(42) + "\n",
    "af_" + "A".repeat(42) + "/",
    "af_" + "A".repeat(42) + "+",
    "af_" + "A".repeat(42) + "=",
    "af_" + "A".repeat(42) + "\0",
  ]) {
    reject(foundationIssuedClientSchema, {
      client: client(),
      token: invalidToken,
      notice,
    });
  }
  reject(foundationIssuedClientSchema, { client: client(), token });
  reject(foundationIssuedClientSchema, {
    client: client(),
    token,
    notice: "Saved credential",
  });
  reject(foundationIssuedClientSchema, {
    client: { ...client(), tokenDigest: "a".repeat(64) },
    token,
    notice,
  });
  reject(foundationIssuedClientSchema, {
    client: client(),
    token,
    notice,
    actor: { principalId: "owner" },
  });
});

test("revocation selectors accept only a normalized client identity", () => {
  assert.deepEqual(foundationRevokeClientSchema.parse({ clientId }), {
    clientId: clientId.toLowerCase(),
  });
  reject(foundationRevokeClientSchema, {});
  reject(foundationRevokeClientSchema, { clientId: "invalid" });
  for (const field of [
    "actor",
    "principalId",
    "projectId",
    "token",
    "revokedAt",
  ]) {
    reject(foundationRevokeClientSchema, { clientId, [field]: "injected" });
  }
});

test("idempotency keys preserve exact opaque ASCII identity and boundaries", () => {
  for (const key of [
    "a",
    "9",
    "A._:-0z",
    "A".repeat(200),
    token,
    "ck_opaque-operation-identity",
  ]) {
    assert.equal(foundationIdempotencyKeySchema.parse(key), key);
  }
  for (const key of [
    "",
    "A".repeat(201),
    ".key",
    "_key",
    ":key",
    "-key",
    " key",
    "key ",
    "key\n",
    "key\r\n",
    "key\t",
    "key\0",
    "key/value",
    "key+value",
    "key=value",
    "key\u00e9",
    "\uff21key",
    123,
  ]) {
    reject(foundationIdempotencyKeySchema, key);
  }
});

test("scoped pages retain continuation, snapshot time and inherited limit behavior", () => {
  assert.deepEqual(foundationScopedPageSchema.parse({ projectId }), {
    projectId: projectId.toLowerCase(),
    limit: 25,
  });
  assert.deepEqual(
    foundationScopedPageSchema.parse({
      projectId,
      limit: 100,
      after: clientId,
      asOf: createdAt,
    }),
    {
      projectId: projectId.toLowerCase(),
      limit: 100,
      after: clientId.toLowerCase(),
      asOf: createdAt,
    },
  );
  assert.equal(
    foundationScopedPageSchema.parse({ projectId, limit: 1 }).limit,
    1,
  );
  for (const limit of [0, 101, 1.5, "25"]) {
    reject(foundationScopedPageSchema, { projectId, limit });
  }
  reject(foundationScopedPageSchema, { projectId, after: "bad-cursor" });
  reject(foundationScopedPageSchema, { projectId, after: null });
  reject(foundationScopedPageSchema, { projectId, token });
  reject(foundationScopedPageSchema, { limit: 25 });
  for (const asOf of invalidDatetimes) {
    reject(foundationScopedPageSchema, { projectId, asOf });
  }
});

test("record selectors normalize both IDs without accepting authority fields", () => {
  assert.deepEqual(
    foundationReadRecordSchema.parse({ projectId, id: clientId }),
    {
      projectId: projectId.toLowerCase(),
      id: clientId.toLowerCase(),
    },
  );
  reject(foundationReadRecordSchema, { projectId });
  reject(foundationReadRecordSchema, { id: clientId });
  reject(foundationReadRecordSchema, { projectId: "invalid", id: clientId });
  reject(foundationReadRecordSchema, { projectId, id: "invalid" });
  for (const field of ["actor", "capabilities", "token", "verified"]) {
    reject(foundationReadRecordSchema, {
      projectId,
      id: clientId,
      [field]: "injected",
    });
  }
});

test("configuration mutations preserve source content and server-owned boundaries", () => {
  const parsed = foundationCreateConfigurationSchema.parse(configuration());
  assert.equal(parsed.projectId, projectId.toLowerCase());
  assert.equal(parsed.content, configuration().content);
  assert.deepEqual(parsed.parentIds, [clientId.toLowerCase()]);
  assert.equal(parsed.sourceCommit, null);
  for (const kind of [
    "prompt",
    "skill",
    "hook",
    "loop",
    "runtime",
    "model",
    "settings",
  ]) {
    assert.equal(
      foundationCreateConfigurationSchema.parse({ ...configuration(), kind })
        .kind,
      kind,
    );
  }
  for (const field of [
    "id",
    "contentDigest",
    "recordedAt",
    "recordedBy",
    "schemaVersion",
    "actor",
    "token",
  ]) {
    reject(foundationCreateConfigurationSchema, {
      ...configuration(),
      [field]: "caller-controlled",
    });
  }
  reject(foundationCreateConfigurationSchema, {
    ...configuration(),
    sourceCommit: " ",
  });
  reject(foundationCreateConfigurationSchema, {
    ...configuration(),
    kind: "integration",
  });
  for (const field of Object.keys(configuration())) {
    const candidate: Record<string, unknown> = configuration();
    delete candidate[field];
    reject(foundationCreateConfigurationSchema, candidate);
  }
});

test("configuration mutation limits preserve the full allowed content and parent set", () => {
  const parentIds = Array.from(
    { length: 1001 },
    (_, index) =>
      "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0"),
  );
  assert.equal(
    foundationCreateConfigurationSchema.parse({
      ...configuration(),
      parentIds: parentIds.slice(0, 1000),
      content: "x".repeat(1000000),
    }).parentIds.length,
    1000,
  );
  assert.equal(
    foundationCreateConfigurationSchema.parse({
      ...configuration(),
      parentIds: [],
      content: "",
    }).content,
    "",
  );
  reject(foundationCreateConfigurationSchema, {
    ...configuration(),
    parentIds,
  });
  reject(foundationCreateConfigurationSchema, {
    ...configuration(),
    parentIds: [clientId, clientId.toLowerCase()],
  });
  reject(foundationCreateConfigurationSchema, {
    ...configuration(),
    parentIds: ["invalid"],
  });
  reject(foundationCreateConfigurationSchema, {
    ...configuration(),
    content: "x".repeat(1000001),
  });
});

test("instruction approvals bind exact version, digest and normalized project scope", () => {
  const parsed = foundationInstructionApprovalSchema.parse({
    ...approval(),
    disclosureProjectId: projectId.toLowerCase(),
  });
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.id, clientId.toLowerCase());
  assert.equal(parsed.projectId, projectId.toLowerCase());
  assert.equal(parsed.memoryId, memoryId.toLowerCase());
  assert.equal(parsed.disclosureProjectId, projectId.toLowerCase());
  assert.equal(parsed.version, 1);
  assert.equal(parsed.contentDigest, "a".repeat(64));
  assert.equal(parsed.approvedBy, "owner:isaac");
  assert.equal(parsed.revokedAt, null);
  assert.equal(
    foundationInstructionApprovalSchema.parse({
      ...approval(),
      version: Number.MAX_SAFE_INTEGER,
      approvedBy: "h".repeat(500),
    }).version,
    Number.MAX_SAFE_INTEGER,
  );
  for (const version of [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    "1",
  ]) {
    reject(foundationInstructionApprovalSchema, { ...approval(), version });
  }
  for (const contentDigest of [
    "A".repeat(64),
    "g".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
    "a".repeat(64) + "\n",
    " " + "a".repeat(64),
  ]) {
    reject(foundationInstructionApprovalSchema, {
      ...approval(),
      contentDigest,
    });
  }
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    disclosureProjectId: memoryId,
  });
  for (const approvedBy of ["", " \t", "h".repeat(501)]) {
    reject(foundationInstructionApprovalSchema, { ...approval(), approvedBy });
  }
});

test("instruction approvals require complete persisted fields and forbid excess grants", () => {
  for (const field of Object.keys(approval())) {
    const candidate: Record<string, unknown> = approval();
    delete candidate[field];
    reject(foundationInstructionApprovalSchema, candidate);
  }
  for (const field of [
    "approved",
    "capabilities",
    "operations",
    "actor",
    "token",
    "expectedVersion",
    "verification",
  ]) {
    reject(foundationInstructionApprovalSchema, {
      ...approval(),
      [field]: true,
    });
  }
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    schemaVersion: 2,
  });
  for (const field of ["id", "projectId", "memoryId", "disclosureProjectId"]) {
    reject(foundationInstructionApprovalSchema, {
      ...approval(),
      [field]: "bad",
    });
  }
});

test("instruction approval timestamps enforce strict instants and lifecycle ordering", () => {
  for (const field of ["approvedAt", "expiresAt", "revokedAt"]) {
    for (const value of invalidDatetimes) {
      reject(foundationInstructionApprovalSchema, {
        ...approval(),
        [field]: value,
      });
    }
  }
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    expiresAt: createdAt,
  });
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    expiresAt: "2026-10-15T11:00:00+02:00",
  });
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    revokedAt: "2026-10-15T09:59:59Z",
  });
  assert.equal(
    foundationInstructionApprovalSchema.parse({
      ...approval(),
      revokedAt: "2026-10-17T10:00:00Z",
    }).revokedAt,
    "2026-10-17T10:00:00Z",
  );
  assert.equal(
    foundationInstructionApprovalSchema.parse({
      ...approval(),
      approvedAt: "2026-10-15T12:00:00.000001+02:00",
      expiresAt: "2026-10-15T10:00:00.000002Z",
      revokedAt: "2026-10-15T10:00:00.000001Z",
    }).revokedAt,
    "2026-10-15T10:00:00.000001Z",
  );
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    approvedAt: "2026-10-15T10:00:00.000002Z",
    revokedAt: "2026-10-15T10:00:00.000001Z",
  });
});

test("exact temporal ordering normalizes long fractions before millisecond parsing", () => {
  const earlier = "2026-10-15T12:00:00.099999999999999999Z";
  const later = "2026-10-15T12:00:00.100Z";
  reject(foundationClientSchema, {
    ...client(),
    createdAt: later,
    expiresAt: earlier,
  });
  assert.equal(
    foundationClientSchema.safeParse({
      ...client(),
      createdAt: earlier,
      expiresAt: later,
    }).success,
    true,
  );
  reject(foundationInstructionApprovalSchema, {
    ...approval(),
    approvedAt: later,
    expiresAt: earlier,
  });
  assert.equal(
    foundationInstructionApprovalSchema.safeParse({
      ...approval(),
      approvedAt: earlier,
      expiresAt: later,
    }).success,
    true,
  );
  reject(foundationClientSchema, {
    ...client(),
    createdAt: later,
    expiresAt,
    revokedAt: earlier,
  });
});

test("Work content read remains an explicit separate issuance choice", () => {
  const common = {
    name: "Work reader",
    projectId,
    environment: "test",
    ttlSeconds: 3600,
  };
  assert.deepEqual(
    foundationCreateClientSchema.parse({ ...common, operations: ["work.read"] })
      .operations,
    ["work.read"],
  );
  assert.deepEqual(
    foundationCreateClientSchema.parse({
      ...common,
      operations: ["foundation.read"],
    }).operations,
    ["foundation.read"],
  );
  const oldOperations = [
    "foundation.read",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "configuration.record",
    "evaluation.record",
  ];
  assert.deepEqual(
    foundationCreateClientSchema.parse({ ...common, operations: oldOperations })
      .operations,
    oldOperations,
  );
  assert.equal(foundationCreateClientSchema.safeParse(common).success, false);
  assert.equal(
    foundationCreateClientSchema.safeParse({
      ...common,
      operations: ["work.read", "work.read"],
    }).success,
    false,
  );
});

test("canonical resources read is a separate explicit machine choice and old grants remain exact", () => {
  const common = {
    name: "Resource reader",
    projectId,
    environment: "test",
    ttlSeconds: 3600,
  };
  assert.deepEqual(
    foundationCreateClientSchema.parse({
      ...common,
      operations: ["resources.read"],
    }).operations,
    ["resources.read"],
  );
  const old = [
    "foundation.read",
    "work.read",
    "work.propose",
    "evidence.record",
    "memory.propose",
    "memory.revise",
    "configuration.record",
    "evaluation.record",
  ];
  assert.deepEqual(
    foundationCreateClientSchema.parse({ ...common, operations: old })
      .operations,
    old,
  );
  assert.equal(
    foundationCreateClientSchema.safeParse({
      ...common,
      operations: ["resources.read", "resources.read"],
    }).success,
    false,
  );
});
