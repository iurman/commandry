import assert from "node:assert/strict";
import { test } from "vitest";
import {
  foundationProjectWorkCursorSchema,
  foundationProjectWorkPageSchema,
  foundationProjectWorkQuerySchema,
  foundationProjectWorkRecordSchema,
  foundationProjectWorkToolQuerySchema,
} from "./foundation-work.js";
import { workItemSchema } from "./work.js";

const projectId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
const primaryProjectId = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
const workId = "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC";
const captureId = "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD";
const linkId = "EEEEEEEE-EEEE-4EEE-8EEE-EEEEEEEEEEEE";
const agentId = "FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF";
const createdAt = "2026-10-15T12:00:00.123456+02:00";
const updatedAt = "2026-10-16T00:00:00.000001Z";
const selectedAt = "2026-10-16T00:00:00.000002Z";
const contentDigest = "a".repeat(64);
const work = () => ({
  id: workId,
  projectId,
  sourceCaptureId: captureId,
  generatedFromWorkItemId: null,
  title: "  Source-backed Work \u2603\r\n\t",
  description: "  exact \u03bb\r\n\t\u00e9\u0301 \ud83c\udf0c\n",
  workType: "task",
  assigneeKind: "unassigned",
  assigneeAgentId: null,
  assigneeLabel: null,
  status: "open",
  priority: null,
  dueOn: null,
  contextLink: null,
  createdAt,
  updatedAt,
});
const link = () => ({ id: linkId, projectId, createdAt });
const page = () => ({
  schemaVersion: 1,
  requestedProjectId: projectId,
  consistency: "live",
  selectedAt,
  items: [{ work: work(), contentDigest }],
  nextCursor: null,
});
const reject = (
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) => assert.equal(schema.safeParse(value).success, false);

test("queries default bounded live continuation and normalize only UUID bindings", () => {
  assert.deepEqual(foundationProjectWorkQuerySchema.parse({ projectId }), {
    projectId: projectId.toLowerCase(),
    limit: 25,
    cursor: null,
  });
  assert.deepEqual(foundationProjectWorkToolQuerySchema.parse({}), {
    limit: 25,
    cursor: null,
  });
  assert.deepEqual(
    foundationProjectWorkQuerySchema.parse({
      projectId,
      limit: 100,
      cursor: { projectId: projectId.toLowerCase(), afterId: workId },
    }),
    {
      projectId: projectId.toLowerCase(),
      limit: 100,
      cursor: {
        projectId: projectId.toLowerCase(),
        afterId: workId.toLowerCase(),
      },
    },
  );
  for (const limit of [1, 100]) {
    assert.equal(
      foundationProjectWorkToolQuerySchema.parse({ limit, cursor: null }).limit,
      limit,
    );
  }
  for (const limit of [0, 101, -1, 1.5, "25", null, Infinity, NaN]) {
    reject(foundationProjectWorkQuerySchema, { projectId, limit });
    reject(foundationProjectWorkToolQuerySchema, { limit });
  }
});

test("cursors are strict binding data and full queries reject foreign bindings", () => {
  const cursor = { projectId, afterId: workId };
  assert.deepEqual(foundationProjectWorkCursorSchema.parse(cursor), {
    projectId: projectId.toLowerCase(),
    afterId: workId.toLowerCase(),
  });
  for (const field of ["projectId", "afterId"]) {
    const candidate: Record<string, unknown> = { ...cursor };
    delete candidate[field];
    reject(foundationProjectWorkCursorSchema, candidate);
    reject(foundationProjectWorkCursorSchema, {
      ...cursor,
      [field]: "invalid-uuid",
    });
  }
  reject(foundationProjectWorkQuerySchema, {
    projectId,
    cursor: { projectId: primaryProjectId, afterId: workId },
  });
  // A tool query has no actor project until the endpoint injects it.
  assert.equal(
    foundationProjectWorkToolQuerySchema.parse({
      cursor: { projectId: primaryProjectId, afterId: workId },
    }).cursor?.projectId,
    primaryProjectId.toLowerCase(),
  );
  for (const cursor of ["opaque", {}, { projectId }, { afterId: workId }]) {
    reject(foundationProjectWorkQuerySchema, { projectId, cursor });
    reject(foundationProjectWorkToolQuerySchema, { cursor });
  }
  reject(foundationProjectWorkQuerySchema, {});
  reject(foundationProjectWorkQuerySchema, { projectId: "invalid" });
  reject(foundationProjectWorkToolQuerySchema, { projectId });
});

test("all request levels reject authority injection and unsupported snapshot filters", () => {
  for (const field of [
    "actor",
    "principalId",
    "capabilities",
    "environment",
    "token",
    "approved",
    "asOf",
    "dueAsOf",
    "offset",
    "afterId",
    "original",
    "sourceContent",
  ]) {
    reject(foundationProjectWorkQuerySchema, {
      projectId,
      [field]: "injected",
    });
    reject(foundationProjectWorkToolQuerySchema, { [field]: "injected" });
    reject(foundationProjectWorkCursorSchema, {
      projectId,
      afterId: workId,
      [field]: "injected",
    });
  }
  reject(foundationProjectWorkQuerySchema, {
    projectId,
    cursor: { projectId, afterId: workId, granted: true },
  });
});

test("records compose the canonical Work contract and require every serializer field", () => {
  const candidate = work();
  assert.deepEqual(
    foundationProjectWorkRecordSchema.parse(candidate),
    workItemSchema.parse(candidate),
  );
  for (const field of Object.keys(candidate)) {
    const missing: Record<string, unknown> = { ...candidate };
    delete missing[field];
    reject(foundationProjectWorkRecordSchema, missing);
    reject(foundationProjectWorkRecordSchema, {
      ...candidate,
      [field]: undefined,
    });
  }
  // Optional UI fields stay optional on the existing schema.
  assert.equal(
    workItemSchema.safeParse({
      id: workId,
      projectId,
      sourceCaptureId: captureId,
      title: "Task",
      description: "",
      status: "open",
      createdAt,
      updatedAt,
    }).success,
    true,
  );
  for (const field of [
    "id",
    "projectId",
    "sourceCaptureId",
    "generatedFromWorkItemId",
    "assigneeAgentId",
  ]) {
    reject(foundationProjectWorkRecordSchema, {
      ...candidate,
      [field]: "invalid-uuid",
    });
  }
});

test("all canonical types, statuses, assignment, priority and due fields survive", () => {
  for (const workType of ["task", "initiative", "subtask"]) {
    for (const status of ["open", "done"]) {
      const parsed = foundationProjectWorkRecordSchema.parse({
        ...work(),
        workType,
        status,
      });
      assert.equal(parsed.workType, workType);
      assert.equal(parsed.status, status);
    }
  }
  for (const assigneeKind of ["unassigned", "local_user", "agent"]) {
    const parsed = foundationProjectWorkRecordSchema.parse({
      ...work(),
      assigneeKind,
      assigneeAgentId: agentId,
      assigneeLabel: "  exact synthetic assignee\r\n",
      generatedFromWorkItemId: linkId,
    });
    assert.equal(parsed.assigneeKind, assigneeKind);
    assert.equal(parsed.assigneeAgentId, agentId);
    assert.equal(parsed.assigneeLabel, "  exact synthetic assignee\r\n");
    assert.equal(parsed.generatedFromWorkItemId, linkId);
  }
  for (const priority of [null, "low", "normal", "high"]) {
    assert.equal(
      foundationProjectWorkRecordSchema.parse({ ...work(), priority }).priority,
      priority,
    );
  }
  assert.equal(
    foundationProjectWorkRecordSchema.parse({ ...work(), dueOn: "2024-02-29" })
      .dueOn,
    "2024-02-29",
  );
  for (const extra of [
    { workType: "milestone" },
    { workType: null },
    { status: "blocked" },
    { status: null },
    { assigneeKind: "human" },
    { assigneeKind: null },
    { priority: "urgent" },
    { dueOn: "2026-02-30" },
    { dueOn: "2026-10-16T00:00:00Z" },
    { createdAt: "2026-10-16" },
    { updatedAt: "2026-02-30T00:00:00Z" },
  ]) {
    reject(foundationProjectWorkRecordSchema, { ...work(), ...extra });
  }
});

test("record and nested context forbid source leaks and authority claims", () => {
  for (const field of [
    "original",
    "sourceContent",
    "capture",
    "contentDigest",
    "actor",
    "capabilities",
    "tokenDigest",
    "verified",
    "activeMembership",
  ]) {
    reject(foundationProjectWorkRecordSchema, {
      ...work(),
      [field]: "private",
    });
    reject(foundationProjectWorkRecordSchema, {
      ...work(),
      contextLink: { ...link(), [field]: "private" },
    });
  }
  for (const field of Object.keys(link())) {
    const contextLink: Record<string, unknown> = link();
    delete contextLink[field];
    reject(foundationProjectWorkRecordSchema, { ...work(), contextLink });
  }
  for (const contextLink of [
    { ...link(), id: "invalid" },
    { ...link(), projectId: "invalid" },
    { ...link(), createdAt: "2026-10-16" },
    { ...link(), active: true },
    [],
  ]) {
    reject(foundationProjectWorkRecordSchema, { ...work(), contextLink });
  }
});

test("text, identifiers and precise timestamps retain their canonical exact values", () => {
  const parsed = foundationProjectWorkRecordSchema.parse({
    ...work(),
    contextLink: link(),
  });
  assert.equal(parsed.id, workId);
  assert.equal(parsed.projectId, projectId);
  assert.equal(parsed.sourceCaptureId, captureId);
  assert.equal(parsed.contextLink?.id, linkId);
  assert.equal(parsed.title, work().title);
  assert.equal(parsed.description, work().description);
  assert.equal(parsed.createdAt, createdAt);
  assert.equal(parsed.updatedAt, updatedAt);
  assert.equal(parsed.contextLink?.createdAt, createdAt);
  for (const description of ["", " \t\r\n", "\u2603".repeat(1000001)]) {
    assert.equal(
      foundationProjectWorkRecordSchema.parse({ ...work(), description })
        .description,
      description,
    );
  }
  assert.equal(
    foundationProjectWorkPageSchema.parse(page()).selectedAt,
    selectedAt,
  );
});

test("project pages retain real primary ownership and enforce every context binding", () => {
  const linked = {
    ...work(),
    projectId: primaryProjectId,
    contextLink: link(),
  };
  const parsed = foundationProjectWorkPageSchema.parse({
    ...page(),
    items: [{ work: linked, contentDigest }],
  });
  assert.equal(parsed.requestedProjectId, projectId.toLowerCase());
  assert.equal(parsed.items[0]?.work.projectId, primaryProjectId);
  assert.equal(parsed.items[0]?.work.sourceCaptureId, captureId);
  assert.equal(parsed.items[0]?.work.contextLink?.projectId, projectId);
  assert.equal(
    foundationProjectWorkPageSchema.safeParse({
      ...page(),
      items: [{ work: { ...work(), contextLink: link() }, contentDigest }],
    }).success,
    true,
  );
  for (const candidate of [
    { ...work(), projectId: primaryProjectId },
    {
      ...linked,
      contextLink: { ...link(), projectId: primaryProjectId },
    },
    { ...work(), contextLink: { ...link(), projectId: primaryProjectId } },
  ]) {
    reject(foundationProjectWorkPageSchema, {
      ...page(),
      items: [{ work: candidate, contentDigest }],
    });
  }
});

test("pages require complete live metadata and strict item envelopes", () => {
  for (const field of Object.keys(page())) {
    const missing: Record<string, unknown> = page();
    delete missing[field];
    reject(foundationProjectWorkPageSchema, missing);
  }
  for (const extra of [
    { schemaVersion: 2 },
    { requestedProjectId: "invalid" },
    { consistency: "snapshot" },
    { selectedAt: "2026-02-30T00:00:00Z" },
    { selectedAt: "2026-10-16T00:00:00" },
    { selectedAt: "2026-10-16T00:00:00Z\n" },
    { asOf: selectedAt },
    { dueAsOf: selectedAt },
    { exhausted: true },
    { actor: "owner" },
    { original: "private" },
    { items: {} },
  ]) {
    reject(foundationProjectWorkPageSchema, { ...page(), ...extra });
  }
  for (const item of [
    { work: work() },
    { contentDigest },
    { work: work(), contentDigest, original: "private" },
    { work: work(), contentDigest, verified: true },
  ]) {
    reject(foundationProjectWorkPageSchema, { ...page(), items: [item] });
  }
  for (const digest of [
    "A".repeat(64),
    "g".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
    contentDigest + "\n",
    " " + contentDigest,
  ]) {
    reject(foundationProjectWorkPageSchema, {
      ...page(),
      items: [{ work: work(), contentDigest: digest }],
    });
  }
});

test("pages reject duplicate identities and bind continuation to the last result", () => {
  const second = { ...work(), id: linkId };
  const items = [
    { work: work(), contentDigest },
    { work: second, contentDigest },
  ];
  const nextCursor = { projectId, afterId: linkId };
  const parsed = foundationProjectWorkPageSchema.parse({
    ...page(),
    items,
    nextCursor,
  });
  assert.equal(parsed.nextCursor?.afterId, linkId.toLowerCase());
  for (const cursor of [
    { projectId, afterId: workId },
    { projectId: primaryProjectId, afterId: linkId },
    { ...nextCursor, asOf: selectedAt },
    { ...nextCursor, approved: true },
    {},
    "opaque",
  ]) {
    reject(foundationProjectWorkPageSchema, {
      ...page(),
      items,
      nextCursor: cursor,
    });
  }
  reject(foundationProjectWorkPageSchema, {
    ...page(),
    items: [
      { work: work(), contentDigest },
      { work: { ...work(), id: workId.toLowerCase() }, contentDigest },
    ],
  });
  reject(foundationProjectWorkPageSchema, { ...page(), items: [], nextCursor });
  assert.deepEqual(
    foundationProjectWorkPageSchema.parse({ ...page(), items: [] }).items,
    [],
  );
  assert.equal(
    foundationProjectWorkPageSchema.parse({ ...page(), items: [] }).nextCursor,
    null,
  );
});

test("full pages retain all 100 records and reject an oversized page without truncation", () => {
  const items = Array.from({ length: 101 }, (_, index) => ({
    work: {
      ...work(),
      id: "00000000-0000-4000-8000-" + index.toString(16).padStart(12, "0"),
      description: "\u2603".repeat(10001),
    },
    contentDigest,
  }));
  const fullItems = items.slice(0, 100);
  const nextCursor = { projectId, afterId: fullItems.at(-1)!.work.id };
  const parsed = foundationProjectWorkPageSchema.parse({
    ...page(),
    items: fullItems,
    nextCursor,
  });
  assert.equal(parsed.items.length, 100);
  assert.equal(parsed.items[99]?.work.id, fullItems[99]?.work.id);
  assert.equal(
    parsed.items[99]?.work.description,
    fullItems[99]?.work.description,
  );
  assert.equal(parsed.nextCursor?.afterId, nextCursor.afterId);
  reject(foundationProjectWorkPageSchema, { ...page(), items });
});

test("live parse makes no snapshot, SQL membership or digest truth claims", () => {
  // A live record may change after selection; there is no createdAt cutoff.
  // Active SQL membership, grants, actual digest bytes, ordering and restart
  // conditions must still be verified by the application/database.
  const parsed = foundationProjectWorkPageSchema.parse({
    ...page(),
    selectedAt: "2026-10-14T00:00:00Z",
    items: [
      {
        work: { ...work(), projectId: primaryProjectId, contextLink: link() },
        contentDigest: "0".repeat(64),
      },
    ],
  });
  assert.equal(parsed.items[0]?.work.updatedAt, updatedAt);
  assert.equal(parsed.items[0]?.contentDigest, "0".repeat(64));
});
