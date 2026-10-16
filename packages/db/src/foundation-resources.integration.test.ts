import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq, sql } from "drizzle-orm";
import {
  createFoundationInventoryService,
  createFoundationOwnerService,
  createFoundationResourceService,
} from "@commandry/application";
import type { FoundationProjectResourceCursor } from "@commandry/contracts";
import {
  FoundationError,
  foundationDigest,
  foundationTokenDigest,
} from "@commandry/domain";
import { createDatabase } from "./client";
import { createCatalogRepository } from "./catalog-repository";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createFoundationReadAccessRepository } from "./foundation-read-repository";
import { createFoundationResourceReadAccessRepository } from "./foundation-resources-repository";
import { foundationAudit, foundationClient } from "./foundation-schema";
import { project, resource, projectResourceLink } from "./schema";

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
    { id: projectId, name: "Canonical Resource read" },
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
    operations: ("resources.read" | "foundation.read")[],
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
  const issued = await issue(["resources.read"], "work-only");
  const old = await issue(["foundation.read"], "foundation-only");
  const port = createFoundationResourceReadAccessRepository(runtime.db, {
    now,
  });
  const service = createFoundationResourceService(port, {
    environment: "test",
    now,
  });
  const request = () => ({
    operation: "resources.read" as const,
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
  "resources.read returns all canonical active connections with exact digests and no implicit authority",
  { timeout: 60_000 },
  async () => {
    const f = await fixture();
    try {
      const parentId = crypto.randomUUID();
      await f.admin.db.insert(resource).values({
        id: parentId,
        kind: "provider",
        name: "Unlinked private parent",
      });
      const resources = Array.from({ length: 138 }, (_, index) => ({
        id: crypto.randomUUID(),
        kind: index % 2 ? "service" : "host",
        name: index === 0 ? " cafe\u0301\r\n Exact " : `Resource ${index}`,
        parentResourceId: index === 0 ? parentId : null,
        state: index % 2 ? "archived" : null,
        externalUrl: index === 0 ? "https://example.invalid/no-fetch" : null,
      }));
      await f.admin.db.insert(resource).values(resources);
      const prefix = crypto.randomUUID().slice(0, 8);
      const id = (n: number) =>
        `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
      const edges = resources.map((item, index) => ({
        id: id(index + 1),
        projectId: index === 137 ? f.otherId : f.projectId,
        resourceId: item.id,
        type: "relates_to" as const,
        sourceKind: "project" as const,
        targetKind: "resource" as const,
        lifecycle: index === 136 ? ("archived" as const) : ("active" as const),
      }));
      await f.admin.db.insert(projectResourceLink).values(edges);
      const repeatId = id(139);
      await f.admin.db.insert(projectResourceLink).values({
        id: repeatId,
        projectId: f.projectId,
        resourceId: resources[0]!.id,
        type: "supports",
        sourceKind: "resource",
        targetKind: "project",
      });
      const expected = new Set([
        ...edges.slice(0, 136).map((x) => x.id),
        repeatId,
      ]);
      const ui = createCatalogRepository(f.runtime.db);
      const seen = new Set<string>();
      let cursor: FoundationProjectResourceCursor | null = null;
      let pages = 0;
      do {
        const page = await f.service.listProjectResources(f.issued.token, {
          projectId: f.projectId,
          limit: 23,
          cursor,
        });
        const canonical = await ui.listProjectResourceLinks(f.projectId, {
          limit: 23,
          ...(cursor ? { cursor: cursor.afterLinkId } : {}),
        });
        assert.equal(page.consistency, "live");
        assert.equal(page.selectedAt, f.now().toISOString());
        assert.deepEqual(
          page.items.map((x) => x.connection),
          canonical.items,
        );
        for (const { connection, contentDigest } of page.items) {
          assert.equal(seen.has(connection.id), false);
          seen.add(connection.id);
          assert.equal(contentDigest, foundationDigest(connection));
          assert.notEqual(connection.resource.id, parentId);
        }
        cursor = page.nextCursor;
        pages++;
      } while (cursor);
      assert.equal(pages, 6);
      assert.deepEqual(seen, expected);
      await assert.rejects(
        f.service.listProjectResources(f.old.token, { projectId: f.projectId }),
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
        f.service.listProjectResources(f.issued.token, {
          projectId: f.otherId,
        }),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.port.withClient(
          { ...f.request(), environment: "production" },
          async () => null,
        ),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.port.withClient(
          { ...f.request(), operation: "work.read" },
          async () => null,
        ),
        denied("FORBIDDEN"),
      );
      await assert.rejects(
        f.port.withClient(f.request(), async (_client, records) =>
          records.listProjectResources({ projectId: f.otherId, limit: 1 }),
        ),
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
          (x) => x.operation === "resources.read" && x.decision === "allowed",
        ).length,
        6,
      );
      assert.ok(
        audits.some(
          (x) => x.operation === "resources.read" && x.decision === "denied",
        ),
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "absent, foreign and archived resource cursors require restart and current membership is live",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const resourceId = crypto.randomUUID();
      const edgeId = crypto.randomUUID();
      const foreignId = crypto.randomUUID();
      await f.admin.db
        .insert(resource)
        .values({ id: resourceId, kind: "host", name: "Live membership" });
      await f.admin.db.insert(projectResourceLink).values([
        {
          id: edgeId,
          projectId: f.projectId,
          resourceId,
          type: "relates_to",
          sourceKind: "project",
          targetKind: "resource",
        },
        {
          id: foreignId,
          projectId: f.otherId,
          resourceId,
          type: "relates_to",
          sourceKind: "project",
          targetKind: "resource",
        },
      ]);
      const before = await f.service.listProjectResources(f.issued.token, {
        projectId: f.projectId,
      });
      assert.equal(before.items.length, 1);
      await f.admin.db
        .update(projectResourceLink)
        .set({ lifecycle: "archived" })
        .where(eq(projectResourceLink.id, edgeId));
      for (const afterLinkId of [edgeId, foreignId, crypto.randomUUID()])
        await assert.rejects(
          f.service.listProjectResources(f.issued.token, {
            projectId: f.projectId,
            cursor: { projectId: f.projectId, afterLinkId },
          }),
          denied("INVALID_REFERENCE"),
        );
      assert.deepEqual(
        (
          await f.service.listProjectResources(f.issued.token, {
            projectId: f.projectId,
          })
        ).items,
        [],
      );
      const rows = await f.admin.db
        .select()
        .from(foundationAudit)
        .where(eq(foundationAudit.clientId, f.issued.client.id));
      assert.equal(
        rows.filter(
          (x) => x.code === "INVALID_REFERENCE" && x.decision === "denied",
        ).length,
        3,
      );
    } finally {
      await f.close();
    }
  },
);

test(
  "Resource read grant lock holds through delivery transaction and revocation then denies reuse",
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
        const result = await records.listProjectResources({
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
        f.service.listProjectResources(f.issued.token, {
          projectId: f.projectId,
        }),
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
  "Resource expiry and audit failures cannot deliver or retain an allowed read",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    try {
      const correlationId = crypto.randomUUID();
      await assert.rejects(
        f.port.withClient(
          { ...f.request(), correlationId },
          async (_client, records) => {
            await records.listProjectResources({
              projectId: f.projectId,
              limit: 1,
            });
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
      assert.equal(audit!.operation, "resources.read");
      assert.equal(audit!.decision, "denied");
      assert.equal(audit!.code, "EXPIRED");
    } finally {
      await f.close();
    }
    const g = await fixture();
    try {
      await g.admin.db.execute(
        sql`create function commandry_test_resource_audit_fail() returns trigger language plpgsql as $$ begin if NEW.operation = 'resources.read' then raise exception 'Injected Resource audit failure'; end if; return NEW; end $$`,
      );
      await g.admin.db.execute(
        sql`create trigger commandry_test_resource_audit_fail before insert on foundation_audit for each row execute function commandry_test_resource_audit_fail()`,
      );
      const correlationId = crypto.randomUUID();
      await assert.rejects(
        g.port.withClient(
          { ...g.request(), correlationId },
          async (_client, records) =>
            records.listProjectResources({ projectId: g.projectId, limit: 1 }),
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
        sql`drop trigger if exists commandry_test_resource_audit_fail on foundation_audit`,
      );
      await g.admin.db.execute(
        sql`drop function if exists commandry_test_resource_audit_fail()`,
      );
      await g.close();
    }
  },
);

test(
  "Resource expiry during a real audit lock wait rolls back the allowed audit",
  { timeout: 30_000 },
  async () => {
    const f = await fixture();
    let unlock: (() => void) | undefined;
    let blocking: Promise<void> | undefined;
    let rejected: Promise<void> | undefined;
    try {
      await f.admin.db.execute(
        sql`create function commandry_test_resource_expiry_wait() returns trigger language plpgsql as $$ begin if NEW.operation = 'resources.read' then perform pg_advisory_xact_lock(542335); end if; return NEW; end $$`,
      );
      await f.admin.db.execute(
        sql`create trigger commandry_test_resource_expiry_wait before insert on foundation_audit for each row execute function commandry_test_resource_expiry_wait()`,
      );
      let ready!: () => void;
      const entered = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const held = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      blocking = f.admin.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(542335)`);
        ready();
        await held;
      });
      await entered;
      rejected = assert.rejects(
        f.service.listProjectResources(f.issued.token, {
          projectId: f.projectId,
        }),
        denied("EXPIRED"),
      );
      let observedWait = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await f.admin.db.execute(
          sql`select count(*)::int as count from pg_locks where locktype = 'advisory' and objid = 542335 and not granted`,
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
        "The Resource audit must actually reach the blocked PostgreSQL trigger",
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
          (row) =>
            row.operation === "resources.read" && row.decision === "allowed",
        ),
        false,
      );
      assert.equal(
        rows.some(
          (row) =>
            row.operation === "resources.read" &&
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
        sql`drop trigger if exists commandry_test_resource_expiry_wait on foundation_audit`,
      );
      await f.admin.db.execute(
        sql`drop function if exists commandry_test_resource_expiry_wait()`,
      );
      await f.close();
    }
  },
);
