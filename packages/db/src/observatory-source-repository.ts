import { randomInt, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  createOperationalObservationPoller,
  OperationalSourceError,
  boundedOperationalRetrySeconds,
  validateOperationalSourceClaim,
  type OperationalObservation,
  type OperationalSourceClaim,
  type OperationalSourcePort,
} from "@commandry/application";
import { foundationDigest } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  observatorySource as source,
  observatoryObservation as history,
} from "./observatory-schema";
import {
  auditEvent,
  project,
  projectResourceLink as link,
  resource,
} from "./schema";

type Source = typeof source.$inferSelect;
type Transaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];

export function createObservatorySourceRepository(
  db: CommandryDatabase,
  options: {
    kinds: OperationalSourceClaim["kind"][];
    sealOriginal: (
      value: unknown,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>;
    now?: () => Date;
    jitterSeconds?: () => number;
  },
): OperationalSourcePort {
  const now = options.now ?? (() => new Date());
  const kinds = [...new Set(options.kinds)];
  const nextAt = (seconds: number) => {
    const jitter = (options.jitterSeconds ?? (() => randomInt(0, 21)))();
    return new Date(
      now().getTime() +
        boundedOperationalRetrySeconds(
          seconds +
            (Number.isFinite(jitter) ? Math.max(0, Math.min(20, jitter)) : 0),
        ) *
          1000,
    );
  };
  // Both canonical link directions express the same explicit project/resource binding.
  const binding = and(
    eq(link.projectId, source.projectId),
    eq(link.resourceId, source.resourceId),
    eq(link.lifecycle, "active"),
  );
  async function lockBinding(tx: Transaction, row: Source): Promise<boolean> {
    if (!row.projectId) return false;
    const [target] = await tx
      .select()
      .from(resource)
      .where(eq(resource.id, row.resourceId))
      .for("share");
    if (
      !target ||
      (row.kind === "github-repository"
        ? target.kind !== "repository"
        : row.kind === "http-readiness"
          ? !["service", "deployment"].includes(target.kind)
          : row.kind !== "infraagent-monitor" ||
            !["host", "service", "deployment"].includes(target.kind))
    )
      return false;
    const [owner] = await tx
      .select({ id: project.id })
      .from(project)
      .where(eq(project.id, row.projectId))
      .for("share");
    if (!owner) return false;
    const links = await tx
      .select({ id: link.id })
      .from(link)
      .where(
        and(
          eq(link.projectId, row.projectId),
          eq(link.resourceId, row.resourceId),
          eq(link.lifecycle, "active"),
        ),
      )
      .for("share");
    return links.length > 0;
  }
  function live(
    row: Source | undefined,
    claim: OperationalSourceClaim,
  ): row is Source {
    return (
      !!row &&
      row.enabled &&
      kinds.includes(claim.kind) &&
      row.leaseId === claim.leaseId &&
      !!row.leaseUntil &&
      row.leaseUntil > now() &&
      row.id === claim.id &&
      row.resourceId === claim.resourceId &&
      row.kind === claim.kind &&
      row.externalId === claim.externalId &&
      row.environment === claim.environment &&
      row.freshnessSeconds === claim.freshnessSeconds
    );
  }
  function recheck(row: Source) {
    if (!row.leaseUntil || row.leaseUntil <= now())
      throw new OperationalSourceError("OPERATIONAL_INVALID_CLAIM");
  }
  return {
    async claim() {
      if (!kinds.length) return null;
      return db.transaction(async (tx) => {
        const time = now();
        const [row] = await tx
          .select()
          .from(source)
          .where(
            and(
              inArray(source.kind, kinds),
              eq(source.enabled, true),
              sql`${source.projectId} is not null`,
              sql`${source.nextAttemptAt} <= ${time}`,
              sql`(${source.leaseUntil} is null or ${source.leaseUntil} <= ${time})`,
              sql`exists (select 1 from ${link} where ${binding})`,
              sql`exists (select 1 from ${resource} where ${resource.id} = ${source.resourceId} and ((${source.kind} = 'github-repository' and ${resource.kind} = 'repository') or (${source.kind} = 'infraagent-monitor' and ${resource.kind} in ('host','service','deployment')) or (${source.kind} = 'http-readiness' and ${resource.kind} in ('service','deployment'))))`,
            ),
          )
          .orderBy(asc(source.nextAttemptAt), asc(source.id))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!row || !(await lockBinding(tx, row))) return null;
        const leaseId = randomUUID();
        const claim = validateOperationalSourceClaim({
          id: row.id,
          leaseId,
          resourceId: row.resourceId,
          kind: row.kind as OperationalSourceClaim["kind"],
          externalId: row.externalId,
          environment: row.environment,
          freshnessSeconds: row.freshnessSeconds,
        });
        await tx
          .update(source)
          .set({
            leaseId,
            leaseUntil: new Date(time.getTime() + 300000),
            lastAttemptAt: time,
          })
          .where(eq(source.id, row.id));
        return claim;
      });
    },
    async complete(rawClaim, rawObservation) {
      const claim = validateOperationalSourceClaim(rawClaim);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(source)
          .where(eq(source.id, claim.id))
          .for("update");
        if (!live(row, claim) || !(await lockBinding(tx, row))) return;
        let accepted: OperationalObservation | undefined;
        // Reuse the application boundary's complete observation validation and clone.
        await createOperationalObservationPoller(
          {
            claim: async () => claim,
            complete: async (_claim, observation) => {
              accepted = observation;
            },
            fail: async (_claim, code, retry) => {
              throw new OperationalSourceError(
                code as OperationalSourceError["code"],
                retry,
              );
            },
          },
          async () => rawObservation,
          { now },
        ).pollNext();
        const observation = accepted!;
        const digest = foundationDigest({
          projectId: row.projectId,
          sourceVersion: row.version,
          kind: row.kind,
          externalId: row.externalId,
          environment: row.environment,
          freshnessSeconds: row.freshnessSeconds,
          ...observation,
        });
        const [existing] = await tx
          .select({ digest: history.contentDigest })
          .from(history)
          .where(
            and(
              eq(history.sourceId, row.id),
              eq(history.contentDigest, digest),
            ),
          );
        let snapshot = row.snapshot;
        if (!existing) {
          const encrypted = await options.sealOriginal(observation.rawPayload);
          if (
            !encrypted ||
            typeof encrypted !== "object" ||
            Array.isArray(encrypted) ||
            !Object.keys(encrypted).length
          )
            throw new Error("Operational original sealing failed");
          recheck(row);
          await tx.insert(history).values({
            sourceId: row.id,
            contentDigest: digest,
            receivedAt: now(),
            observedAt:
              observation.observedAt === null
                ? null
                : new Date(observation.observedAt),
            projectId: row.projectId,
            resourceId: row.resourceId,
            sourceVersion: row.version,
            details: observation.details,
            signals: observation.signals,
            rawPayload: encrypted,
          });
          await tx.insert(auditEvent).values({
            id: randomUUID(),
            actor: "system:operational-source",
            operation: "observatory.source.observed",
            details: {
              sourceId: row.id,
              projectId: row.projectId,
              resourceId: row.resourceId,
              digest,
            },
          });
        }
        // Current coverage can recur even when its literal original already exists.
        // Historical deduplication controls only sealing, append and audit above.
        const priorSignals = Array.isArray(row.snapshot?.signals)
          ? row.snapshot.signals
          : [];
        const priorTimes = [
          row.snapshot?.latestAcceptedObservedAt,
          row.snapshot?.observedAt,
        ];
        // A legacy future marker is not qualified merely because it was persisted.
        // Accepted source times must have been possible at their successful receipt.
        const previousReceipt = row.lastSuccessAt?.getTime() ?? now().getTime();
        const qualifiedPreviousTime = (value: unknown) => {
          const at = typeof value === "string" ? Date.parse(value) : NaN;
          return Number.isFinite(at) && at <= previousReceipt ? at : -Infinity;
        };
        const priorBoundary = priorTimes.reduce<number>((maximum, value) => {
          return Math.max(maximum, qualifiedPreviousTime(value));
        }, -Infinity);
        const latest = priorSignals.reduce((maximum, signal) => {
          const at =
            signal && typeof signal === "object" && "observedAt" in signal
              ? qualifiedPreviousTime(signal.observedAt)
              : -Infinity;
          return Math.max(maximum, at);
        }, priorBoundary);
        const incomingTime =
          observation.observedAt === null
            ? null
            : Date.parse(observation.observedAt);
        const futureCoverage =
          observation.signals.length === 0 &&
          incomingTime !== null &&
          (incomingTime > now().getTime() ||
            observation.details.reason === "future");
        const newActualOrCoverage =
          incomingTime !== null &&
          incomingTime <= now().getTime() &&
          (incomingTime > latest || (!existing && incomingTime === latest));
        // A current leased read can report paused/pending/unknown while retaining
        // an old last-check time. That time orders checks, not current coverage.
        if (observation.signals.length === 0 || newActualOrCoverage) {
          const acceptedTime =
            incomingTime === null || futureCoverage
              ? latest
              : Math.max(latest, incomingTime);
          snapshot = {
            observedAt: observation.observedAt,
            // This source-time watermark survives null coverage; it is never fetch time.
            latestAcceptedObservedAt: Number.isFinite(acceptedTime)
              ? new Date(acceptedTime).toISOString()
              : null,
            details: observation.details,
            signals: observation.signals.length
              ? observation.signals
              : priorSignals,
          };
        }
        recheck(row);
        await tx
          .update(source)
          .set({
            snapshot,
            lastSuccessAt: now(),
            lastError: null,
            failures: 0,
            nextAttemptAt: nextAt(row.freshnessSeconds),
            leaseId: null,
            leaseUntil: null,
          })
          .where(eq(source.id, row.id));
        recheck(row);
      });
    },
    async fail(rawClaim, code, retrySeconds) {
      const claim = validateOperationalSourceClaim(rawClaim);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(source)
          .where(eq(source.id, claim.id))
          .for("update");
        if (!live(row, claim) || !(await lockBinding(tx, row))) return;
        const safe = new OperationalSourceError(
          code as OperationalSourceError["code"],
          retrySeconds,
        );
        const delay = Math.max(
          safe.retrySeconds,
          Math.min(86400, 60 * 2 ** Math.min(11, row.failures)),
        );
        await tx
          .update(source)
          .set({
            failures: row.failures + 1,
            lastError: safe.code,
            nextAttemptAt: nextAt(delay),
            leaseId: null,
            leaseUntil: null,
          })
          .where(eq(source.id, row.id));
        recheck(row);
      });
    },
  };
}
