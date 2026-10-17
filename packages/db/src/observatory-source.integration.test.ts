import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import {
  createFoundationOwnerService,
  createObservatoryManagementService,
  createObservatoryReadService,
  createOperationalObservationPoller,
  type OperationalObservation,
  type OperationalSourceClaim,
} from "@commandry/application";
import { foundationTokenDigest } from "@commandry/domain";
import { createDatabase } from "./client";
import { createFoundationAccessRepository } from "./foundation-access-repository";
import { createObservatoryManagementRepository } from "./observatory-management-repository";
import { createObservatoryMachineReadRepository } from "./observatory-read-repository";
import { createObservatorySourceRepository } from "./observatory-source-repository";
import {
  observatorySource as source,
  observatoryObservation as history,
} from "./observatory-schema";
import {
  auditEvent,
  project,
  projectResourceLink as link,
  resource,
  session,
  user,
} from "./schema";

// Test-only package-boundary exception recorded in T10-ESCALATION-1.md.
const {
  createInfraAgentAvailabilityReader,
}: {
  createInfraAgentAvailabilityReader(options: {
    baseUrl: string;
    apiKey: string;
    allowLoopbackForTests: boolean;
    now: () => Date;
  }): (claim: OperationalSourceClaim) => Promise<OperationalObservation>;
} = await import(
  new URL("../../platform/src/infraagent-availability.ts", import.meta.url).href
);
const {
  createOperationalPayloadCipher,
}: {
  createOperationalPayloadCipher(key: string): {
    seal(value: unknown): Record<string, unknown>;
    open(envelope: unknown): unknown;
  };
} = await import(
  new URL("../../platform/src/operational-payload-cipher.ts", import.meta.url)
    .href
);

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const password = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !password)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = password;

test(
  "leased project-owned operational originals survive failures, restarts and real HTTP recovery",
  { timeout: 120000 },
  async (t) => {
    const admin = createDatabase({ connectionString: adminUrl, max: 5 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 8,
    });
    let time = Date.now() + 1000;
    const now = () => new Date(time);
    const cipher = createOperationalPayloadCipher(
      "synthetic_APP_ENCRYPTION_KEY_32_characters_minimum",
    );
    const makeRepository = (sealOriginal = cipher.seal) =>
      createObservatorySourceRepository(runtime.db, {
        kinds: ["infraagent-monitor", "github-repository"],
        sealOriginal,
        now,
        jitterSeconds: () => 0,
      });
    const repo = makeRepository();
    const projectId = randomUUID(),
      resourceId = randomUUID(),
      repositoryId = randomUUID(),
      userId = randomUUID(),
      sessionId = randomUUID(),
      sourceId = randomUUID(),
      linkId = randomUUID();
    await admin.db.insert(user).values({
      id: userId,
      name: "Operational test owner",
      email: userId + "@example.test",
    });
    await admin.db.insert(session).values({
      id: sessionId,
      userId,
      token: randomUUID(),
      expiresAt: new Date(time + 86400000),
    });
    await admin.db
      .insert(project)
      .values({ id: projectId, name: "Operational fixture" });
    await admin.db.insert(resource).values([
      { id: resourceId, kind: "service", name: "Explicit monitored service" },
      { id: repositoryId, kind: "repository", name: "Explicit repository" },
    ]);
    await admin.db.insert(link).values([
      {
        id: linkId,
        projectId,
        resourceId,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "active",
      },
      {
        id: randomUUID(),
        projectId,
        resourceId: repositoryId,
        type: "relates_to",
        sourceKind: "project",
        targetKind: "resource",
        lifecycle: "active",
      },
    ]);
    const owner = {
      principalId: "user:" + userId,
      sessionId,
      expiresAt: new Date(time + 86400000).toISOString(),
    };
    const management = createObservatoryManagementService(
      createObservatoryManagementRepository(runtime.db),
    );
    const review = {
      evidenceRefs: ["fixture:reviewed-operational-binding"],
      note: "Reviewed synthetic explicit binding",
    };
    const sourceInput = {
      id: sourceId,
      expectedVersion: 0,
      projectId,
      resourceId,
      environment: "test",
      kind: "infraagent-monitor" as const,
      externalId: "monitor-one",
      enabled: true,
      freshnessSeconds: 300,
      review,
    };
    await management.review(owner, "source", sourceInput);
    const row = async () =>
      (
        await runtime.db.select().from(source).where(eq(source.id, sourceId))
      )[0]!;
    const originals = () =>
      runtime.db.select().from(history).where(eq(history.sourceId, sourceId));
    const audits = () =>
      runtime.db
        .select()
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.operation, "observatory.source.observed"),
            sql`${auditEvent.details}->>'sourceId' = ${sourceId}`,
          ),
        );
    const due = async () => {
      time += 301000;
      await runtime.db
        .update(source)
        .set({ nextAttemptAt: now() })
        .where(eq(source.id, sourceId));
      const claim = await repo.claim();
      assert.ok(claim);
      assert.equal(claim.id, sourceId);
      return claim;
    };
    const observation = (
      claim: OperationalSourceClaim,
      at = new Date(time - 1000).toISOString(),
      state: "passing" | "failing" = "failing",
    ): OperationalObservation => ({
      sourceId: claim.id,
      resourceId: claim.resourceId,
      observedAt: at,
      signals: [
        {
          id: "check:" + at,
          sourceId: claim.id,
          resourceId: claim.resourceId,
          environment: claim.environment,
          facet: "availability",
          state,
          observedAt: at,
          freshnessMs: claim.freshnessSeconds * 1000,
          evidenceRefs: ["fixture:upstream-check"],
          incidentId: state === "failing" ? "incident-stable" : null,
        },
      ],
      details: { sourceState: "available", monitorId: claim.externalId },
      rawPayload: {
        original: {
          config: { password: "PRIVATE_MONITOR_CREDENTIAL" },
          target: "https://private.invalid/?token=PRIVATE",
        },
        at,
        state,
      },
    });
    try {
      await t.test(
        "only one concurrent worker leases the reviewed binding for five minutes",
        async () => {
          assert.equal(
            await createObservatorySourceRepository(runtime.db, {
              kinds: [],
              sealOriginal: cipher.seal,
            }).claim(),
            null,
          );
          const claims = await Promise.all(
            Array.from({ length: 20 }, () => makeRepository().claim()),
          );
          assert.equal(claims.filter(Boolean).length, 1);
          const claim = claims.find(Boolean)!;
          assert.equal(claim.environment, "test");
          assert.equal(claim.freshnessSeconds, 300);
          assert.equal((await row()).leaseUntil!.getTime(), time + 300000);
          assert.equal((await row()).lastAttemptAt!.getTime(), time);
          await repo.complete(claim, observation(claim));
        },
      );
      await t.test(
        "immutable encrypted originals retain exact binding, upstream time and incident identity",
        async () => {
          const [original] = await originals();
          assert.ok(original);
          assert.equal(original.projectId, projectId);
          assert.equal(original.resourceId, resourceId);
          assert.equal(original.sourceVersion, 1);
          assert.equal(
            original.observedAt!.toISOString(),
            original.signals[0]!.observedAt,
          );
          assert.equal(original.signals[0]!.incidentId, "incident-stable");
          assert.equal(
            JSON.stringify(original.rawPayload).includes("PRIVATE"),
            false,
          );
          assert.deepEqual(cipher.open(original.rawPayload), {
            original: {
              config: { password: "PRIVATE_MONITOR_CREDENTIAL" },
              target: "https://private.invalid/?token=PRIVATE",
            },
            at: original.observedAt!.toISOString(),
            state: "failing",
          });
          await assert.rejects(() =>
            runtime.db
              .update(history)
              .set({ details: {} })
              .where(eq(history.sourceId, sourceId)),
          );
          await assert.rejects(() =>
            runtime.db.delete(history).where(eq(history.sourceId, sourceId)),
          );
          const [audit] = await audits();
          assert.ok(audit);
          assert.equal(audit.details.digest, original.contentDigest);
          assert.deepEqual(Object.keys(audit.details).sort(), [
            "digest",
            "projectId",
            "resourceId",
            "sourceId",
          ]);
        },
      );
      await t.test(
        "identical content across restarted repositories appends no history or audit and never reseals",
        async () => {
          const prior = (await originals())[0]!;
          const claim = await due();
          const same = observation(claim, prior.observedAt!.toISOString());
          same.rawPayload = {
            state: "failing",
            at: prior.observedAt!.toISOString(),
            original: {
              target: "https://private.invalid/?token=PRIVATE",
              config: { password: "PRIVATE_MONITOR_CREDENTIAL" },
            },
          };
          const restarted = makeRepository(() => {
            throw new Error("Duplicate must not be resealed");
          });
          await restarted.complete(claim, same);
          assert.equal((await originals()).length, 1);
          assert.equal((await audits()).length, 1);
        },
      );
      await t.test(
        "direct malformed observations and mutated lease identities cannot write",
        async () => {
          const claim = await due(),
            before = await row();
          for (const changed of [
            { resourceId: repositoryId },
            { externalId: "different" },
            { environment: "foreign" },
            { freshnessSeconds: 301 },
            { kind: "github-repository" as const },
          ]) {
            await repo.complete({ ...claim, ...changed }, observation(claim));
            await repo.fail(
              { ...claim, ...changed },
              "OPERATIONAL_UNAVAILABLE",
              60,
            );
            assert.deepEqual(await row(), before);
          }
          const malformed = observation(claim);
          malformed.signals[0]!.sourceId = randomUUID();
          await assert.rejects(
            () => repo.complete(claim, malformed),
            /OPERATIONAL_INVALID_OBSERVATION/,
          );
          assert.deepEqual(await row(), before);
          await repo.complete(claim, observation(claim));
        },
      );
      await t.test(
        "only safe bounded exponential retry metadata changes on failure",
        async () => {
          let claim = await due();
          const before = await row(),
            count = (await originals()).length;
          await repo.fail(
            claim,
            "Bearer PRIVATE https://private.invalid/error",
            Infinity,
          );
          let failed = await row();
          assert.equal(failed.lastError, "OPERATIONAL_UNAVAILABLE");
          assert.equal(failed.failures, 1);
          assert.equal(failed.nextAttemptAt.getTime(), time + 60000);
          assert.deepEqual(failed.snapshot, before.snapshot);
          assert.equal(
            failed.lastSuccessAt!.getTime(),
            before.lastSuccessAt!.getTime(),
          );
          assert.equal((await originals()).length, count);
          assert.equal(await repo.claim(), null);
          claim = await due();
          await repo.fail(claim, "OPERATIONAL_TIMEOUT", -1);
          failed = await row();
          assert.equal(failed.nextAttemptAt.getTime(), time + 120000);
          claim = await due();
          await repo.fail(claim, "OPERATIONAL_RATE_LIMITED", 99999999);
          assert.equal((await row()).nextAttemptAt.getTime(), time + 86400000);
          claim = await due();
          await repo.complete(claim, observation(claim));
          assert.equal((await row()).failures, 0);
          assert.equal((await row()).lastError, null);
        },
      );
      await t.test(
        "out-of-order actual observations append evidence without regressing current signals",
        async () => {
          const before = await row(),
            claim = await due();
          const old = observation(claim, "2020-01-01T00:00:00.000Z", "passing");
          await repo.complete(claim, old);
          assert.deepEqual((await row()).snapshot, before.snapshot);
          assert.ok(
            (await originals()).some(
              (item) =>
                item.observedAt!.getTime() === Date.parse(old.observedAt!),
            ),
          );
          const pausedClaim = await due(),
            pausedAt = new Date(time - 500).toISOString();
          await repo.complete(pausedClaim, {
            sourceId,
            resourceId,
            observedAt: pausedAt,
            signals: [],
            details: { sourceState: "disabled", reason: "paused" },
            rawPayload: { pausedAt },
          });
          const paused = (await row()).snapshot;
          const delayedClaim = await due();
          await repo.complete(
            delayedClaim,
            observation(
              delayedClaim,
              new Date(Date.parse(pausedAt) - 100).toISOString(),
              "passing",
            ),
          );
          assert.deepEqual(
            (await row()).snapshot,
            paused,
            "an older passing check cannot replace newer paused coverage",
          );
        },
      );
      await t.test(
        "unknown and paused reads have null measurement time while retaining last-known signals and originals",
        async () => {
          const before = await row(),
            count = (await originals()).length;
          for (const details of [
            { sourceState: "unknown", reason: "no_observation" },
            { sourceState: "disabled", reason: "paused" },
          ]) {
            const claim = await due();
            await repo.complete(claim, {
              sourceId,
              resourceId,
              observedAt: null,
              signals: [],
              details,
              rawPayload: {
                monitor: {
                  enabled: details.sourceState !== "disabled",
                  lastCheckedAt: null,
                },
                sourceState: details.sourceState,
              },
            });
            const current = await row();
            assert.equal(current.snapshot!.observedAt, null);
            assert.deepEqual(
              current.snapshot!.signals,
              before.snapshot!.signals,
            );
            assert.deepEqual(current.snapshot!.details, details);
          }
          assert.equal((await originals()).length, count + 2);
          assert.equal(
            (await originals()).filter((item) => item.observedAt === null)
              .length,
            2,
          );
        },
      );
      for (const [label, details, dated] of [
        ["paused", { sourceState: "disabled", reason: "paused" }, false],
        [
          "unknown",
          { sourceState: "unknown", reason: "no_observation" },
          false,
        ],
        ["paused-dated", { sourceState: "disabled", reason: "paused" }, true],
        ["pending-dated", { sourceState: "unknown", reason: "pending" }, true],
        ["unknown-dated", { sourceState: "unknown", reason: "unknown" }, true],
      ] as const) {
        await t.test(
          `${label} -> actual -> identical ${label} reapplies current coverage without resealing or appending history/audit`,
          async () => {
            const empty: OperationalObservation = {
              sourceId,
              resourceId,
              observedAt: dated ? new Date(time - 1000).toISOString() : null,
              signals: [],
              details,
              rawPayload: { transitionControl: label, lastCheckedAt: null },
            };
            const first = await due();
            await repo.complete(first, empty);
            assert.equal((await row()).snapshot!.observedAt, empty.observedAt);
            assert.deepEqual((await row()).snapshot!.details, details);
            const actual = await due(),
              actualObservation = observation(actual);
            await repo.complete(actual, actualObservation);
            const beforeRepeat = await row(),
              historyCount = (await originals()).length,
              auditCount = (await audits()).length;
            assert.deepEqual(
              beforeRepeat.snapshot!.details,
              actualObservation.details,
            );
            const repeated = await due();
            await makeRepository(() => {
              throw new Error("Repeated coverage must not be resealed");
            }).complete(repeated, structuredClone(empty));
            assert.equal((await originals()).length, historyCount);
            assert.equal((await audits()).length, auditCount);
            const current = await row();
            assert.equal(
              current.snapshot!.observedAt,
              empty.observedAt,
              "current coverage retains the real source time, including null when absent",
            );
            assert.deepEqual(current.snapshot!.details, details);
            assert.deepEqual(
              current.snapshot!.signals,
              beforeRepeat.snapshot!.signals,
            );
            assert.equal(
              current.snapshot!.latestAcceptedObservedAt,
              actualObservation.observedAt,
            );
            assert.equal(current.lastError, null);
            assert.equal(current.leaseId, null);
          },
        );
      }
      await t.test(
        "T1 failure -> T2 paused -> older pass rejected -> null unknown -> second older pass remains rejected",
        async () => {
          const failureClaim = await due();
          const t1 = new Date(time - 10000).toISOString(),
            t2 = new Date(time - 1000).toISOString();
          const failure = observation(failureClaim, t1);
          await repo.complete(failureClaim, failure);
          const next = async () => {
            await runtime.db
              .update(source)
              .set({ nextAttemptAt: now() })
              .where(eq(source.id, sourceId));
            const claim = await repo.claim();
            assert.ok(claim);
            assert.equal(claim.id, sourceId);
            return claim;
          };
          await repo.complete(await next(), {
            sourceId,
            resourceId,
            observedAt: t2,
            signals: [],
            details: { sourceState: "disabled", reason: "paused" },
            rawPayload: { transitionControl: "watermark-paused", at: t2 },
          });
          const paused = (await row()).snapshot;
          assert.equal(paused!.latestAcceptedObservedAt, t2);
          const older = await next();
          await repo.complete(
            older,
            observation(
              older,
              new Date(Date.parse(t1) + 5000).toISOString(),
              "passing",
            ),
          );
          assert.deepEqual(
            (await row()).snapshot,
            paused,
            "non-null control must reject the first delayed passing check",
          );
          await repo.complete(await next(), {
            sourceId,
            resourceId,
            observedAt: null,
            signals: [],
            details: { sourceState: "unknown", reason: "no_observation" },
            rawPayload: {
              transitionControl: "watermark-unknown",
              lastCheckedAt: null,
            },
          });
          const unknown = (await row()).snapshot;
          assert.equal(unknown!.observedAt, null);
          assert.equal(unknown!.latestAcceptedObservedAt, t2);
          assert.deepEqual(unknown!.signals, failure.signals);
          const secondOlder = await next(),
            historyCount = (await originals()).length,
            auditCount = (await audits()).length;
          await repo.complete(
            secondOlder,
            observation(
              secondOlder,
              new Date(Date.parse(t1) + 6000).toISOString(),
              "passing",
            ),
          );
          assert.equal((await originals()).length, historyCount + 1);
          assert.equal((await audits()).length, auditCount + 1);
          assert.deepEqual(
            (await row()).snapshot,
            unknown,
            "null coverage must retain T2's ordering boundary against the second delayed passing check",
          );
          assert.deepEqual((await row()).snapshot!.signals, failure.signals);
        },
      );
      await t.test(
        "an exact historical actual cannot replay over a different accepted actual at the same upstream timestamp",
        async () => {
          const first = await due(),
            at = new Date(time - 1000).toISOString();
          const failing = observation(first, at, "failing");
          await repo.complete(first, failing);
          const next = async () => {
            await runtime.db
              .update(source)
              .set({ nextAttemptAt: now() })
              .where(eq(source.id, sourceId));
            const claim = await repo.claim();
            assert.ok(claim);
            assert.equal(claim.id, sourceId);
            return claim;
          };
          const second = await next();
          await repo.complete(second, observation(second, at, "passing"));
          const beforeReplay = await row(),
            historyCount = (await originals()).length,
            auditCount = (await audits()).length;
          assert.equal(
            (beforeReplay.snapshot!.signals as { state: string }[])[0]!.state,
            "passing",
          );
          await makeRepository(() => {
            throw new Error("A historical actual must not be resealed");
          }).complete(await next(), failing);
          assert.equal((await originals()).length, historyCount);
          assert.equal((await audits()).length, auditCount);
          assert.deepEqual(
            (await row()).snapshot,
            beforeReplay.snapshot,
            "the exact historical failing original cannot replay over the later passing state at equal time",
          );
        },
      );
      await t.test(
        "disabled, unbound, wrong-kind and missing active project-link sources are never claimed",
        async () => {
          await runtime.db
            .update(source)
            .set({ enabled: false })
            .where(eq(source.id, sourceId));
          const invalid: (typeof source.$inferInsert)[] = [
            {
              projectId: null,
              resourceId,
              kind: "infraagent-monitor",
              enabled: true,
            },
            {
              projectId,
              resourceId: repositoryId,
              kind: "infraagent-monitor",
              enabled: true,
            },
            { projectId, resourceId, kind: "github-repository", enabled: true },
          ].map((item) => ({
            ...item,
            id: randomUUID(),
            externalId: "unclaimable",
            freshnessSeconds: 300,
            version: 1,
            nextAttemptAt: now(),
            provenance: {
              actorId: "fixture",
              recordedAt: now().toISOString(),
              evidenceRefs: ["fixture:invalid-claim"],
            },
          }));
          await admin.db.insert(source).values(invalid);
          assert.equal(await repo.claim(), null);
          await admin.db
            .update(source)
            .set({ enabled: false })
            .where(inArrayIds(invalid.map((item) => item.id)));
          await runtime.db
            .update(source)
            .set({ enabled: true, nextAttemptAt: now() })
            .where(eq(source.id, sourceId));
          await admin.db
            .update(link)
            .set({ lifecycle: "archived" })
            .where(eq(link.id, linkId));
          assert.equal(await repo.claim(), null);
          await admin.db
            .update(link)
            .set({ lifecycle: "active" })
            .where(eq(link.id, linkId));
        },
      );
      await t.test(
        "expired leases, removed links, disabled and rebound identities fence old results and failures",
        async () => {
          let claim = await due();
          const before = await row(),
            count = (await originals()).length;
          time += 300001;
          const replacement = await repo.claim();
          assert.ok(replacement);
          await repo.complete(claim, observation(claim));
          await repo.fail(claim, "OPERATIONAL_TIMEOUT", 60);
          assert.equal((await row()).leaseId, replacement.leaseId);
          assert.equal((await originals()).length, count);
          await repo.complete(replacement, observation(replacement));
          claim = await due();
          await admin.db
            .update(link)
            .set({ lifecycle: "archived" })
            .where(eq(link.id, linkId));
          const noLink = await row();
          await repo.complete(claim, observation(claim));
          await repo.fail(claim, "OPERATIONAL_TIMEOUT", 60);
          assert.deepEqual(await row(), noLink);
          await admin.db
            .update(link)
            .set({ lifecycle: "active" })
            .where(eq(link.id, linkId));
          await runtime.db
            .update(source)
            .set({ enabled: false })
            .where(eq(source.id, sourceId));
          const disabled = await row();
          await repo.complete(claim, observation(claim));
          await repo.fail(claim, "OPERATIONAL_TIMEOUT", 60);
          assert.deepEqual(await row(), disabled);
          await runtime.db
            .update(source)
            .set({ enabled: true })
            .where(eq(source.id, sourceId));
          await management.review(owner, "source", {
            ...sourceInput,
            expectedVersion: before.version,
            externalId: "monitor-rebound",
          });
          const rebound = await row();
          assert.equal(rebound.leaseId, null);
          assert.equal(rebound.snapshot, null);
          await repo.complete(claim, observation(claim));
          await repo.fail(claim, "OPERATIONAL_TIMEOUT", 60);
          assert.deepEqual(await row(), rebound);
        },
      );
      await t.test(
        "sealing failure and expiry during awaited sealing roll back data and lease metadata",
        async () => {
          const claim = await due(),
            before = await row(),
            count = (await originals()).length;
          await assert.rejects(
            () =>
              makeRepository(() => {
                throw new Error("synthetic sealing failure");
              }).complete(claim, observation(claim)),
            /synthetic sealing failure/,
          );
          assert.deepEqual(await row(), before);
          assert.equal((await originals()).length, count);
          await assert.rejects(
            () =>
              createObservatorySourceRepository(runtime.db, {
                kinds: ["infraagent-monitor"],
                now,
                sealOriginal: async (value) => {
                  await Promise.resolve();
                  time += 300001;
                  return cipher.seal(value);
                },
              }).complete(claim, observation(claim)),
            /OPERATIONAL_INVALID_CLAIM/,
          );
          assert.deepEqual(await row(), before);
          assert.equal((await originals()).length, count);
        },
      );
      await t.test(
        "audit insertion failure rolls back the immutable original, snapshot and lease release",
        async () => {
          const claim = await due(),
            before = await row(),
            count = (await originals()).length;
          await admin.db.execute(
            sql`revoke insert on audit_event from commandry_app_integration`,
          );
          try {
            await assert.rejects(() =>
              repo.complete(claim, observation(claim)),
            );
          } finally {
            await admin.db.execute(
              sql`grant insert on audit_event to commandry_app_integration`,
            );
          }
          assert.deepEqual(await row(), before);
          assert.equal((await originals()).length, count);
          await repo.complete(claim, observation(claim));
        },
      );
      await t.test(
        "expiry while actual audit insertion waits rolls back evidence and holds the active binding",
        async () => {
          const claim = await due(),
            before = await row(),
            count = (await originals()).length;
          const suffix = randomUUID().replaceAll("-", ""),
            gate = 17391;
          const functionName = "operational_audit_gate_" + suffix;
          const triggerName = "operational_audit_gate_" + suffix;
          let unlock!: () => void, locked!: () => void;
          const barrier = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          const entered = new Promise<void>((resolve) => {
            locked = resolve;
          });
          await admin.db.execute(
            sql.raw(
              `create function ${functionName}() returns trigger language plpgsql as $$ begin if NEW.details->>'sourceId' = '${sourceId}' then perform pg_advisory_xact_lock(${gate}); end if; return NEW; end $$`,
            ),
          );
          await admin.db.execute(
            sql.raw(
              `create trigger ${triggerName} before insert on audit_event for each row execute function ${functionName}()`,
            ),
          );
          const blocker = admin.db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(${gate})`);
            locked();
            await barrier;
          });
          await entered;
          const completion = repo.complete(claim, observation(claim));
          const outcome = completion.then(
            () => null,
            (error: unknown) => error,
          );
          try {
            let waiting = false;
            for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
              const result = await admin.db.execute(
                sql`select 1 from pg_stat_activity where usename = 'commandry_app_integration' and wait_event = 'advisory' and query like '%audit_event%'`,
              );
              waiting = result.rows.length > 0;
              if (!waiting)
                await new Promise<void>((resolve) => setTimeout(resolve, 5));
            }
            assert.equal(
              waiting,
              true,
              "actual audit insert must wait at the PostgreSQL boundary",
            );
            await assert.rejects(
              () =>
                admin.db.transaction(async (tx) => {
                  await tx.execute(sql`set local lock_timeout = '100ms'`);
                  await tx
                    .update(link)
                    .set({ lifecycle: "archived" })
                    .where(eq(link.id, linkId));
                }),
              (error: unknown) =>
                error instanceof Error &&
                error.cause instanceof Error &&
                /lock timeout/.test(error.cause.message),
            );
            time += 300001;
            unlock();
            await blocker;
            const failure = await outcome;
            assert.ok(failure instanceof Error);
            assert.match(failure.message, /OPERATIONAL_INVALID_CLAIM/);
            assert.deepEqual(await row(), before);
            assert.equal((await originals()).length, count);
          } finally {
            unlock();
            await blocker;
            await completion.catch(() => {});
            await admin.db.execute(
              sql.raw(`drop trigger ${triggerName} on audit_event`),
            );
            await admin.db.execute(sql.raw(`drop function ${functionName}()`));
          }
        },
      );
      await t.test(
        "actual InfraAgent HTTP and application poller persist passing, incident, outage and recovery with private originals",
        async () => {
          const requests: string[] = [];
          let status = "up",
            checkedAt = new Date(time - 1000).toISOString(),
            unavailable = false;
          const payload = () => ({
            success: true,
            monitor: {
              id: "monitor-rebound",
              status,
              enabled: true,
              lastCheckedAt: checkedAt,
              config: { token: "PRIVATE_HTTP_MONITOR_TOKEN" },
              target: "https://private.invalid/PRIVATE_TARGET",
            },
            recentChecks: [
              {
                checkedAt,
                status,
                responseTimeMs: status === "up" ? 10 : null,
                statusCode: status === "up" ? 200 : 503,
                error: status === "up" ? null : "PRIVATE_PROVIDER_ERROR",
              },
            ],
            openIncident:
              status === "down"
                ? {
                    id: "upstream-incident-123",
                    startedAt: checkedAt,
                    acknowledgedAt: null,
                    cause: "PRIVATE_CAUSE",
                  }
                : null,
          });
          const server = createServer((request, response) => {
            requests.push(request.method + " " + request.url);
            assert.equal(
              request.headers.authorization,
              "Bearer synthetic_read_only_token",
            );
            response.writeHead(unavailable ? 503 : 200, {
              "content-type": "application/json",
            });
            response.end(
              unavailable ? "PRIVATE_FAILURE_BODY" : JSON.stringify(payload()),
            );
          });
          await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
          );
          const address = server.address();
          assert.ok(address && typeof address !== "string");
          const reader = createInfraAgentAvailabilityReader({
            baseUrl: `http://127.0.0.1:${address.port}`,
            apiKey: "synthetic_read_only_token",
            allowLoopbackForTests: true,
            now,
          });
          const poll = createOperationalObservationPoller(repo, reader, {
            now,
          });
          const pollDue = async () => {
            time += 301000;
            checkedAt = new Date(time - 1000).toISOString();
            await runtime.db
              .update(source)
              .set({ nextAttemptAt: now() })
              .where(eq(source.id, sourceId));
            assert.equal(await poll.pollNext(), true);
          };
          try {
            await pollDue();
            assert.equal(
              ((await row()).snapshot!.signals as { state: string }[])[0]!
                .state,
              "passing",
            );
            status = "down";
            await pollDue();
            const failed = await row();
            assert.equal(
              (failed.snapshot!.signals as { incidentId: string }[])[0]!
                .incidentId,
              "upstream-incident-123",
            );
            assert.equal(failed.snapshot!.observedAt, checkedAt);
            const count = (await originals()).length;
            unavailable = true;
            await pollDue();
            assert.equal((await row()).lastError, "OPERATIONAL_UNAVAILABLE");
            assert.deepEqual((await row()).snapshot, failed.snapshot);
            assert.equal((await originals()).length, count);
            unavailable = false;
            status = "up";
            await pollDue();
            const recovered = await row();
            assert.equal(recovered.lastError, null);
            assert.equal(
              (recovered.snapshot!.signals as { state: string }[])[0]!.state,
              "passing",
            );
            const raw = (await originals()).find(
              (item) => item.observedAt?.toISOString() === checkedAt,
            )!;
            assert.deepEqual(cipher.open(raw.rawPayload), payload());
            assert.equal(
              JSON.stringify(raw.rawPayload).includes("PRIVATE"),
              false,
            );
            assert.deepEqual(
              requests,
              Array(4).fill("GET /api/v1/monitors/monitor-rebound"),
            );
          } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            );
          }
        },
      );
      await t.test(
        "actual HTTP future/no-signal -> null unknown -> current actual recovers without a poisoned watermark, including legacy markers",
        async () => {
          time = Date.now();
          await management.review(owner, "source", {
            ...sourceInput,
            expectedVersion: (await row()).version,
            externalId: "monitor-future-control",
          });
          const currentAt = new Date(time - 1000).toISOString(),
            futureAt = new Date(time + 86400000).toISOString();
          let status = "up",
            checkedAt: string | null = futureAt;
          const payload = () => ({
            success: true,
            monitor: {
              id: "monitor-future-control",
              status,
              enabled: true,
              lastCheckedAt: checkedAt,
              config: { token: "PRIVATE_FUTURE_MONITOR" },
            },
            recentChecks:
              checkedAt === null
                ? []
                : [{ checkedAt, status, responseTimeMs: 10, statusCode: 200 }],
            openIncident: null,
          });
          const requests: string[] = [];
          const server = createServer((request, response) => {
            requests.push(request.method + " " + request.url);
            assert.equal(
              request.headers.authorization,
              "Bearer synthetic_future_read_only_token",
            );
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify(payload()));
          });
          await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
          );
          const address = server.address();
          assert.ok(address && typeof address !== "string");
          const reader = createInfraAgentAvailabilityReader({
            baseUrl: `http://127.0.0.1:${address.port}`,
            apiKey: "synthetic_future_read_only_token",
            allowLoopbackForTests: true,
            now,
          });
          const poll = createOperationalObservationPoller(repo, reader, {
            now,
          });
          const pollDue = async () => {
            await runtime.db
              .update(source)
              .set({ nextAttemptAt: now() })
              .where(eq(source.id, sourceId));
            assert.equal(await poll.pollNext(), true);
          };
          try {
            await pollDue();
            const futureSnapshot = (await row()).snapshot!;
            assert.equal(futureSnapshot.observedAt, futureAt);
            assert.deepEqual(futureSnapshot.signals, []);
            assert.equal(
              (futureSnapshot.details as { reason: string }).reason,
              "future",
            );
            status = "unknown";
            checkedAt = null;
            await pollDue();
            const unknownSnapshot = (await row()).snapshot!;
            assert.equal(unknownSnapshot.observedAt, null);
            status = "up";
            checkedAt = currentAt;
            await pollDue();
            const recovered = (await row()).snapshot!;
            assert.equal(
              recovered.observedAt,
              currentAt,
              "a legitimate current check must recover after future and null coverage",
            );
            assert.equal(
              (recovered.signals as { state: string }[])[0]!.state,
              "passing",
            );
            assert.equal(recovered.latestAcceptedObservedAt, currentAt);
            assert.equal(
              futureSnapshot.latestAcceptedObservedAt,
              null,
              "unqualified future time must never become the accepted ordering watermark",
            );
            const historyCount = (await originals()).length,
              auditCount = (await audits()).length;
            // Reproduce the old persisted poisoned-marker shape after null coverage.
            await admin.db
              .update(source)
              .set({
                snapshot: {
                  ...unknownSnapshot,
                  latestAcceptedObservedAt: futureAt,
                },
              })
              .where(eq(source.id, sourceId));
            await pollDue();
            assert.deepEqual(
              (await row()).snapshot,
              recovered,
              "an old future marker beyond its receipt time must not prevent recovery",
            );
            assert.equal((await originals()).length, historyCount);
            assert.equal((await audits()).length, auditCount);
            const futureOriginal = (await originals()).find(
              (item) => item.observedAt?.toISOString() === futureAt,
            )!;
            assert.ok(futureOriginal);
            assert.equal(futureOriginal.signals.length, 0);
            assert.equal(
              (
                cipher.open(futureOriginal.rawPayload) as {
                  monitor: { lastCheckedAt: string };
                }
              ).monitor.lastCheckedAt,
              futureAt,
            );
            assert.deepEqual(
              requests,
              Array(4).fill("GET /api/v1/monitors/monitor-future-control"),
            );
          } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            );
          }
        },
      );
      await t.test(
        "actual authorized read service keeps a second current failing source visible without original secrets",
        async () => {
          // Read-service freshness uses the wall clock; prior retry tests advanced the fixture clock.
          time = Date.now();
          const secondId = randomUUID();
          await management.review(owner, "source", {
            ...sourceInput,
            id: secondId,
            externalId: "second-monitor",
          });
          await runtime.db
            .update(source)
            .set({ nextAttemptAt: now() })
            .where(eq(source.id, secondId));
          const claim = await repo.claim();
          assert.ok(claim);
          assert.equal(claim.id, secondId);
          await repo.complete(claim, observation(claim));
          const issuer = createFoundationOwnerService(
            createFoundationAccessRepository(runtime.db),
            owner,
            { environment: "test" },
          );
          const client = await issuer.createClient(
            {
              name: "Operational reader",
              projectId,
              environment: "test",
              ttlSeconds: 300,
              operations: ["observatory.read", "observatory.signals.read"],
            },
            randomUUID(),
          );
          const read = createObservatoryReadService(
            createObservatoryMachineReadRepository(
              runtime.db,
              "observatory.read",
            ),
            { environment: "test" },
          );
          const result = await read.scene(
            {
              operation: "observatory.read",
              projectId,
              environment: "test",
              targetId: null,
              correlationId: randomUUID(),
              tokenDigest: foundationTokenDigest(client.token),
            },
            { projectId },
          );
          assert.equal(result.scene.summary.availability.failing, 1);
          const body = JSON.stringify(result);
          for (const secret of ["PRIVATE", "ciphertext", "nonce", "rawPayload"])
            assert.equal(body.includes(secret), false);
        },
      );
    } finally {
      await runtime.close();
      await admin.close();
    }
  },
);

function inArrayIds(ids: string[]) {
  return sql`${source.id} in (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`,`,
  )})`;
}
