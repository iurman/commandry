import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { and, eq, sql } from "drizzle-orm";
import { serializeFoundationProjectWorkPage } from "@commandry/application";
import type {
  FoundationProjectWorkCursor,
  FoundationProjectWorkQuery,
} from "@commandry/contracts";
import { foundationProjectWorkQuerySchema } from "@commandry/contracts";
import { FoundationError, foundationDigest } from "@commandry/domain";
import { createObservatoryOwnerWorkService } from "../../application/src/observatory-work";
import { createDatabase } from "./client";
import { createLocalAgentRepository } from "./local-agent-repository";
import { createWorkAssignmentRepository } from "./work-assignment-repository";
import { createObservatoryOwnerWorkRepository } from "./observatory-work-repository";
import { listCanonicalProjectWork } from "./project-work-query";
import {
  auditEvent,
  capture,
  project,
  session,
  user,
  workItem,
  workItemRelation,
  workProjectLink,
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
async function fixture() {
  const admin = createDatabase({ connectionString: adminUrl!, max: 4 });
  // Session, canonical Work and allowed audit must fit one runtime connection.
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const userId = randomUUID(),
    sessionId = randomUUID(),
    projectId = randomUUID(),
    otherProjectId = randomUUID();
  let time = Date.now();
  const now = () => new Date(time);
  const expiresAt = new Date(time + 3_600_000);
  await admin.db.insert(user).values({
    id: userId,
    name: "Synthetic owner Work reader",
    email: `${userId}@example.test`,
  });
  const sessionToken = randomUUID();
  await admin.db
    .insert(session)
    .values({ id: sessionId, userId, token: sessionToken, expiresAt });
  await admin.db.insert(project).values([
    { id: projectId, name: "Owner canonical Work" },
    { id: otherProjectId, name: "Actual related primary" },
  ]);
  const owner = {
    principalId: `user:${userId}`,
    sessionId,
    expiresAt: expiresAt.toISOString(),
  };
  const port = createObservatoryOwnerWorkRepository(runtime.db, { now });
  const service = createObservatoryOwnerWorkService(port, { now });
  async function audits() {
    return admin.db
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.actor, owner.principalId),
          eq(auditEvent.operation, "observatory.work.read"),
        ),
      );
  }
  return {
    admin,
    runtime,
    userId,
    sessionId,
    sessionToken,
    projectId,
    otherProjectId,
    owner,
    port,
    service,
    now,
    audits,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    close: async () => {
      await runtime.close();
      await admin.close();
    },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function seed(f: Fixture, primary = f.projectId, index = 0) {
  const sourceCaptureId = randomUUID(),
    id = randomUUID();
  const createdAt = new Date(f.now().getTime() - 86_400_000 - index * 2);
  await f.admin.db.insert(capture).values({
    id: sourceCaptureId,
    projectId: primary,
    inputType: "text",
    originalContent: `PRIVATE ORIGINAL ${index}`,
  });
  const [row] = await f.admin.db
    .insert(workItem)
    .values({
      id,
      projectId: primary,
      sourceCaptureId,
      title: `Literal Work ${index} <script>`,
      description: index === 0 ? "  exact cafe\u0301\r\n  " : "",
      workType: index % 3 === 1 ? "initiative" : "task",
      status: index % 2 ? "done" : "open",
      priority: index % 2 ? "high" : null,
      dueOn: index % 3 ? null : "2026-10-20",
      createdAt,
      updatedAt: createdAt,
    })
    .returning();
  assert.ok(row);
  return row;
}
async function waitFor(f: Fixture, query: string, message: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await f.admin.pool.query<{ count: number }>(query);
    if (result.rows[0]!.count > 0) return;
    await delay(10);
  }
  assert.fail(message);
}

test(
  "owner canonical Work reaches all 137 primary/active-linked mixed records with the exact released DTO, digests and owner-only audit",
  { timeout: 60_000 },
  async () => {
    const f = await fixture();
    try {
      const beforeClients = (
        await f.admin.pool.query<{ count: number }>(
          "select count(*)::int as count from foundation_client",
        )
      ).rows[0]!.count;
      const expected: string[] = [];
      const rows: (typeof workItem.$inferSelect)[] = [];
      for (let index = 0; index < 139; index++) {
        const row = await seed(
          f,
          index < 113 ? f.projectId : f.otherProjectId,
          index,
        );
        rows.push(row);
        if (index < 137) expected.push(row.id);
        if (index >= 113 && index < 138)
          await f.admin.db.insert(workProjectLink).values({
            id: randomUUID(),
            workItemId: row.id,
            projectId: f.projectId,
            lifecycle: index < 137 ? "active" : "archived",
            createdAt: f.now(),
            archivedAt: index < 137 ? null : f.now(),
          });
      }
      await f.admin.db.insert(workItemRelation).values({
        id: randomUUID(),
        projectId: f.projectId,
        sourceWorkItemId: rows[1]!.id,
        targetWorkItemId: rows[2]!.id,
        type: "parent_of",
      });
      // Primary OR linked membership remains one identity, and foreign link context
      // cannot leak through a different requested project.
      await assert.rejects(
        f.admin.db.insert(workProjectLink).values({
          id: randomUUID(),
          workItemId: rows[0]!.id,
          projectId: f.projectId,
        }),
      );
      await f.admin.db.insert(workProjectLink).values({
        id: randomUUID(),
        workItemId: rows[1]!.id,
        projectId: f.otherProjectId,
      });
      const agents = createLocalAgentRepository(f.runtime.db);
      const agent = await agents.create({
        name: "Canonical owner Work fixture",
      });
      await agents.assignProject(agent.id, f.projectId);
      const assignments = createWorkAssignmentRepository(f.runtime.db);
      await assignments.changeAssignment(rows[4]!.id, {
        expectedUpdatedAt: rows[4]!.updatedAt.toISOString(),
        assigneeKind: "local_user",
        agentId: null,
      });
      await assignments.changeAssignment(rows[3]!.id, {
        expectedUpdatedAt: rows[3]!.updatedAt.toISOString(),
        assigneeKind: "agent",
        agentId: agent.id,
      });
      const seen: string[] = [],
        returned = [];
      let cursor: FoundationProjectWorkCursor | null = null,
        pages = 0;
      do {
        const query: FoundationProjectWorkQuery = {
          projectId: f.projectId,
          limit: 23,
          cursor,
        };
        const page = await f.service.listProjectWork(f.owner, query);
        const canonical = await listCanonicalProjectWork(
          f.admin.db,
          f.projectId,
          { limit: 23, ...(cursor === null ? {} : { cursor: cursor.afterId }) },
          { requireValidCursor: true },
        );
        assert.deepEqual(
          page,
          serializeFoundationProjectWorkPage(
            canonical,
            foundationProjectWorkQuerySchema.parse(query),
            page.selectedAt,
          ),
        );
        assert.equal(page.consistency, "live");
        assert.equal(page.selectedAt, f.now().toISOString());
        for (const item of page.items) {
          assert.equal(seen.includes(item.work.id), false);
          assert.equal(item.contentDigest, foundationDigest(item.work));
          assert.notEqual(item.work.updatedAt, page.selectedAt);
          if (item.work.projectId === f.otherProjectId)
            assert.equal(item.work.contextLink?.projectId, f.projectId);
          seen.push(item.work.id);
          returned.push(item.work);
        }
        const text = JSON.stringify(page);
        for (const hidden of [
          "PRIVATE ORIGINAL",
          f.sessionId,
          f.sessionToken,
          "tokenDigest",
          "AgentRun",
        ])
          assert.equal(text.includes(hidden), false);
        cursor = page.nextCursor;
        pages++;
        assert.ok(
          pages <= 7,
          "continuation must advance across the known population",
        );
      } while (cursor !== null);
      assert.deepEqual(seen, expected);
      assert.equal(pages, 6);
      assert.deepEqual(
        new Set(returned.map((row) => row.workType)),
        new Set(["task", "initiative", "subtask"]),
      );
      assert.deepEqual(
        new Set(returned.map((row) => row.status)),
        new Set(["open", "done"]),
      );
      assert.deepEqual(
        new Set(returned.map((row) => row.assigneeKind)),
        new Set(["unassigned", "local_user", "agent"]),
      );
      assert.ok(returned.some((row) => row.dueOn === null));
      assert.ok(returned.some((row) => row.dueOn !== null));
      assert.equal(
        returned.find((row) => row.id === rows[1]!.id)?.contextLink,
        null,
      );
      assert.equal(returned[0]?.description, "  exact cafe\u0301\r\n  ");
      const audit = await f.audits();
      assert.equal(audit.length, 6);
      for (const event of audit) {
        assert.equal(event.actor, f.owner.principalId);
        assert.deepEqual(event.details, {
          projectId: f.projectId,
          capability: "owner",
          risk: "read_only",
        });
        assert.equal(JSON.stringify(event).includes(f.sessionId), false);
        assert.equal(JSON.stringify(event).includes(f.sessionToken), false);
      }
      assert.equal(
        (
          await f.admin.pool.query<{ count: number }>(
            "select count(*)::int as count from foundation_client",
          )
        ).rows[0]!.count,
        beforeClients,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "owner Work requires an actual canonical session, rejects expiry and binds every record query to an existing project",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      await seed(f);
      for (const owner of [
        { ...f.owner, principalId: `user:${randomUUID()}` },
        { ...f.owner, sessionId: randomUUID() },
        { ...f.owner, principalId: "owner" },
      ])
        await assert.rejects(
          f.service.listProjectWork(owner, { projectId: f.projectId }),
          denied("FORBIDDEN"),
        );
      await assert.rejects(
        f.service.listProjectWork(
          {
            ...f.owner,
            expiresAt: new Date(f.now().getTime() + 7_200_000).toISOString(),
          },
          { projectId: f.projectId },
        ),
        denied("EXPIRED"),
      );
      let called = false;
      await assert.rejects(
        f.port.withRead(f.owner, randomUUID(), async () => {
          called = true;
          return null;
        }),
        denied("INVALID_REFERENCE"),
      );
      assert.equal(called, false);
      await assert.rejects(
        f.port.withRead(f.owner, f.projectId, (records) =>
          records.listProjectWork({ projectId: f.otherProjectId, limit: 1 }),
        ),
        denied("FORBIDDEN"),
      );
      assert.equal((await f.audits()).length, 0);
      await f.admin.db
        .update(session)
        .set({ expiresAt: f.now() })
        .where(eq(session.id, f.sessionId));
      await assert.rejects(
        f.service.listProjectWork(f.owner, { projectId: f.projectId }),
        denied("EXPIRED"),
      );
      await f.admin.db.delete(session).where(eq(session.id, f.sessionId));
      await assert.rejects(
        f.service.listProjectWork(f.owner, { projectId: f.projectId }),
        denied("FORBIDDEN"),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "owner Work uses live scoped cursor validation and repeatable-read canonical records on one runtime connection",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const linked = await seed(f, f.otherProjectId),
        primary = await seed(f, f.projectId, 1);
      const linkId = randomUUID();
      await f.admin.db
        .insert(workProjectLink)
        .values({ id: linkId, workItemId: linked.id, projectId: f.projectId });
      const first = await f.service.listProjectWork(f.owner, {
        projectId: f.projectId,
        limit: 1,
      });
      assert.equal(first.nextCursor?.afterId, linked.id);
      await f.admin.db
        .update(workProjectLink)
        .set({ lifecycle: "archived", archivedAt: f.now() })
        .where(eq(workProjectLink.id, linkId));
      await assert.rejects(
        f.service.listProjectWork(f.owner, {
          projectId: f.projectId,
          cursor: first.nextCursor,
        }),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.service.listProjectWork(f.owner, {
          projectId: f.projectId,
          cursor: { projectId: f.projectId, afterId: randomUUID() },
        }),
        denied("INVALID_REFERENCE"),
      );
      await assert.rejects(
        f.service.listProjectWork(f.owner, {
          projectId: f.projectId,
          cursor: { projectId: f.otherProjectId, afterId: primary.id },
        }),
      );
      await f.port.withRead(f.owner, f.projectId, async (records) => {
        const before = await records.listProjectWork({
          projectId: f.projectId,
          limit: 25,
        });
        await f.admin.db
          .update(workItem)
          .set({
            description: "Changed after transaction snapshot",
            updatedAt: f.now(),
          })
          .where(eq(workItem.id, primary.id));
        const after = await records.listProjectWork({
          projectId: f.projectId,
          limit: 25,
        });
        assert.deepEqual(after, before);
        return after;
      });
      assert.equal(
        (await f.service.listProjectWork(f.owner, { projectId: f.projectId }))
          .items[0]?.work.description,
        "Changed after transaction snapshot",
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "owner Work withholds data on audit failure and on expiry after transaction commit",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      await f.admin.db.execute(
        sql`create function commandry_test_owner_work_audit_fail() returns trigger language plpgsql as $$ begin if NEW.operation = 'observatory.work.read' then raise exception 'Injected owner Work audit failure'; end if; return NEW; end $$`,
      );
      await f.admin.db.execute(
        sql`create trigger commandry_test_owner_work_audit_fail before insert on ${auditEvent} for each row execute function commandry_test_owner_work_audit_fail()`,
      );
      await assert.rejects(
        f.service.listProjectWork(f.owner, { projectId: f.projectId }),
      );
      assert.equal((await f.audits()).length, 0);
    } finally {
      await f.admin.db.execute(
        sql`drop trigger if exists commandry_test_owner_work_audit_fail on ${auditEvent}`,
      );
      await f.admin.db.execute(
        sql`drop function if exists commandry_test_owner_work_audit_fail()`,
      );
      await f.close();
    }
    const g = await fixture();
    try {
      let calls = 0;
      const port = createObservatoryOwnerWorkRepository(g.runtime.db, {
        now: () => new Date(g.now().getTime() + (++calls >= 5 ? 3_600_000 : 0)),
      });
      await assert.rejects(
        port.withRead(g.owner, g.projectId, (records) =>
          records.listProjectWork({ projectId: g.projectId, limit: 1 }),
        ),
        denied("EXPIRED"),
      );
      assert.ok(calls >= 5);
      assert.equal(
        (await g.audits()).length,
        1,
        "The read was audited while valid, but delivery after commit must still expire",
      );
    } finally {
      await g.close();
    }
  },
);

test(
  "owner session share lock survives an actual awaited audit and blocks concurrent expiry until commit",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let unlock: (() => void) | undefined;
    let blocking: Promise<void> | undefined,
      reading: Promise<unknown> | undefined,
      expiring: Promise<unknown> | undefined;
    try {
      await f.admin.db.execute(
        sql`create function commandry_test_owner_work_audit_wait() returns trigger language plpgsql as $$ begin if NEW.operation = 'observatory.work.read' then perform pg_advisory_xact_lock(542933); end if; return NEW; end $$`,
      );
      await f.admin.db.execute(
        sql`create trigger commandry_test_owner_work_audit_wait before insert on ${auditEvent} for each row execute function commandry_test_owner_work_audit_wait()`,
      );
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(542933)`);
        ready();
        await held;
      });
      await entered;
      reading = f.service.listProjectWork(f.owner, { projectId: f.projectId });
      const observedRead = reading.then(
        (value) => ({ value, error: null }),
        (error: unknown) => ({ value: null, error }),
      );
      await waitFor(
        f,
        "select count(*)::int as count from pg_locks where locktype = 'advisory' and objid = 542933 and not granted",
        "Read must reach the actual PostgreSQL audit wait",
      );
      let expired = false;
      expiring = f.admin.db
        .update(session)
        .set({ expiresAt: f.now() })
        .where(eq(session.id, f.sessionId))
        .then(() => {
          expired = true;
        });
      await waitFor(
        f,
        "select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like 'update%session%'",
        "Canonical session expiry must wait for the actual shared session lock",
      );
      assert.equal(expired, false);
      unlock!();
      await blocking;
      await expiring;
      const delivered = await observedRead;
      if (delivered.error !== null)
        assert.ok(denied("EXPIRED")(delivered.error));
      else assert.ok(delivered.value);
      await assert.rejects(
        f.service.listProjectWork(f.owner, { projectId: f.projectId }),
        denied("EXPIRED"),
      );
      assert.equal((await f.audits()).length, 1);
    } finally {
      unlock?.();
      await Promise.allSettled(
        [blocking, reading, expiring].filter((value) => value !== undefined),
      );
      await f.admin.db.execute(
        sql`drop trigger if exists commandry_test_owner_work_audit_wait on ${auditEvent}`,
      );
      await f.admin.db.execute(
        sql`drop function if exists commandry_test_owner_work_audit_wait()`,
      );
      await f.close();
    }
  },
);

test(
  "owner Work expiry during an actual audit wait rolls back the allowed audit",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let unlock: (() => void) | undefined;
    let blocking: Promise<void> | undefined,
      rejected: Promise<void> | undefined;
    try {
      await f.admin.db.execute(
        sql`create function commandry_test_owner_work_expiry_wait() returns trigger language plpgsql as $$ begin if NEW.operation = 'observatory.work.read' then perform pg_advisory_xact_lock(542934); end if; return NEW; end $$`,
      );
      await f.admin.db.execute(
        sql`create trigger commandry_test_owner_work_expiry_wait before insert on ${auditEvent} for each row execute function commandry_test_owner_work_expiry_wait()`,
      );
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(542934)`);
        ready();
        await held;
      });
      await entered;
      rejected = assert.rejects(
        f.service.listProjectWork(f.owner, { projectId: f.projectId }),
        denied("EXPIRED"),
      );
      await waitFor(
        f,
        "select count(*)::int as count from pg_locks where locktype = 'advisory' and objid = 542934 and not granted",
        "Read must actually wait inside the allowed audit trigger",
      );
      f.advance(3_600_000);
      unlock!();
      await blocking;
      await rejected;
      assert.equal((await f.audits()).length, 0);
    } finally {
      unlock?.();
      await Promise.allSettled(
        [blocking, rejected].filter((value) => value !== undefined),
      );
      await f.admin.db.execute(
        sql`drop trigger if exists commandry_test_owner_work_expiry_wait on ${auditEvent}`,
      );
      await f.admin.db.execute(
        sql`drop function if exists commandry_test_owner_work_expiry_wait()`,
      );
      await f.close();
    }
  },
);
