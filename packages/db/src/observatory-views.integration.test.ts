import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { FoundationError } from "@commandry/domain";
import { createDatabase } from "./client";
import { createObservatoryViewsService } from "@commandry/application";
import { observatoryViewConfigurationSchema } from "@commandry/contracts";
import { createObservatoryViewsRepository } from "./observatory-views-repository";
import { observatoryNamedView, observatorySource } from "./observatory-schema";
import {
  auditEvent,
  project,
  projectResourceLink,
  resource,
  session,
  user,
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
const expired = (error: unknown) =>
  error instanceof FoundationError && /expired/i.test(error.message);

test(
  "canonical owner-private named views use real sessions, atomic versioned records and complete continuation",
  { timeout: 120000 },
  async (t) => {
    const admin = createDatabase({ connectionString: adminUrl, max: 4 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 4,
    });
    const now = new Date(),
      expiry = new Date(now.getTime() + 3600000);
    const userA = randomUUID(),
      userB = randomUUID(),
      sessionA = randomUUID(),
      sessionB = randomUUID();
    const projectA = randomUUID(),
      projectB = randomUUID(),
      repoId = randomUUID(),
      foreignResourceId = randomUUID(),
      sourceId = randomUUID();
    await admin.db.insert(user).values([
      { id: userA, name: "Named-view owner A", email: userA + "@example.test" },
      { id: userB, name: "Named-view owner B", email: userB + "@example.test" },
    ]);
    await admin.db.insert(session).values([
      { id: sessionA, userId: userA, token: randomUUID(), expiresAt: expiry },
      { id: sessionB, userId: userB, token: randomUUID(), expiresAt: expiry },
    ]);
    await admin.db.insert(project).values([
      { id: projectA, name: "Named-view project A" },
      { id: projectB, name: "Named-view project B" },
    ]);
    await admin.db.insert(resource).values([
      { id: repoId, name: "Preserved repository", kind: "repository" },
      {
        id: foreignResourceId,
        name: "Different project service",
        kind: "service",
      },
    ]);
    const linkA = randomUUID();
    await admin.db.insert(projectResourceLink).values([
      {
        id: linkA,
        projectId: projectA,
        resourceId: repoId,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "active",
      },
      {
        id: randomUUID(),
        projectId: projectB,
        resourceId: foreignResourceId,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "active",
      },
    ]);
    const ownerA = {
      principalId: "user:" + userA,
      sessionId: sessionA,
      expiresAt: expiry.toISOString(),
    };
    const ownerB = {
      principalId: "user:" + userB,
      sessionId: sessionB,
      expiresAt: expiry.toISOString(),
    };
    await admin.db.insert(observatorySource).values({
      id: sourceId,
      resourceId: repoId,
      kind: "github-repository",
      externalId: "synthetic/view-preservation",
      enabled: false,
      version: 1,
      freshnessSeconds: 300,
      provenance: {
        actorId: ownerA.principalId,
        recordedAt: now.toISOString(),
        evidenceRefs: ["fixture:preserved-source"],
      },
    });
    const configuration = observatoryViewConfigurationSchema.parse({
      schemaVersion: 2,
      grouping: "custom",
      sectors: [
        {
          id: "private",
          label: "Owner-private deployment grouping",
          resourceIds: [repoId],
          grouping: "hosts",
        },
      ],
    });
    const service = createObservatoryViewsService(
      createObservatoryViewsRepository(runtime.db),
    );
    const id = randomUUID();
    const create = {
      id,
      projectId: projectA,
      name: "Owner A private landscape",
      expectedVersion: 0,
      configuration,
    };
    let original: Awaited<ReturnType<typeof service.create>>;
    try {
      await t.test(
        "caller identity assertions without canonical sessions cannot read or mutate",
        async () => {
          await assert.rejects(
            () =>
              service.create({ ...ownerA, sessionId: randomUUID() }, create),
            denied("FORBIDDEN"),
          );
          await assert.rejects(
            () =>
              service.page({ ...ownerB, principalId: ownerA.principalId }, {}),
            denied("FORBIDDEN"),
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryNamedView)
                .where(eq(observatoryNamedView.id, id))
            ).length,
            0,
          );
        },
      );
      await t.test(
        "exact create retries return the original receipt and changed requests conflict without duplication",
        async () => {
          original = await service.create(ownerA, create);
          assert.deepEqual(await service.create(ownerA, create), original);
          await assert.rejects(
            () =>
              service.create(ownerA, { ...create, name: "Changed same UUID" }),
            denied("VERSION_CONFLICT"),
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryNamedView)
                .where(eq(observatoryNamedView.id, id))
            ).length,
            1,
          );
          assert.deepEqual(
            Object.keys(original).sort(),
            [
              "schemaVersion",
              "id",
              "projectId",
              "name",
              "version",
              "configuration",
              "updatedAt",
            ].sort(),
          );
          assert.ok(!JSON.stringify(original).includes(ownerA.principalId));
          assert.ok(!JSON.stringify(original).includes(sessionA));
        },
      );
      await t.test(
        "two actual owners have separate reads, filtered counts and collision-safe identities",
        async () => {
          await assert.rejects(
            () => service.read(ownerB, { id }),
            denied("NOT_FOUND"),
          );
          await assert.rejects(
            () => service.update(ownerB, { ...create, expectedVersion: 1 }),
            denied("NOT_FOUND"),
          );
          await assert.rejects(
            () => service.delete(ownerB, { id, expectedVersion: 1 }),
            denied("NOT_FOUND"),
          );
          await assert.rejects(
            () =>
              service.create(ownerB, {
                ...create,
                name: "Cross-owner collision",
              }),
            denied("VERSION_CONFLICT"),
          );
          const page = await service.page(ownerB, {});
          assert.equal(page.total, 0);
          assert.deepEqual(page.items, []);
          assert.ok(!JSON.stringify(page).includes(create.name));
        },
      );
      await t.test(
        "concurrent expected-version updates serialize to one winner with allowed and denied audits",
        async () => {
          const results = await Promise.allSettled([
            service.update(ownerA, {
              ...create,
              expectedVersion: 1,
              name: "First contender",
            }),
            service.update(ownerA, {
              ...create,
              expectedVersion: 1,
              name: "Second contender",
            }),
          ]);
          assert.equal(
            results.filter((result) => result.status === "fulfilled").length,
            1,
          );
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          assert.ok(
            failure &&
              failure.status === "rejected" &&
              denied("VERSION_CONFLICT")(failure.reason),
          );
          const current = await service.read(ownerA, { id });
          assert.equal(current.version, 2);
          assert.deepEqual(await service.create(ownerA, create), original!);
          const audits = await runtime.db
            .select()
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.actor, ownerA.principalId),
                eq(auditEvent.operation, "observatory.view.update"),
              ),
            );
          assert.equal(
            audits.filter((record) => record.details.decision === "allowed")
              .length,
            1,
          );
          assert.equal(
            audits.filter((record) => record.details.decision === "denied")
              .length,
            1,
          );
        },
      );
      await t.test(
        "nonexistent and foreign-project sector references are rejected before persistence",
        async () => {
          const invalid = (projectId: string, resourceIds: string[]) => ({
            ...create,
            id: randomUUID(),
            projectId,
            configuration: {
              ...configuration,
              sectors: [
                {
                  id: "invalid",
                  label: "Invalid",
                  grouping: "hosts",
                  resourceIds,
                },
              ],
            },
          });
          await assert.rejects(
            () => service.create(ownerA, invalid(randomUUID(), [])),
            denied("INVALID_REFERENCE"),
          );
          await assert.rejects(
            () => service.create(ownerA, invalid(projectA, [randomUUID()])),
            denied("INVALID_REFERENCE"),
          );
          await assert.rejects(
            () =>
              service.create(ownerA, invalid(projectA, [foreignResourceId])),
            denied("INVALID_REFERENCE"),
          );
          await admin.db
            .update(projectResourceLink)
            .set({ lifecycle: "archived" })
            .where(eq(projectResourceLink.id, linkA));
          await assert.rejects(
            () => service.read(ownerA, { id }),
            denied("INVALID_REFERENCE"),
          );
          await admin.db
            .update(projectResourceLink)
            .set({ lifecycle: "active" })
            .where(eq(projectResourceLink.id, linkA));
          assert.equal((await service.read(ownerA, { id })).version, 2);
        },
      );
      await t.test(
        "audit failure rolls back the version and content mutation",
        async () => {
          const before = await service.read(ownerA, { id });
          await admin.db.execute(
            sql`revoke insert on audit_event from commandry_app_integration`,
          );
          try {
            await assert.rejects(() =>
              service.update(ownerA, {
                ...create,
                expectedVersion: 2,
                name: "Must roll back",
              }),
            );
          } finally {
            await admin.db.execute(
              sql`grant insert on audit_event to commandry_app_integration`,
            );
          }
          assert.deepEqual(await service.read(ownerA, { id }), before);
        },
      );
      await t.test(
        "all 137 scoped views are reachable and counts exclude another owner's matching scope",
        async () => {
          const bare = observatoryViewConfigurationSchema.parse({
            schemaVersion: 2,
          });
          const expected = new Set<string>();
          for (let index = 0; index < 137; index++) {
            const viewId = randomUUID();
            expected.add(viewId);
            await service.create(ownerA, {
              id: viewId,
              projectId: projectB,
              name: "Private view " + index,
              expectedVersion: 0,
              configuration: bare,
            });
          }
          await service.create(ownerB, {
            id: randomUUID(),
            projectId: projectB,
            name: "Other owner's private name",
            expectedVersion: 0,
            configuration: bare,
          });
          const reached = new Set<string>();
          let cursor: string | null = null,
            pages = 0;
          do {
            const page = await service.page(ownerA, {
              projectId: projectB,
              limit: 25,
              cursor,
            });
            assert.equal(page.total, 137);
            assert.ok(
              page.items.every(
                (view) =>
                  view.projectId === projectB &&
                  !view.name.includes("Other owner"),
              ),
            );
            for (const view of page.items) {
              assert.ok(!reached.has(view.id));
              reached.add(view.id);
            }
            cursor = page.nextCursor;
            pages++;
          } while (cursor);
          assert.equal(pages, 6);
          assert.deepEqual([...reached].sort(), [...expected].sort());
          assert.equal(
            (await service.page(ownerB, { projectId: projectB })).total,
            1,
          );
          assert.equal(
            (await service.page(ownerA, { projectId: null })).total,
            0,
          );
        },
      );
      await t.test(
        "the real session row stays locked through the owner operation and is checked after revocation",
        async () => {
          const lockSession = randomUUID();
          await admin.db.insert(session).values({
            id: lockSession,
            userId: userA,
            token: randomUUID(),
            expiresAt: expiry,
          });
          const lockingOwner = { ...ownerA, sessionId: lockSession };
          let enter!: () => void, resume!: () => void;
          const entered = new Promise<void>((resolve) => {
            enter = resolve;
          });
          const resumed = new Promise<void>((resolve) => {
            resume = resolve;
          });
          const read = createObservatoryViewsRepository(runtime.db).withOwner(
            lockingOwner,
            async (records) => {
              enter();
              await resumed;
              return records.read({ id });
            },
          );
          await entered;
          try {
            await assert.rejects(
              () =>
                admin.db.transaction(async (tx) => {
                  await tx.execute(sql`set local lock_timeout='100ms'`);
                  await tx.delete(session).where(eq(session.id, lockSession));
                }),
              (error: unknown) =>
                /lock timeout/i.test(
                  String(error) + String((error as { cause?: unknown }).cause),
                ),
            );
          } finally {
            resume();
          }
          assert.equal((await read).id, id);
          await admin.db.delete(session).where(eq(session.id, lockSession));
          await assert.rejects(
            () => service.read(lockingOwner, { id }),
            denied("FORBIDDEN"),
          );
        },
      );
      await t.test(
        "expiry before mutation rolls back and post-commit expiry withholds the result",
        async () => {
          const expiredClock = new Date(expiry.getTime() + 1);
          let calls = 0;
          const waiting = createObservatoryViewsService(
            createObservatoryViewsRepository(runtime.db, () =>
              ++calls > 2 ? expiredClock : now,
            ),
          );
          const waitingId = randomUUID();
          await assert.rejects(
            () => waiting.create(ownerA, { ...create, id: waitingId }),
            expired,
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryNamedView)
                .where(eq(observatoryNamedView.id, waitingId))
            ).length,
            0,
          );
          let committed = false;
          const wrapped = new Proxy(runtime.db, {
            get(target, key, receiver) {
              if (key === "transaction")
                return async (
                  ...args: Parameters<typeof runtime.db.transaction>
                ) => {
                  const result = await target.transaction(...args);
                  committed = true;
                  return result;
                };
              const value = Reflect.get(target, key, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          const commitId = randomUUID();
          const afterCommit = createObservatoryViewsService(
            createObservatoryViewsRepository(wrapped, () =>
              committed ? expiredClock : now,
            ),
          );
          await assert.rejects(
            () => afterCommit.create(ownerA, { ...create, id: commitId }),
            expired,
          );
          const receipt = await service.create(ownerA, {
            ...create,
            id: commitId,
          });
          assert.equal(receipt.version, 1);
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatoryNamedView)
                .where(eq(observatoryNamedView.id, commitId))
            ).length,
            1,
          );
        },
      );
      await t.test(
        "an actual audit wait retains the session lock and expiry rolls back both data and audit",
        async () => {
          const auditId = randomUUID();
          const suffix = auditId.replaceAll("-", "");
          const functionName = `observatory_view_wait_${suffix}`;
          const triggerName = `observatory_view_wait_${suffix}`;
          const lockKey = parseInt(suffix.slice(0, 7), 16);
          await admin.db.execute(
            sql.raw(
              `create function ${functionName}() returns trigger language plpgsql as $$ begin if NEW.operation = 'observatory.view.create' and (NEW.details->>'targetId') = '${auditId}' then perform pg_advisory_xact_lock(${lockKey}); end if; return NEW; end; $$; create trigger ${triggerName} before insert on audit_event for each row execute function ${functionName}();`,
            ),
          );
          let entered!: () => void, release!: () => void;
          const held = new Promise<void>((resolve) => {
            entered = resolve;
          });
          const released = new Promise<void>((resolve) => {
            release = resolve;
          });
          const gate = admin.db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(${lockKey})`);
            entered();
            await released;
          });
          await held;
          let expiredAtAudit = false;
          const protectedService = createObservatoryViewsService(
            createObservatoryViewsRepository(runtime.db, () =>
              expiredAtAudit ? new Date(expiry.getTime() + 1) : now,
            ),
          );
          const attempt = protectedService
            .create(ownerA, { ...create, id: auditId })
            .then(
              (value) => ({ ok: true as const, value }),
              (error: unknown) => ({ ok: false as const, error }),
            );
          try {
            try {
              const deadline = Date.now() + 5000;
              let blocked = false;
              while (Date.now() < deadline) {
                const locks = await admin.db.execute(
                  sql`select count(*)::integer as waiting from pg_locks where locktype='advisory' and objid=${lockKey}::oid and not granted`,
                );
                if (Number(locks.rows[0]?.waiting) > 0) {
                  blocked = true;
                  break;
                }
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
              assert.ok(
                blocked,
                "the actual audit insert reached its PostgreSQL lock wait",
              );
              await assert.rejects(
                () =>
                  admin.db.transaction(async (tx) => {
                    await tx.execute(sql`set local lock_timeout='100ms'`);
                    await tx.delete(session).where(eq(session.id, sessionA));
                  }),
                (error: unknown) =>
                  /lock timeout/i.test(
                    String(error) +
                      String((error as { cause?: unknown }).cause),
                  ),
              );
              expiredAtAudit = true;
            } finally {
              release();
              await gate;
            }
            const outcome = await attempt;
            assert.ok(!outcome.ok && expired(outcome.error));
            assert.equal(
              (
                await runtime.db
                  .select()
                  .from(observatoryNamedView)
                  .where(eq(observatoryNamedView.id, auditId))
              ).length,
              0,
            );
            const audits = await runtime.db
              .select()
              .from(auditEvent)
              .where(sql`${auditEvent.details}->>'targetId' = ${auditId}`);
            assert.equal(audits.length, 0);
          } finally {
            release();
            await gate;
            await attempt;
            await admin.db.execute(
              sql.raw(
                `drop trigger if exists ${triggerName} on audit_event; drop function if exists ${functionName}();`,
              ),
            );
          }
        },
      );
      await t.test(
        "raw existing v2 views and canonical/source IDs survive repeat migration and repository restart",
        async () => {
          const legacyId = randomUUID();
          const legacy = observatoryViewConfigurationSchema.parse({
            schemaVersion: 2,
            theme: "midnight",
            sizeBasis: "ram",
            camera: "manual",
          });
          await admin.db.insert(observatoryNamedView).values({
            id: legacyId,
            ownerId: ownerA.principalId,
            name: "Existing private view",
            version: 4,
            configuration: legacy,
            updatedAt: now,
          });
          const before = await service.read(ownerA, { id: legacyId });
          const migration = await readFile(
            new URL(
              "../migrations/0070_observatory_canonical_records.sql",
              import.meta.url,
            ),
            "utf8",
          );
          await admin.db.execute(sql.raw(migration));
          await admin.db.execute(sql.raw(migration));
          const restarted = createObservatoryViewsService(
            createObservatoryViewsRepository(runtime.db),
          );
          assert.deepEqual(
            await restarted.read(ownerA, { id: legacyId }),
            before,
          );
          assert.deepEqual(before.configuration, legacy);
          assert.equal(before.projectId, null);
          assert.equal(
            (
              await runtime.db
                .select()
                .from(resource)
                .where(eq(resource.id, repoId))
            )[0]?.name,
            "Preserved repository",
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(projectResourceLink)
                .where(eq(projectResourceLink.id, linkA))
            )[0]?.resourceId,
            repoId,
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(observatorySource)
                .where(eq(observatorySource.id, sourceId))
            )[0]?.externalId,
            "synthetic/view-preservation",
          );
        },
      );
      await t.test(
        "stale and corrupt references reject explicitly while versioned repair/delete remains available",
        async () => {
          const staleId = randomUUID(),
            disposableResource = randomUUID();
          await admin.db.insert(resource).values({
            id: disposableResource,
            name: "Disposable view member",
            kind: "repository",
          });
          await service.create(ownerA, {
            ...create,
            id: staleId,
            projectId: null,
            configuration: {
              ...configuration,
              sectors: [
                {
                  id: "temporary",
                  label: "Temporary",
                  resourceIds: [disposableResource],
                  grouping: "hosts",
                },
              ],
            },
          });
          await admin.db
            .delete(resource)
            .where(eq(resource.id, disposableResource));
          await assert.rejects(
            () => service.read(ownerA, { id: staleId }),
            denied("INVALID_REFERENCE"),
          );
          await service.update(ownerA, {
            ...create,
            id: staleId,
            projectId: null,
            expectedVersion: 1,
            configuration: { schemaVersion: 2 },
          });
          await admin.db
            .update(observatoryNamedView)
            .set({ configuration: { corrupt: true } })
            .where(eq(observatoryNamedView.id, staleId));
          await assert.rejects(
            () => service.read(ownerA, { id: staleId }),
            denied("INVALID_REFERENCE"),
          );
          const deleted = await service.delete(ownerA, {
            id: staleId,
            expectedVersion: 2,
          });
          assert.equal(deleted.deleted, true);
          assert.equal(deleted.version, 3);
          await assert.rejects(
            () => service.read(ownerA, { id: staleId }),
            denied("NOT_FOUND"),
          );
        },
      );
      await t.test(
        "deletion is versioned and exact create retry never resurrects a tombstoned view",
        async () => {
          await assert.rejects(
            () => service.delete(ownerA, { id, expectedVersion: 1 }),
            denied("VERSION_CONFLICT"),
          );
          assert.equal(
            (await service.delete(ownerA, { id, expectedVersion: 2 })).version,
            3,
          );
          await assert.rejects(
            () => service.read(ownerA, { id }),
            denied("NOT_FOUND"),
          );
          assert.deepEqual(await service.create(ownerA, create), original!);
          await assert.rejects(
            () => service.read(ownerA, { id }),
            denied("NOT_FOUND"),
          );
          await assert.rejects(
            () => service.create(ownerA, { ...create, name: "Reused UUID" }),
            denied("VERSION_CONFLICT"),
          );
          const audits = await runtime.db
            .select()
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.actor, ownerA.principalId),
                eq(auditEvent.operation, "observatory.view.delete"),
              ),
            );
          assert.ok(
            audits.some(
              (event) =>
                event.details.decision === "allowed" &&
                event.details.targetId === id,
            ),
          );
        },
      );
      await t.test(
        "expired real sessions cannot list private views",
        async () => {
          await admin.db
            .update(session)
            .set({ expiresAt: new Date(now.getTime() - 1000) })
            .where(eq(session.id, sessionB));
          await assert.rejects(() => service.page(ownerB), expired);
        },
      );
    } finally {
      await runtime.close();
      await admin.close();
    }
  },
);
