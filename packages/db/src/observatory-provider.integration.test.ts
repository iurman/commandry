import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import type {
  ProviderNotice,
  ProviderStatusRead,
  ProviderStatusSnapshot,
} from "@commandry/application";
import { createDatabase } from "./client";
import { createObservatoryProviderRepository } from "./observatory-provider-repository";
import {
  observatoryProviderEnvelope as envelope,
  observatoryProviderFeed as feed,
  observatoryProviderHistory as history,
  observatoryProviderNotice as notice,
} from "./observatory-provider-schema";
import { resource } from "./schema";

const adminUrl = process.env.COMMANDRY_TEST_DATABASE_URL;
const runtimePassword = process.env.COMMANDRY_TEST_RUNTIME_PASSWORD;
if (!adminUrl || !runtimePassword)
  throw new Error("Use the disposable PostgreSQL harness");
const runtimeUrl = new URL(adminUrl);
runtimeUrl.username = "commandry_app_integration";
runtimeUrl.password = runtimePassword;

test(
  "public provider evidence preserves originals, leases, identity, history, failures and complete reconciliation",
  { timeout: 120_000 },
  async (t) => {
    const admin = createDatabase({ connectionString: adminUrl, max: 3 });
    const runtime = createDatabase({
      connectionString: runtimeUrl.toString(),
      max: 4,
    });
    let time = Date.now() + 1000;
    const now = () => new Date(time);
    const repo = () =>
      createObservatoryProviderRepository(runtime.db, {
        now,
        jitterSeconds: () => 0,
      });
    const poll = repo();
    // Earlier integration scenarios retain immutable provider history in this DB.
    // Traverse every page so an inactive earlier notice cannot hide this fixture.
    const readComplete = async (reader = poll) => {
      const notices: Awaited<ReturnType<typeof reader.read>>["notices"] = [];
      const cursors = new Set<string>();
      let first: Awaited<ReturnType<typeof reader.read>> | undefined;
      let cursor: string | undefined;
      do {
        const page = await reader.read({
          limit: 100,
          ...(cursor ? { afterId: cursor } : {}),
        });
        first ??= page;
        notices.push(...page.notices);
        cursor = page.nextCursor ?? undefined;
        if (cursor) {
          assert.equal(
            cursors.has(cursor),
            false,
            "Provider cursor must advance",
          );
          cursors.add(cursor);
        }
      } while (cursor);
      assert.equal(new Set(notices.map((row) => row.id)).size, notices.length);
      return { ...first!, notices, nextCursor: null };
    };
    const id = `incident-${crypto.randomUUID()}`;
    const record = (updatedAt = now().toISOString()): ProviderNotice => ({
      id,
      kind: "incident",
      title: "Workers incident",
      status: "investigating",
      severity: "major",
      componentIds: ["workers"],
      createdAt: updatedAt,
      updatedAt,
      resolvedAt: null,
      scheduledFor: null,
      scheduledUntil: null,
      evidenceHref: `https://www.cloudflarestatus.com/incidents/${id}`,
      updates: [
        {
          id: "update1",
          status: "investigating",
          body: "Literal <script>untrusted</script> source",
          occurredAt: updatedAt,
        },
      ],
    });
    const snapshot = (
      notices: ProviderNotice[],
      reportedAt = now().toISOString(),
    ): ProviderStatusSnapshot => ({
      provider: "cloudflare",
      endpoint: "https://www.cloudflarestatus.com/api/v2/summary.json",
      complete: true,
      readAt: now().toISOString(),
      reportedAt,
      components: [
        {
          id: "workers",
          name: "Workers",
          status: "degraded_performance",
          groupId: null,
        },
      ],
      notices,
    });
    const result = (source: ProviderStatusSnapshot): ProviderStatusRead => ({
      snapshot: source,
      rawPayload: {
        originalProviderField: "Preserve exact source extras",
        ...source,
      },
      notModified: false,
      etag: '"provider-v1"',
      retrySeconds: 120,
    });
    const due = async () => {
      time += 121_000;
      await runtime.db
        .update(feed)
        .set({ nextAttemptAt: now() })
        .where(eq(feed.id, "cloudflare"));
      const claim = await poll.claim();
      assert.ok(claim);
      return claim;
    };
    const stableRecord = record();
    try {
      await runtime.db
        .update(feed)
        .set({
          nextAttemptAt: now(),
          lastSuccessAt: null,
          lastError: null,
          snapshot: null,
          leaseId: null,
          leaseUntil: null,
        })
        .where(eq(feed.id, "cloudflare"));
      await t.test(
        "only one concurrent poller claims the endpoint, independently of viewer count",
        async () => {
          const claims = await Promise.all(
            Array.from({ length: 20 }, () => repo().claim()),
          );
          assert.equal(claims.filter(Boolean).length, 1);
          await poll.complete(
            claims.find(Boolean)!,
            result(snapshot([stableRecord])),
          );
          const read = await readComplete(repo());
          assert.equal(read.state, "current");
          assert.equal(read.notices.filter((row) => row.id === id).length, 1);
          const [raw] = await runtime.db
            .select()
            .from(envelope)
            .where(
              sql`${envelope.rawPayload}->'notices' @> ${JSON.stringify([{ id }])}::jsonb`,
            );
          assert.equal(
            raw?.rawPayload.originalProviderField,
            "Preserve exact source extras",
          );
        },
      );
      await t.test(
        "duplicate delivery and repository restart keep notice, update and structural revision identities",
        async () => {
          const before = await readComplete();
          const claim = await due();
          await repo().complete(claim, result(snapshot([stableRecord])));
          const after = await readComplete(repo());
          assert.equal(after.revision, before.revision);
          const updates = await runtime.db
            .select()
            .from(history)
            .where(eq(history.noticeId, id));
          assert.equal(updates.length, 1);
          const notices = await runtime.db
            .select()
            .from(notice)
            .where(eq(notice.id, id));
          assert.equal(notices.length, 1);
        },
      );
      await t.test(
        "out-of-order source snapshots cannot resolve or regress current incidents",
        async () => {
          const previous = await readComplete();
          const claim = await due();
          await poll.complete(
            claim,
            result(snapshot([], "2020-01-01T00:00:00Z")),
          );
          const after = await readComplete();
          assert.equal(after.revision, previous.revision);
          assert.equal(after.lastError, "PROVIDER_OUT_OF_ORDER");
          assert.equal(
            after.notices.find((row) => row.id === id)?.active,
            true,
          );
        },
      );
      await t.test(
        "failed reads retain last-known notices and source timestamps, then honor retry delay",
        async () => {
          const before = await readComplete();
          const claim = await due();
          await poll.fail(claim, "PROVIDER_RATE_LIMITED", 600);
          const after = await readComplete();
          assert.equal(after.state, "unavailable");
          assert.equal(after.lastSuccessAt, before.lastSuccessAt);
          assert.equal(
            after.notices.find((row) => row.id === id)?.active,
            true,
          );
          assert.equal(await poll.claim(), null);
          const [source] = await runtime.db
            .select()
            .from(feed)
            .where(eq(feed.id, "cloudflare"));
          assert.equal(source?.nextAttemptAt.getTime(), time + 600_000);
        },
      );
      await t.test(
        "expired leases cannot commit after a replacement claimant",
        async () => {
          const expired = await due();
          time += 31_000;
          const current = await poll.claim();
          assert.ok(current);
          await poll.complete(expired, result(snapshot([])));
          assert.equal(
            (await readComplete()).notices.find((row) => row.id === id)?.active,
            true,
          );
          await poll.complete(current, result(snapshot([stableRecord])));
        },
      );
      await t.test(
        "only a successful complete snapshot clears current exposure and preserves literal source history",
        async () => {
          const claim = await due();
          await poll.complete(claim, result(snapshot([])));
          const current = await readComplete();
          const old = current.notices.find((row) => row.id === id);
          assert.equal(old?.active, false);
          assert.ok(old?.reconciledAt);
          assert.equal(old.record.status, "investigating");
          await assert.rejects(
            runtime.db
              .update(history)
              .set({
                record: {
                  id: "update1",
                  status: "resolved",
                  body: "overwrite",
                  occurredAt: now().toISOString(),
                },
              })
              .where(eq(history.noticeId, id)),
            (error: unknown) =>
              error instanceof Error &&
              error.cause instanceof Error &&
              error.cause.message === "Provider source history is immutable",
          );
          const [raw] = await runtime.db
            .select()
            .from(envelope)
            .where(
              sql`${envelope.rawPayload}->'notices' @> ${JSON.stringify([{ id }])}::jsonb`,
            );
          assert.ok(raw);
          await assert.rejects(
            runtime.db.delete(envelope).where(eq(envelope.id, raw.id)),
            (error: unknown) =>
              error instanceof Error &&
              error.cause instanceof Error &&
              error.cause.message === "Provider source history is immutable",
          );
        },
      );
      await t.test(
        "source freshness is independent of unchanged observation timestamps and disabled coverage",
        async () => {
          const claim = await due();
          await poll.complete(claim, {
            snapshot: null,
            notModified: true,
            etag: claim.etag,
            retrySeconds: 120,
          });
          const before = await readComplete();
          assert.equal(before.state, "current");
          time += 601_000;
          assert.equal((await readComplete()).state, "stale");
          await runtime.db
            .update(feed)
            .set({ enabled: false })
            .where(eq(feed.id, "cloudflare"));
          assert.equal((await readComplete()).state, "disabled");
          assert.equal(await poll.claim(), null);
          await runtime.db
            .update(feed)
            .set({ enabled: true })
            .where(eq(feed.id, "cloudflare"));
        },
      );
      await t.test(
        "every notice remains reachable by bounded continuation",
        async () => {
          const many = Array.from({ length: 137 }, (_, index) => ({
            ...stableRecord,
            id: `notice-${String(index).padStart(3, "0")}`,
            updates: [],
          }));
          const claim = await due();
          await poll.complete(claim, result(snapshot(many)));
          const ids: string[] = [];
          let cursor: string | undefined;
          do {
            const page = await poll.read({
              limit: 17,
              activeOnly: true,
              ...(cursor ? { afterId: cursor } : {}),
            });
            ids.push(...page.notices.map((row) => row.id));
            cursor = page.nextCursor ?? undefined;
          } while (cursor);
          assert.deepEqual(
            ids,
            many.map((row) => row.id),
          );
        },
      );
      await t.test(
        "repeat additive migration preserves canonical inventory and source data",
        async () => {
          const resourceId = crypto.randomUUID();
          await runtime.db.insert(resource).values({
            id: resourceId,
            kind: "host",
            name: "Preserved existing inventory",
          });
          const migration = await readFile(
            "packages/db/migrations/0068_observatory_provider_status.sql",
            "utf8",
          );
          await admin.db.execute(sql.raw(migration));
          await admin.db.execute(sql.raw(migration));
          assert.equal(
            (
              await runtime.db
                .select()
                .from(resource)
                .where(eq(resource.id, resourceId))
            ).length,
            1,
          );
          assert.equal(
            (
              await runtime.db
                .select()
                .from(notice)
                .where(
                  and(
                    eq(notice.providerId, "cloudflare"),
                    eq(notice.active, true),
                  ),
                )
            ).length,
            137,
          );
        },
      );
    } finally {
      await runtime.close();
      await admin.close();
    }
  },
);
