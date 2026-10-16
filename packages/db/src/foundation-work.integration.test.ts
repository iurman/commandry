import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import {
  createFoundationInventoryService,
  createFoundationOwnerService,
  createFoundationWorkService,
} from "@commandry/application";
import type { FoundationProjectWorkCursor } from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createCaptureRepository } from "./capture-repository";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationReadAccessRepository } from "./foundation-read-repository";
import { createFoundationWorkReadAccessRepository } from "./foundation-work-repository";
import { foundationAudit, foundationClient } from "./foundation-schema";
import { capture, project, workItem, workProjectLink } from "./schema";

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
  const admin = createDatabase({ connectionString: adminUrl!, max: 3 });
  // Every product read and audit must fit this single pooled connection.
  const runtime = createDatabase({
    connectionString: runtimeUrl.toString(),
    max: 1,
  });
  const projectId = crypto.randomUUID();
  const otherId = crypto.randomUUID();
  await admin.db.insert(project).values([
    { id: projectId, name: "Canonical Work read" },
    { id: otherId, name: "Related primary" },
  ]);
  let time = Date.now();
  const now = () => new Date(time);
  const owner = createFoundationOwnerService(
    createFoundationAccessRepository(runtime.db, { now }),
    {
      principalId: "user:work-test-owner",
      expiresAt: new Date(time + 7_200_000).toISOString(),
    },
    { environment: "test", now },
  );
  const issue = (
    operations: ("work.read" | "foundation.read")[],
    key: string,
  ) =>
    owner.createClient(
      {
        name: key,
        projectId,
        environment: "test",
        ttlSeconds: 3600,
        operations,
      },
      key,
    );
  const issued = await issue(["work.read"], "work-only");
  const old = await issue(["foundation.read"], "foundation-only");
  const port = createFoundationWorkReadAccessRepository(runtime.db, { now });
  const service = createFoundationWorkService(port, {
    environment: "test",
    now,
  });
  const request = () => ({
    operation: "work.read" as const,
    projectId,
    environment: "test" as const,
    targetId: null,
    tokenDigest: foundationTokenDigest(issued.token),
    correlationId: crypto.randomUUID(),
  });
  return {
    admin,
    runtime,
    projectId,
    otherId,
    issued,
    old,
    owner,
    port,
    service,
    request,
    now,
    advance: (milliseconds: number) => {
      time += milliseconds;
    },
    close: async () => {
      await runtime.close();
      await admin.close();
    },
  };
}

test(
  "work.read uses complete canonical primary and linked Work without widening old grants or revealing originals",
  { timeout: 60_000 },
  async () => {
    const f = await fixture();
    try {
      const captures: (typeof capture.$inferInsert)[] = [];
      const items: (typeof workItem.$inferInsert)[] = [];
      const links: (typeof workProjectLink.$inferInsert)[] = [];
      const expected = new Set<string>();
      for (let index = 0; index < 139; index++) {
        const id = crypto.randomUUID();
        const captureId = crypto.randomUUID();
        const primary = index < 113 ? f.projectId : f.otherId;
        captures.push({
          id: captureId,
          projectId: primary,
          inputType: "text",
          originalContent: `Private original must stay hidden ${index}`,
        });
        const at = new Date(f.now().getTime() - index * 2);
        items.push({
          id,
          projectId: primary,
          sourceCaptureId: captureId,
          title: `Work ${index}`,
          description: index === 0 ? " cafe\u0301\r\n  exact text " : "",
          workType: index % 3 === 0 ? "initiative" : "task",
          status: index % 2 ? "done" : "open",
          priority: index % 2 ? "high" : null,
          dueOn: index % 3 ? null : "2026-10-20",
          createdAt: at,
          updatedAt: at,
        });
        if (index < 137) expected.add(id);
        if (index >= 113)
          links.push({
            id: crypto.randomUUID(),
            workItemId: id,
            projectId: f.projectId,
            lifecycle: index < 137 ? "active" : "archived",
            createdAt: f.now(),
            archivedAt: index < 137 ? null : f.now(),
          });
      }
      await f.admin.db.insert(capture).values(captures);
      await f.admin.db.insert(workItem).values(items);
      await f.admin.db.insert(workProjectLink).values(links);
      const ui = createCaptureRepository(f.runtime.db);
      const seen = new Set<string>();
      let cursor: FoundationProjectWorkCursor | null = null;
      let pages = 0;
      do {
        const page = await f.service.listProjectWork(f.issued.token, {
          projectId: f.projectId,
          limit: 23,
          cursor,
        });
        const canonical = await ui.listProjectWork(f.projectId, {
          limit: 23,
          ...(cursor ? { cursor: cursor.afterId } : {}),
        });
        assert.equal(page.consistency, "live");
        assert.equal(page.requestedProjectId, f.projectId);
        assert.equal(page.selectedAt, f.now().toISOString());
        assert.deepEqual(
          page.items.map(({ work }) => work),
          canonical.items,
        );
        for (const { work, contentDigest } of page.items) {
          assert.equal(seen.has(work.id), false);
          seen.add(work.id);
          assert.equal(contentDigest, foundationDigest(work));
          if (work.projectId !== f.projectId)
            assert.equal(work.contextLink!.projectId, f.projectId);
        }
        assert.equal(
          JSON.stringify(page).includes("Private original must stay hidden"),
          false,
        );
        cursor = page.nextCursor;
        pages++;
      } while (cursor);
      assert.equal(pages, 6);
      assert.deepEqual(seen, expected);
      await assert.rejects(
        f.service.listProjectWork(f.old.token, { projectId: f.projectId }),
        denied("FORBIDDEN"),
      );
      const inventory = createFoundationInventoryService(
        createFoundationReadAccessRepository(f.runtime.db, { now: f.now }),
        { environment: "test", now: f.now },
      );
      await assert.rejects(
        inventory.listEvidence(f.issued.token, { projectId: f.projectId }),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.service.listProjectWork(f.issued.token, { projectId: f.otherId }),
        denied("FORBIDDEN"),
      );
      const [retained] = await f.admin.db
        .select()
        .from(foundationClient)
        .where(eq(foundationClient.id, f.old.client.id));
      assert.deepEqual(retained!.operations, ["foundation.read"]);
      const audits = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.clientId, f.issued.client.id));
      assert.equal(
        audits.filter(
          (row) => row.operation === "work.read" && row.decision === "allowed",
        ).length,
        6,
      );
      assert.equal(
        audits.some(
          (row) => row.operation === "work.read" && row.decision === "denied",
        ),
        true,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "invalidated Work cursors require restart and are audited as Work reads",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const sourceId = crypto.randomUUID();
      const workId = crypto.randomUUID();
      await f.admin.db.insert(capture).values({
        id: sourceId,
        projectId: f.otherId,
        inputType: "text",
        originalContent: "Foreign source",
      });
      await f.admin.db.insert(workItem).values({
        id: workId,
        projectId: f.otherId,
        sourceCaptureId: sourceId,
        title: "Formerly related",
        description: "",
      });
      const linkId = crypto.randomUUID();
      await f.admin.db.insert(workProjectLink).values({
        id: linkId,
        workItemId: workId,
        projectId: f.projectId,
        lifecycle: "active",
        createdAt: f.now(),
      });
      await f.admin.db
        .update(workProjectLink)
        .set({ lifecycle: "archived", archivedAt: f.now() })
        .where(eq(workProjectLink.id, linkId));
      await assert.rejects(
        f.service.listProjectWork(f.issued.token, {
          projectId: f.projectId,
          cursor: { projectId: f.projectId, afterId: workId },
        }),
        denied("INVALID_REFERENCE"),
      );
      const rows = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.clientId, f.issued.client.id));
      assert.equal(
        rows.some(
          (row) =>
            row.operation === "work.read" &&
            row.decision === "denied" &&
            row.code === "INVALID_REFERENCE",
        ),
        true,
      );
      assert.equal(
        rows.some(
          (row) => row.operation === "work.read" && row.decision === "allowed",
        ),
        false,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "Work read grant lock holds through delivery transaction and revocation then denies reuse",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let reading: Promise<unknown> | undefined;
    let revoke: Promise<unknown> | undefined;
    try {
      reading = f.port.withClient(f.request(), async (_client, records) => {
        const result = await records.listProjectWork({
          projectId: f.projectId,
          limit: 1,
        });
        entered();
        await held;
        return result;
      });
      await started;
      revoke = f.admin.db
        .update(foundationClient)
        .set({ revokedAt: f.now() })
        .where(eq(foundationClient.id, f.issued.client.id))
        .then(() => undefined);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await f.admin.pool.query<{ count: number }>(
          "select count(*)::int as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like 'update%foundation_client%'",
        );
        if (result.rows[0]!.count > 0) {
          waiting = true;
          break;
        }
        await delay(10);
      }
      assert.equal(
        waiting,
        true,
        "Revocation must actually wait for the shared grant lock",
      );
      release();
      await reading;
      await revoke;
      await assert.rejects(
        f.service.listProjectWork(f.issued.token, { projectId: f.projectId }),
        denied("REVOKED"),
      );
    } finally {
      release();
      await Promise.allSettled(
        [reading, revoke].filter((value) => value !== undefined),
      );
      await f.close();
    }
  },
);

test(
  "Work expiry and audit failures cannot deliver or retain an allowed read",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const correlationId = crypto.randomUUID();
      await assert.rejects(
        f.port.withClient(
          { ...f.request(), correlationId },
          async (_client, records) => {
            await records.listProjectWork({ projectId: f.projectId, limit: 1 });
            f.advance(3_600_000);
            return "must not return";
          },
        ),
        denied("EXPIRED"),
      );
      const [audit] = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.correlationId, correlationId));
      assert.equal(audit!.operation, "work.read");
      assert.equal(audit!.decision, "denied");
      assert.equal(audit!.code, "EXPIRED");
    } finally {
      await f.close();
    }
    const g = await fixture();
    try {
      await g.admin.db.execute(
        sql`create function commandry_test_work_audit_fail() returns trigger language plpgsql as $$ begin if NEW.operation = 'work.read' then raise exception 'Injected Work audit failure'; end if; return NEW; end $$`,
      );
      await g.admin.db.execute(
        sql`create trigger commandry_test_work_audit_fail before insert on foundation_audit for each row execute function commandry_test_work_audit_fail()`,
      );
      const correlationId = crypto.randomUUID();
      await assert.rejects(
        g.port.withClient(
          { ...g.request(), correlationId },
          async (_client, records) =>
            records.listProjectWork({ projectId: g.projectId, limit: 1 }),
        ),
      );
      assert.equal(
        (
          await g.admin.db
            .select()
            .from(foundationAudit)
            .where(eq(foundationAudit.correlationId, correlationId))
        ).length,
        0,
      );
    } finally {
      await g.admin.db.execute(
        sql`drop trigger if exists commandry_test_work_audit_fail on foundation_audit`,
      );
      await g.admin.db.execute(
        sql`drop function if exists commandry_test_work_audit_fail()`,
      );
      await g.close();
    }
  },
);

test(
  "Work expiry during a real audit lock wait rolls back the allowed audit",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let unlock: (() => void) | undefined;
    let blocking: Promise<void> | undefined;
    let rejected: Promise<void> | undefined;
    try {
      await f.admin.db.execute(
        sql`create function commandry_test_work_expiry_wait() returns trigger language plpgsql as $$ begin if NEW.operation = 'work.read' then perform pg_advisory_xact_lock(542334); end if; return NEW; end $$`,
      );
      await f.admin.db.execute(
        sql`create trigger commandry_test_work_expiry_wait before insert on foundation_audit for each row execute function commandry_test_work_expiry_wait()`,
      );
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(542334)`);
        ready();
        await held;
      });
      await entered;
      rejected = assert.rejects(
        f.service.listProjectWork(f.issued.token, { projectId: f.projectId }),
        denied("EXPIRED"),
      );
      let observedWait = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await f.admin.db.execute(
          sql`select count(*)::int as count from pg_locks where locktype = 'advisory' and objid = 542334 and not granted`,
        );
        if (Number(result.rows[0]!.count) > 0) {
          observedWait = true;
          break;
        }
        await delay(10);
      }
      assert.equal(
        observedWait,
        true,
        "The Work audit must actually reach the blocked PostgreSQL trigger",
      );
      f.advance(3_600_000);
      unlock!();
      await blocking;
      await rejected;
      const rows = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.clientId, f.issued.client.id));
      assert.equal(
        rows.some(
          (row) => row.operation === "work.read" && row.decision === "allowed",
        ),
        false,
      );
      assert.equal(
        rows.some(
          (row) =>
            row.operation === "work.read" &&
            row.decision === "denied" &&
            row.code === "EXPIRED",
        ),
        true,
      );
    } finally {
      unlock?.();
      await Promise.allSettled(
        [blocking, rejected].filter((value) => value !== undefined),
      );
      await f.admin.db.execute(
        sql`drop trigger if exists commandry_test_work_expiry_wait on foundation_audit`,
      );
      await f.admin.db.execute(
        sql`drop function if exists commandry_test_work_expiry_wait()`,
      );
      await f.close();
    }
  },
);
