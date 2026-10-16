import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import {
  foundationProjectResourceCursorSchema,
  foundationProjectResourcePageSchema,
  foundationProjectResourceQuerySchema,
  foundationProjectResourceRecordSchema,
  foundationProjectResourceToolQuerySchema,
  type FoundationProjectResourceCursor,
  type FoundationProjectResourcePage,
  type FoundationProjectResourceQuery,
  type FoundationProjectResourceRecord,
  type FoundationProjectResourceToolQuery,
} from "./foundation-resources.js";
import {
  projectResourceLinkSchema,
  resourceSummarySchema,
} from "./resources.js";

const projectId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const foreignProjectId = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
const connectionId = "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC";
const resourceId = "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD";
const parentId = "EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE";
const secondConnectionId = "FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF";
const selectedAt = "2026-10-16T10:00:00.123456+02:00";
const contentDigest = "a".repeat(64);
const resource = () => ({
  id: resourceId,
  kind: " exact kind\r\n",
  name: "  exact cafe\u0301 \u2603 \ud83c\udf0c\r\n\t",
  subtype: null,
  parentResourceId: null,
  state: null,
  externalUrl: null,
  lastObservedAt: null,
});
const connection = () => ({
  id: connectionId,
  type: "supports",
  inverseType: "supported_by",
  resource: resource(),
});
const page = () => ({
  schemaVersion: 1,
  requestedProjectId: projectId,
  consistency: "live",
  selectedAt,
  items: [{ connection: connection(), contentDigest }],
  nextCursor: null,
});
const reject = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => assert.equal(schema.safeParse(value).success, false);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test("bounded queries default live continuation and normalize only binding UUIDs", () => {
  const tool: FoundationProjectResourceToolQuery =
    foundationProjectResourceToolQuerySchema.parse({});
  assert.deepEqual(tool, { limit: 25, cursor: null });
  const query: FoundationProjectResourceQuery =
    foundationProjectResourceQuerySchema.parse({ projectId });
  assert.deepEqual(query, {
    projectId: projectId.toLowerCase(),
    limit: 25,
    cursor: null,
  });
  const cursor: FoundationProjectResourceCursor =
    foundationProjectResourceCursorSchema.parse({
      projectId,
      afterLinkId: connectionId,
    });
  assert.deepEqual(cursor, {
    projectId: projectId.toLowerCase(),
    afterLinkId: connectionId.toLowerCase(),
  });
  assert.deepEqual(
    foundationProjectResourceQuerySchema.parse({
      projectId,
      limit: 100,
      cursor: { projectId: projectId.toLowerCase(), afterLinkId: connectionId },
    }),
    {
      projectId: projectId.toLowerCase(),
      limit: 100,
      cursor,
    },
  );
  for (const limit of [1, 100])
    assert.equal(
      foundationProjectResourceToolQuerySchema.parse({ limit }).limit,
      limit,
    );
  for (const limit of [0, 101, -1, 1.5, "25", null, Infinity, NaN]) {
    reject(foundationProjectResourceToolQuerySchema, { limit });
    reject(foundationProjectResourceQuerySchema, { projectId, limit });
  }
});

test("strict cursor and full query reject missing, invalid and foreign scope", () => {
  const cursor = { projectId, afterLinkId: connectionId };
  for (const field of Object.keys(cursor)) {
    const missing: Record<string, unknown> = { ...cursor };
    delete missing[field];
    reject(foundationProjectResourceCursorSchema, missing);
    reject(foundationProjectResourceCursorSchema, {
      ...cursor,
      [field]: "invalid",
    });
  }
  for (const cursor of [
    "opaque",
    {},
    { projectId },
    { afterLinkId: connectionId },
    [],
    1,
  ]) {
    reject(foundationProjectResourceToolQuerySchema, { cursor });
    reject(foundationProjectResourceQuerySchema, { projectId, cursor });
  }
  reject(foundationProjectResourceQuerySchema, {
    projectId,
    cursor: { projectId: foreignProjectId, afterLinkId: connectionId },
  });
  // Tool input cannot establish authenticated project scope by itself.
  assert.equal(
    foundationProjectResourceToolQuerySchema.parse({
      cursor: { projectId: foreignProjectId, afterLinkId: connectionId },
    }).cursor?.projectId,
    foreignProjectId.toLowerCase(),
  );
  reject(foundationProjectResourceToolQuerySchema, { projectId });
  reject(foundationProjectResourceQuerySchema, {});
  reject(foundationProjectResourceQuerySchema, { projectId: "invalid" });
});

test("every request boundary rejects caller authority, raw inputs and arbitrary filters", () => {
  for (const field of [
    "actor",
    "principalId",
    "capabilities",
    "environment",
    "credential",
    "token",
    "tokenDigest",
    "approved",
    "raw",
    "originalContent",
    "sourceContent",
    "asOf",
    "snapshot",
    "afterId",
    "afterLinkId",
    "offset",
    "kind",
    "state",
    "search",
    "resourceId",
    "projectIds",
    "unknown",
  ]) {
    reject(foundationProjectResourceToolQuerySchema, { [field]: "injected" });
    reject(foundationProjectResourceQuerySchema, {
      projectId,
      [field]: "injected",
    });
    // afterLinkId is the one supported cursor selector.
    if (field !== "afterLinkId")
      reject(foundationProjectResourceCursorSchema, {
        projectId,
        afterLinkId: connectionId,
        [field]: "injected",
      });
  }
  reject(foundationProjectResourceToolQuerySchema, {
    cursor: { projectId, afterLinkId: connectionId, actor: "owner" },
  });
});

test("records compose canonical connection and resource fields without redefining them", () => {
  const candidate = connection();
  const parsed: FoundationProjectResourceRecord =
    foundationProjectResourceRecordSchema.parse(candidate);
  assert.deepEqual(parsed, projectResourceLinkSchema.parse(candidate));
  assert.deepEqual(
    parsed.resource,
    resourceSummarySchema.parse(candidate.resource),
  );
  assert.equal(parsed.id, connectionId);
  assert.equal(parsed.resource.id, resourceId);
  assert.deepEqual(Object.keys(parsed), [
    "id",
    "type",
    "inverseType",
    "resource",
  ]);
  for (const field of Object.keys(candidate)) {
    const missing: Record<string, unknown> = { ...candidate };
    delete missing[field];
    reject(foundationProjectResourceRecordSchema, missing);
    reject(foundationProjectResourceRecordSchema, {
      ...candidate,
      [field]: undefined,
    });
  }
  for (const field of Object.keys(candidate.resource)) {
    const missing: Record<string, unknown> = { ...candidate.resource };
    delete missing[field];
    reject(foundationProjectResourceRecordSchema, {
      ...candidate,
      resource: missing,
    });
    reject(foundationProjectResourceRecordSchema, {
      ...candidate,
      resource: { ...candidate.resource, [field]: undefined },
    });
  }
});

test("canonical strings, UUID spelling, URLs, states, timestamps and nullables remain exact", () => {
  const rich = {
    ...connection(),
    resource: {
      ...resource(),
      subtype: " exact subtype\r\n",
      parentResourceId: parentId,
      state: " unknown \r\n",
      externalUrl: "https://Example.com:443/path?exact=%C3%A9#ref",
      lastObservedAt: "2026-10-15T12:00:00.000001+02:00",
    },
  };
  assert.deepEqual(foundationProjectResourceRecordSchema.parse(rich), rich);
  for (const field of ["subtype", "state"] as const) {
    for (const value of [
      null,
      "",
      " \t\r\n",
      "\ud800",
      "\u2603".repeat(10001),
    ]) {
      assert.equal(
        foundationProjectResourceRecordSchema.parse({
          ...connection(),
          resource: { ...resource(), [field]: value },
        }).resource[field],
        value,
      );
    }
  }
  // Canonical string rules are deliberately unchanged, including lone surrogates.
  for (const name of [" ", "\ud800", resource().name]) {
    assert.equal(
      foundationProjectResourceRecordSchema.parse({
        ...connection(),
        resource: { ...resource(), name },
      }).resource.name,
      name,
    );
  }
  for (const [type, inverseType] of [
    ["supports", "supported_by"],
    ["relates_to", "relates_to"],
  ]) {
    const result = foundationProjectResourceRecordSchema.parse({
      ...connection(),
      type,
      inverseType,
    });
    assert.equal(result.type, type);
    assert.equal(result.inverseType, inverseType);
  }
});

test("canonical invalid resource values remain invalid and no missing data is repaired", () => {
  for (const extra of [
    { id: "invalid" },
    { kind: "" },
    { name: "" },
    { subtype: 1 },
    { parentResourceId: "invalid" },
    { state: 1 },
    { externalUrl: "not-a-url" },
    { lastObservedAt: "2026-02-30T12:00:00Z" },
    { lastObservedAt: "2026-10-16" },
  ])
    reject(foundationProjectResourceRecordSchema, {
      ...connection(),
      resource: { ...resource(), ...extra },
    });
  for (const extra of [
    { id: "invalid" },
    { type: "owns" },
    { inverseType: "owned_by" },
    { resource: null },
  ])
    reject(foundationProjectResourceRecordSchema, {
      ...connection(),
      ...extra,
    });
});

test("connection and nested resource objects are closed and disclose no unrelated metadata", () => {
  for (const field of [
    "projectId",
    "primaryProjectId",
    "actor",
    "capabilities",
    "tokenDigest",
    "original",
    "capture",
    "raw",
    "contentDigest",
    "active",
    "freshness",
    "verified",
    "granted",
    "unknown",
  ]) {
    reject(foundationProjectResourceRecordSchema, {
      ...connection(),
      [field]: "injected",
    });
    reject(foundationProjectResourceRecordSchema, {
      ...connection(),
      resource: { ...resource(), [field]: "injected" },
    });
  }
});

test("page envelopes require exact live metadata and lowercase hexadecimal digests", () => {
  for (const field of Object.keys(page())) {
    const missing: Record<string, unknown> = page();
    delete missing[field];
    reject(foundationProjectResourcePageSchema, missing);
    reject(foundationProjectResourcePageSchema, {
      ...page(),
      [field]: undefined,
    });
  }
  for (const extra of [
    { schemaVersion: 2 },
    { requestedProjectId: "invalid" },
    { consistency: "snapshot" },
    { selectedAt: "2026-02-30T00:00:00Z" },
    { selectedAt: "2026-10-16T10:00:00" },
    { selectedAt: "2026-10-16T10:00:00Z\n" },
    { items: {} },
    { asOf: selectedAt },
    { frozen: true },
    { truncated: false },
    { cutoff: selectedAt },
    { exhausted: true },
    { actor: "owner" },
    { raw: "private" },
  ])
    reject(foundationProjectResourcePageSchema, { ...page(), ...extra });
  for (const item of [
    { connection: connection() },
    { contentDigest },
    { connection: connection(), contentDigest, actor: "owner" },
    { connection: connection(), contentDigest, raw: "private" },
  ])
    reject(foundationProjectResourcePageSchema, { ...page(), items: [item] });
  for (const digest of [
    "A".repeat(64),
    "g".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
    contentDigest + "\n",
    " " + contentDigest,
    null,
  ]) {
    reject(foundationProjectResourcePageSchema, {
      ...page(),
      items: [{ connection: connection(), contentDigest: digest }],
    });
  }
});

test("duplicate connection identities are rejected while repeated resources remain distinct edges", () => {
  const repeatResource = {
    ...connection(),
    id: secondConnectionId,
    type: "relates_to",
    inverseType: "relates_to",
  };
  const parsed = foundationProjectResourcePageSchema.parse({
    ...page(),
    items: [
      { connection: connection(), contentDigest },
      { connection: repeatResource, contentDigest },
    ],
  });
  assert.equal(parsed.items.length, 2);
  assert.equal(
    parsed.items[0]?.connection.resource.id,
    parsed.items[1]?.connection.resource.id,
  );
  assert.notEqual(
    parsed.items[0]?.connection.id,
    parsed.items[1]?.connection.id,
  );
  for (const duplicate of [connectionId, connectionId.toLowerCase()])
    reject(foundationProjectResourcePageSchema, {
      ...page(),
      items: [
        { connection: connection(), contentDigest },
        { connection: { ...repeatResource, id: duplicate }, contentDigest },
      ],
    });
});

test("continuations require a nonempty page, matching project and last connection identity", () => {
  const items = [
    { connection: connection(), contentDigest },
    { connection: { ...connection(), id: secondConnectionId }, contentDigest },
  ];
  const nextCursor = { projectId, afterLinkId: secondConnectionId };
  const parsed: FoundationProjectResourcePage =
    foundationProjectResourcePageSchema.parse({ ...page(), items, nextCursor });
  assert.equal(parsed.requestedProjectId, projectId.toLowerCase());
  assert.deepEqual(parsed.nextCursor, {
    projectId: projectId.toLowerCase(),
    afterLinkId: secondConnectionId.toLowerCase(),
  });
  assert.equal(parsed.items[1]?.connection.id, secondConnectionId);
  for (const cursor of [
    { projectId, afterLinkId: connectionId },
    { projectId, afterLinkId: resourceId },
    { projectId: foreignProjectId, afterLinkId: secondConnectionId },
    { ...nextCursor, asOf: selectedAt },
    { ...nextCursor, approved: true },
    {},
    "opaque",
  ])
    reject(foundationProjectResourcePageSchema, {
      ...page(),
      items,
      nextCursor: cursor,
    });
  reject(foundationProjectResourcePageSchema, {
    ...page(),
    items: [],
    nextCursor,
  });
  assert.deepEqual(
    foundationProjectResourcePageSchema.parse({
      ...page(),
      items: [],
      nextCursor: null,
    }).items,
    [],
  );
  assert.equal(
    foundationProjectResourcePageSchema.parse({
      ...page(),
      items,
      nextCursor: null,
    }).nextCursor,
    null,
  );
});

test("100-item pages preserve every edge and oversized pages fail without truncating", () => {
  const items = Array.from({ length: 101 }, (_, index) => ({
    connection: {
      ...connection(),
      id: "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0"),
    },
    contentDigest,
  }));
  const full = items.slice(0, 100);
  const parsed = foundationProjectResourcePageSchema.parse({
    ...page(),
    items: full,
    nextCursor: { projectId, afterLinkId: full.at(-1)!.connection.id },
  });
  assert.deepEqual(parsed.items, full);
  assert.equal(parsed.items.length, 100);
  reject(foundationProjectResourcePageSchema, { ...page(), items });
});

test("parsing leaves immutable source and input records unchanged", () => {
  const source = deepFreeze({
    ...page(),
    nextCursor: { projectId, afterLinkId: connectionId },
  });
  const before = structuredClone(source);
  const parsed = foundationProjectResourcePageSchema.parse(source);
  assert.deepEqual(source, before);
  assert.equal(source.requestedProjectId, projectId);
  assert.equal(source.nextCursor.projectId, projectId);
  assert.equal(parsed.requestedProjectId, projectId.toLowerCase());
  assert.notEqual(parsed, source);
  assert.notEqual(
    parsed.items[0]!.connection.resource,
    source.items[0]!.connection.resource,
  );
  assert.deepEqual(
    parsed.items[0]!.connection.resource,
    source.items[0]!.connection.resource,
  );
  parsed.items[0]!.connection.resource.name = "parsed copy";
  assert.equal(source.items[0]!.connection.resource.name, resource().name);
});

test("all schemas remain JSON-schema representable with strict field discovery", () => {
  for (const schema of [
    foundationProjectResourceRecordSchema,
    foundationProjectResourceCursorSchema,
    foundationProjectResourceToolQuerySchema,
    foundationProjectResourceQuerySchema,
    foundationProjectResourcePageSchema,
  ]) {
    for (const io of ["input", "output"] as const) {
      const json = z.toJSONSchema(schema, { io });
      assert.equal(json.type, "object");
      assert.equal(json.additionalProperties, false);
      assert.doesNotThrow(() => JSON.stringify(json));
    }
  }
  const tool = z.toJSONSchema(foundationProjectResourceToolQuerySchema, {
    io: "input",
  });
  assert.deepEqual(Object.keys(tool.properties ?? {}), ["limit", "cursor"]);
  const record = z.toJSONSchema(foundationProjectResourceRecordSchema, {
    io: "input",
  });
  assert.equal(
    (record.properties?.resource as { additionalProperties: boolean })
      .additionalProperties,
    false,
  );
});

test("live DTOs make no SQL membership, order, digest, freshness or grant claims", () => {
  const first = {
    ...connection(),
    id: secondConnectionId,
    resource: { ...resource(), lastObservedAt: "2026-10-17T00:00:00Z" },
  };
  const parsed = foundationProjectResourcePageSchema.parse({
    ...page(),
    selectedAt: "2026-10-14T00:00:00Z",
    items: [
      { connection: first, contentDigest: "0".repeat(64) },
      { connection: connection(), contentDigest },
    ],
  });
  assert.equal(parsed.items[0]!.connection.id, secondConnectionId);
  assert.equal(
    parsed.items[0]!.connection.resource.lastObservedAt,
    "2026-10-17T00:00:00Z",
  );
  assert.equal(parsed.items[0]!.contentDigest, "0".repeat(64));
  assert.equal(parsed.consistency, "live");
});
