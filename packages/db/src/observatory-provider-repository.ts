import { createHash, randomInt, randomUUID } from "node:crypto";
import { foundationDigest } from "@commandry/domain";
import { and, asc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import type {
  ProviderPollClaim,
  ProviderStatusPort,
  ProviderStatusRead,
} from "@commandry/application";
import type { CommandryDatabase } from "./client";
import {
  observatoryProviderFeed as feed,
  observatoryProviderHistory as history,
  observatoryProviderEnvelope as envelope,
  observatoryProviderNotice as notice,
} from "./observatory-provider-schema";

export function createObservatoryProviderRepository(
  db: CommandryDatabase,
  options: { now?: () => Date; jitterSeconds?: () => number } = {},
): ProviderStatusPort & {
  read(input?: {
    afterId?: string;
    limit?: number;
    activeOnly?: boolean;
  }): Promise<{
    state: "unknown" | "disabled" | "unavailable" | "stale" | "current";
    lastSuccessAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
    revision: number;
    snapshot: (typeof feed.$inferSelect)["snapshot"];
    notices: (typeof notice.$inferSelect)[];
    nextCursor: string | null;
  }>;
} {
  const now = options.now ?? (() => new Date());
  const jitter = options.jitterSeconds ?? (() => randomInt(0, 21));
  const nextAt = (seconds: number) =>
    new Date(
      now().getTime() +
        (Math.max(120, Math.min(86400, seconds)) +
          Math.max(0, Math.min(20, jitter()))) *
          1000,
    );
  const same = (a: unknown, b: unknown) =>
    foundationDigest(a ?? null) === foundationDigest(b ?? null);
  return {
    async claim() {
      const time = now();
      const leaseId = randomUUID();
      const rows = await db
        .update(feed)
        .set({
          leaseId,
          leaseUntil: new Date(time.getTime() + 30_000),
          lastAttemptAt: time,
        })
        .where(
          and(
            eq(feed.id, "cloudflare"),
            eq(feed.enabled, true),
            sql`${feed.nextAttemptAt} <= ${time}`,
            sql`(${feed.leaseUntil} is null or ${feed.leaseUntil} <= ${time})`,
          ),
        )
        .returning({ etag: feed.etag });
      return rows[0] ? { leaseId, etag: rows[0].etag } : null;
    },
    async complete(claim: ProviderPollClaim, result: ProviderStatusRead) {
      await db.transaction(async (tx) => {
        const [source] = await tx
          .select()
          .from(feed)
          .where(eq(feed.id, "cloudflare"))
          .for("update");
        const time = now();
        if (
          !source?.enabled ||
          source.leaseId !== claim.leaseId ||
          !source.leaseUntil ||
          source.leaseUntil <= time
        )
          return;
        if (result.notModified) {
          if (
            !source.snapshot ||
            !claim.etag ||
            claim.etag !== source.etag ||
            result.snapshot !== null
          )
            throw new Error("Invalid conditional provider response");
          await tx
            .update(feed)
            .set({
              lastSuccessAt: time,
              lastError: null,
              failures: 0,
              nextAttemptAt: nextAt(result.retrySeconds),
              leaseId: null,
              leaseUntil: null,
            })
            .where(eq(feed.id, source.id));
          return;
        }
        const snapshot = result.snapshot;
        if (
          !snapshot?.complete ||
          snapshot.provider !== "cloudflare" ||
          snapshot.endpoint !==
            "https://www.cloudflarestatus.com/api/v2/summary.json" ||
          !Number.isFinite(Date.parse(snapshot.reportedAt))
        )
          throw new Error("Incomplete provider snapshot");
        if (
          !result.rawPayload ||
          typeof result.rawPayload !== "object" ||
          Array.isArray(result.rawPayload)
        )
          throw new Error("Original provider source required");
        const rawPayload = result.rawPayload as Record<string, unknown>;
        const contentDigest = createHash("sha256")
          .update(JSON.stringify(rawPayload))
          .digest("hex");
        await tx
          .insert(envelope)
          .values({
            id: randomUUID(),
            providerId: source.id,
            contentDigest,
            rawPayload,
            receivedAt: time,
          })
          .onConflictDoNothing();
        // Source clocks fence complete reconciliation; a delayed response cannot close newer notices.
        if (
          source.snapshot &&
          Date.parse(snapshot.reportedAt) <
            Date.parse(source.snapshot.reportedAt)
        ) {
          await tx
            .update(feed)
            .set({
              lastSuccessAt: time,
              lastError: "PROVIDER_OUT_OF_ORDER",
              nextAttemptAt: nextAt(result.retrySeconds),
              leaseId: null,
              leaseUntil: null,
            })
            .where(eq(feed.id, source.id));
          return;
        }
        const current = await tx
          .select()
          .from(notice)
          .where(eq(notice.providerId, source.id));
        const previous = new Map(current.map((row) => [row.id, row]));
        let changed = !same(source.snapshot?.components, snapshot.components);
        for (const record of snapshot.notices) {
          const old = previous.get(record.id);
          if (
            old &&
            Date.parse(record.updatedAt) < old.sourceUpdatedAt.getTime()
          )
            continue;
          const active = !["resolved", "postmortem", "completed"].includes(
            record.status,
          );
          if (!old || !same(old.record, record) || old.active !== active)
            changed = true;
          await tx
            .insert(notice)
            .values({
              providerId: source.id,
              id: record.id,
              record,
              sourceUpdatedAt: new Date(record.updatedAt),
              active,
              reconciledAt: null,
              lastSeenAt: time,
            })
            .onConflictDoUpdate({
              target: [notice.providerId, notice.id],
              set: {
                record,
                sourceUpdatedAt: new Date(record.updatedAt),
                active,
                reconciledAt: null,
                lastSeenAt: time,
              },
            });
          for (const update of record.updates) {
            const digest = createHash("sha256")
              .update(JSON.stringify(update))
              .digest("hex");
            await tx
              .insert(history)
              .values({
                providerId: source.id,
                noticeId: record.id,
                updateId: update.id,
                contentDigest: digest,
                record: update,
                observedAt: time,
              })
              .onConflictDoNothing();
          }
        }
        const ids = snapshot.notices.map((record) => record.id);
        const absent = current.filter(
          (record) => record.active && !ids.includes(record.id),
        );
        if (absent.length) {
          changed = true;
          // Absence in a complete unresolved snapshot ends current exposure, while
          // preserving the provider's last literal status and original update times.
          await tx
            .update(notice)
            .set({ active: false, reconciledAt: time })
            .where(
              and(
                eq(notice.providerId, source.id),
                ids.length
                  ? notInArray(notice.id, ids)
                  : inArray(
                      notice.id,
                      absent.map((record) => record.id),
                    ),
              ),
            );
        }
        await tx
          .update(feed)
          .set({
            snapshot,
            etag: result.etag,
            revision: source.revision + Number(changed),
            lastSuccessAt: time,
            lastError: null,
            failures: 0,
            nextAttemptAt: nextAt(result.retrySeconds),
            leaseId: null,
            leaseUntil: null,
          })
          .where(eq(feed.id, source.id));
      });
    },
    async fail(claim, code, retrySeconds) {
      await db.transaction(async (tx) => {
        const [source] = await tx
          .select()
          .from(feed)
          .where(eq(feed.id, "cloudflare"))
          .for("update");
        const time = now();
        if (
          !source ||
          source.leaseId !== claim.leaseId ||
          !source.leaseUntil ||
          source.leaseUntil <= time
        )
          return;
        const delay = Math.max(
          retrySeconds,
          Math.min(3600, 120 * 2 ** Math.min(5, source.failures)),
        );
        await tx
          .update(feed)
          .set({
            failures: source.failures + 1,
            lastError: /^[A-Z_]{1,100}$/.test(code)
              ? code
              : "PROVIDER_UNAVAILABLE",
            nextAttemptAt: nextAt(delay),
            leaseId: null,
            leaseUntil: null,
          })
          .where(eq(feed.id, source.id));
      });
    },
    async read(input = {}) {
      const limit = input.limit ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error("Invalid provider page limit");
      return db.transaction(
        async (tx) => {
          const [source] = await tx
            .select()
            .from(feed)
            .where(eq(feed.id, "cloudflare"));
          const rows = source
            ? await tx
                .select()
                .from(notice)
                .where(
                  and(
                    eq(notice.providerId, source.id),
                    input.activeOnly ? eq(notice.active, true) : undefined,
                    input.afterId ? gt(notice.id, input.afterId) : undefined,
                  ),
                )
                .orderBy(asc(notice.id))
                .limit(limit + 1)
            : [];
          const items = rows.slice(0, limit);
          const age = source?.lastSuccessAt
            ? now().getTime() - source.lastSuccessAt.getTime()
            : null;
          const state = !source
            ? "unknown"
            : !source.enabled
              ? "disabled"
              : source.lastError
                ? "unavailable"
                : age === null
                  ? "unknown"
                  : age < 0 || age > 600_000
                    ? "stale"
                    : "current";
          return {
            state,
            lastSuccessAt: source?.lastSuccessAt?.toISOString() ?? null,
            lastAttemptAt: source?.lastAttemptAt?.toISOString() ?? null,
            lastError: source?.lastError ?? null,
            revision: source?.revision ?? 0,
            snapshot: source?.snapshot ?? null,
            notices: items,
            nextCursor: rows.length > limit ? items.at(-1)!.id : null,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
