import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { FoundationError } from "@commandry/domain";
import { createCaptureRepository } from "./capture-repository";
import { createDatabase, type CommandryDatabase } from "./client";
import { createLocalAgentRepository } from "./local-agent-repository";
import { migrateDatabase } from "./migrate";
import {
  canonicalWorkRecord,
  listCanonicalProjectWork,
} from "./project-work-query";
import { capture, project, workItem, workItemRelation } from "./schema";
import { createWorkAssignmentRepository } from "./work-assignment-repository";
import { createWorkProjectRepository } from "./work-project-repository";

const connectionString = process.env.COMMANDRY_TEST_DATABASE_URL;
if (!connectionString)
  throw new Error("Run through the focused PostgreSQL harness");

async function prepareDatabase() {
  await migrateDatabase({
    connectionString: connectionString!,
    migrationsDir: resolve(process.cwd(), "packages/db/migrations"),
  });
  const database = createDatabase({
    connectionString: connectionString!,
    max: 3,
  });
  const version = await database.pool.query<{ version: string }>(
    "select current_setting('server_version_num') as version",
  );
  assert.equal(Math.floor(Number(version.rows[0]!.version) / 10_000), 18);
  return database;
}

async function seedWork(
  db: CommandryDatabase,
  projectId: string,
  index: number,
) {
  const id = crypto.randomUUID();
  const sourceCaptureId = crypto.randomUUID();
  const originalContent = `  Original ${index}: cafe\u0301\r\nPreserve spacing.  `;
  const createdAt = new Date(Date.UTC(2026, 9, 16, 10, 0, index % 7));
  await db.insert(capture).values({
    id: sourceCaptureId,
    inputType: "text",
    originalContent,
    state: "filed",
    projectId,
    filedRecordKind: "task",
    filedRecordId: id,
    filedAt: createdAt,
    createdAt,
  });
  const [row] = await db
    .insert(workItem)
    .values({
      id,
      projectId,
      sourceCaptureId,
      title: `Canonical Work ${index}`,
      description: `Derived description ${index}`,
      workType: index === 0 ? "initiative" : "task",
      status: index % 2 ? "done" : "open",
      priority: ([null, "low", "normal", "high"] as const)[index % 4],
      dueOn: index % 3 ? null : "2026-10-19",
      createdAt,
      updatedAt: createdAt,
    })
    .returning();
  assert.ok(row);
  return { row, originalContent };
}

test("project Work pagination preserves microseconds and timestamp UUID ties", async () => {
  const database = await prepareDatabase();
  try {
    const projectId = crypto.randomUUID();
    await database.db
      .insert(project)
      .values({ id: projectId, name: "Exact cursor precision" });
    const ids = [1, 2, 3, 4, 5].map(
      (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const timestamps = [
      "2026-10-16T12:00:00.123900Z",
      "2026-10-16T12:00:00.122999Z",
      "2026-10-16T12:00:00.123100Z",
      "2026-10-16T12:00:00.123800Z",
      "2026-10-16T12:00:00.123800Z",
    ];
    for (const [index, id] of ids.entries()) {
      const sourceCaptureId = crypto.randomUUID();
      await database.db.insert(capture).values({
        id: sourceCaptureId,
        inputType: "text",
        originalContent: `Original precision source ${index}`,
        state: "filed",
        projectId,
        filedRecordKind: "task",
        filedRecordId: id,
        filedAt: new Date(),
      });
      await database.db.execute(
        sql`insert into work_item (id, project_id, source_capture_id, title, description, created_at) values (${id}::uuid, ${projectId}::uuid, ${sourceCaptureId}::uuid, ${`Precision row ${index}`}, 'Exact stored precision', ${timestamps[index]}::timestamptz)`,
      );
    }
    const expected = [ids[0], ids[4], ids[3], ids[2], ids[1]];
    for (const read of [
      (input: { limit: number; cursor?: string }) =>
        createCaptureRepository(database.db).listProjectWork(projectId, input),
      (input: { limit: number; cursor?: string }) =>
        listCanonicalProjectWork(database.db, projectId, input, {
          requireValidCursor: true,
        }),
    ]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await read({ limit: 1, ...(cursor ? { cursor } : {}) });
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.deepEqual(seen, expected);
    }
  } finally {
    await database.close();
  }
});

test("canonical project Work reaches all 137 mixed eligible records exactly once with only bound context", async () => {
  const database = await prepareDatabase();
  const db = database.db;
  try {
    const [projectId, otherProjectId, unrelatedProjectId] = [
      crypto.randomUUID(),
      crypto.randomUUID(),
      crypto.randomUUID(),
    ];
    await db.insert(project).values([
      { id: projectId!, name: "Canonical project Work" },
      { id: otherProjectId!, name: "Actual primary project" },
      { id: unrelatedProjectId!, name: "Unrelated context" },
    ]);
    const fixtures = [];
    const contextById = new Map<
      string,
      { id: string; projectId: string; createdAt: string }
    >();
    const contexts = createWorkProjectRepository(db);
    for (let index = 0; index < 136; index += 1) {
      const fixture = await seedWork(
        db,
        index < 112 ? projectId! : otherProjectId!,
        index,
      );
      fixtures.push(fixture);
      if (index >= 112) {
        const connected = await contexts.link(fixture.row.id, projectId!);
        contextById.set(fixture.row.id, {
          id: connected.link.id,
          projectId: projectId!,
          createdAt: connected.link.createdAt,
        });
      }
      if (index === 0 || index >= 112)
        await contexts.link(fixture.row.id, unrelatedProjectId!);
    }
    const initiative = fixtures[0]!.row;
    const child = fixtures[1]!.row;
    await db.insert(workItemRelation).values({
      id: crypto.randomUUID(),
      projectId: projectId!,
      sourceWorkItemId: initiative.id,
      targetWorkItemId: child.id,
      type: "parent_of",
    });
    const agents = createLocalAgentRepository(db);
    const agent = await agents.create({
      name: "Canonical serializer reviewer",
    });
    await agents.assignProject(agent.id, projectId!);
    const assignments = createWorkAssignmentRepository(db);
    await assignments.changeAssignment(fixtures[2]!.row.id, {
      expectedUpdatedAt: fixtures[2]!.row.updatedAt.toISOString(),
      assigneeKind: "local_user",
      agentId: null,
    });
    await assignments.changeAssignment(fixtures[3]!.row.id, {
      expectedUpdatedAt: fixtures[3]!.row.updatedAt.toISOString(),
      assigneeKind: "agent",
      agentId: agent.id,
    });
    const source = fixtures[4]!.row;
    const [generated] = await db
      .insert(workItem)
      .values({
        id: crypto.randomUUID(),
        projectId: projectId!,
        sourceCaptureId: source.sourceCaptureId,
        generatedFromWorkItemId: source.id,
        title: "Generated canonical Work",
        description: "Same original source",
        createdAt: new Date("2026-10-16T10:01:00Z"),
      })
      .returning();
    assert.ok(generated);
    const excluded = await seedWork(db, otherProjectId!, 200);
    const foreign = await seedWork(db, otherProjectId!, 201);
    const foreignLink = await seedWork(db, otherProjectId!, 202);
    const archived = await contexts.link(excluded.row.id, projectId!);
    await contexts.archiveLink(archived.link.id);
    await contexts.link(foreignLink.row.id, unrelatedProjectId!);
    const historical = contextById.get(fixtures[112]!.row.id)!;
    await contexts.archiveLink(historical.id);
    const relinked = await contexts.link(fixtures[112]!.row.id, projectId!);
    assert.notEqual(relinked.link.id, historical.id);
    contextById.set(fixtures[112]!.row.id, {
      id: relinked.link.id,
      projectId: projectId!,
      createdAt: relinked.link.createdAt,
    });

    const stored = await db
      .select()
      .from(workItem)
      .where(
        sql`${workItem.id} in ${[...fixtures.map(({ row }) => row.id), generated.id]}`,
      );
    const expectedOrder = [...stored].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.id.localeCompare(a.id),
    );
    const seen: Awaited<ReturnType<typeof listCanonicalProjectWork>>["items"] =
      [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const input = { limit: 23, ...(cursor ? { cursor } : {}) };
      const page = await listCanonicalProjectWork(db, projectId!, input, {
        requireValidCursor: true,
      });
      assert.deepEqual(
        await createCaptureRepository(db).listProjectWork(projectId!, input),
        page,
      );
      assert.ok(page.items.length <= 23);
      if (page.nextCursor) assert.equal(page.nextCursor, page.items.at(-1)?.id);
      seen.push(...page.items);
      cursor = page.nextCursor ?? undefined;
      pages += 1;
      assert.ok(pages <= 7, "continuation must advance");
    } while (cursor);
    assert.equal(pages, 6);
    assert.equal(seen.length, 137);
    assert.equal(new Set(seen.map((item) => item.id)).size, 137);
    assert.deepEqual(
      seen.map((item) => item.id),
      expectedOrder.map((row) => row.id),
    );
    for (const row of stored) {
      const actual = seen.find((item) => item.id === row.id);
      assert.deepEqual(actual, {
        id: row.id,
        projectId: row.projectId,
        sourceCaptureId: row.sourceCaptureId,
        title: row.title,
        description: row.description,
        workType: row.workType,
        generatedFromWorkItemId: row.generatedFromWorkItemId,
        assigneeKind: row.assigneeKind,
        assigneeAgentId: row.assigneeAgentId,
        assigneeLabel: row.assigneeLabel,
        status: row.status,
        priority: row.priority,
        dueOn: row.dueOn,
        contextLink: contextById.get(row.id) ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
      assert.equal(Object.hasOwn(actual!, "originalContent"), false);
      assert.equal(Object.hasOwn(actual!, "projectName"), false);
      assert.equal(Object.hasOwn(actual!, "version"), false);
      if (contextById.has(row.id))
        assert.equal(actual?.projectId, otherProjectId);
    }
    assert.deepEqual(
      new Set(seen.map((item) => item.workType)),
      new Set(["task", "initiative", "subtask"]),
    );
    assert.deepEqual(
      new Set(seen.map((item) => item.status)),
      new Set(["open", "done"]),
    );
    assert.deepEqual(
      new Set(seen.map((item) => item.assigneeKind)),
      new Set(["unassigned", "local_user", "agent"]),
    );
    assert.ok(seen.some((item) => item.dueOn === null));
    assert.ok(seen.some((item) => item.dueOn === "2026-10-19"));
    assert.equal(
      seen.find((item) => item.id === generated.id)?.generatedFromWorkItemId,
      source.id,
    );
    for (const fixture of fixtures) {
      const [original] = await db
        .select()
        .from(capture)
        .where(eq(capture.id, fixture.row.sourceCaptureId));
      assert.equal(original?.originalContent, fixture.originalContent);
    }
    for (const id of [excluded.row.id, foreign.row.id, foreignLink.row.id])
      assert.equal(
        seen.some((item) => item.id === id),
        false,
      );
    const sample = stored[0]!;
    const withoutContext = canonicalWorkRecord(sample);
    assert.equal(Object.hasOwn(withoutContext, "contextLink"), false);
    assert.deepEqual(canonicalWorkRecord(sample, null), {
      ...withoutContext,
      contextLink: null,
    });
  } finally {
    await database.close();
  }
});

test("strict cursor validity and reads stay inside the operation transaction while the owner facade keeps empty terminals", async () => {
  const database = await prepareDatabase();
  const db = database.db;
  try {
    const projectId = crypto.randomUUID();
    const otherProjectId = crypto.randomUUID();
    await db.insert(project).values([
      { id: projectId, name: "Scoped cursor project" },
      { id: otherProjectId, name: "Foreign cursor project" },
    ]);
    const primary = await seedWork(db, projectId, 294);
    const foreign = await seedWork(db, otherProjectId, 301);
    const linked = await seedWork(db, otherProjectId, 302);
    const contexts = createWorkProjectRepository(db);
    const active = await contexts.link(linked.row.id, projectId);
    const first = await listCanonicalProjectWork(
      db,
      projectId,
      { limit: 1 },
      { requireValidCursor: true },
    );
    assert.ok(first.nextCursor);
    assert.equal(first.items[0]?.id, linked.row.id);
    await contexts.archiveLink(active.link.id);
    for (const cursor of [foreign.row.id, linked.row.id, crypto.randomUUID()]) {
      await assert.rejects(
        listCanonicalProjectWork(
          db,
          projectId,
          { limit: 1, cursor },
          { requireValidCursor: true },
        ),
        (error: unknown) =>
          error instanceof FoundationError &&
          error.code === "INVALID_REFERENCE",
      );
      const empty = { items: [], nextCursor: null };
      assert.deepEqual(
        await listCanonicalProjectWork(db, projectId, { limit: 1, cursor }),
        empty,
      );
      assert.deepEqual(
        await listCanonicalProjectWork(
          db,
          projectId,
          { limit: 1, cursor },
          { requireValidCursor: false },
        ),
        empty,
      );
      assert.deepEqual(
        await createCaptureRepository(db).listProjectWork(projectId, {
          limit: 1,
          cursor,
        }),
        empty,
      );
    }
    assert.deepEqual(
      await listCanonicalProjectWork(
        db,
        projectId,
        { limit: 1, cursor: primary.row.id },
        { requireValidCursor: true },
      ),
      { items: [], nextCursor: null },
    );
    assert.deepEqual(
      await listCanonicalProjectWork(
        db,
        crypto.randomUUID(),
        { limit: 1 },
        { requireValidCursor: true },
      ),
      { items: [], nextCursor: null },
    );
    const transactionId = crypto.randomUUID();
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.insert(project).values({
          id: transactionId,
          name: "Uncommitted transaction project",
        });
        const captureId = crypto.randomUUID();
        const workId = crypto.randomUUID();
        await tx.insert(capture).values({
          id: captureId,
          inputType: "text",
          originalContent: "Uncommitted original",
          state: "filed",
          projectId: transactionId,
          filedRecordKind: "task",
          filedRecordId: workId,
          filedAt: new Date(),
        });
        await tx.insert(workItem).values({
          id: workId,
          projectId: transactionId,
          sourceCaptureId: captureId,
          title: "Operation-local Work",
          description: "Only visible in the same transaction",
        });
        const page = await listCanonicalProjectWork(
          tx,
          transactionId,
          { limit: 1 },
          { requireValidCursor: true },
        );
        assert.equal(page.items[0]?.id, workId);
        assert.deepEqual(
          await listCanonicalProjectWork(db, transactionId, { limit: 1 }),
          { items: [], nextCursor: null },
        );
        assert.deepEqual(
          await listCanonicalProjectWork(
            tx,
            transactionId,
            { limit: 1, cursor: workId },
            { requireValidCursor: true },
          ),
          { items: [], nextCursor: null },
        );
        throw new Error("Rollback operation-local fixture");
      }),
      /Rollback operation-local fixture/,
    );
    assert.deepEqual(
      await listCanonicalProjectWork(db, transactionId, { limit: 1 }),
      { items: [], nextCursor: null },
    );
  } finally {
    await database.close();
  }
});
