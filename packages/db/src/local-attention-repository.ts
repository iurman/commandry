import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  LocalAttentionAuditEvent,
  LocalAttentionSettings,
  LocalAttentionSignal,
  SubmitLocalAttentionReviewRequest,
  UpdateLocalAttentionSettingsRequest,
} from "@commandry/contracts";
import { localAttentionReviewSchema } from "@commandry/contracts";
import {
  LOCAL_ATTENTION_DEFAULTS,
  LocalAttentionError,
  type DesiredLocalAttentionSignal,
  type MetricPair,
  type SourceObservation,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  integrationInstance,
  localAttentionAudit,
  localAttentionSetting,
  localAttentionSignal,
  project,
  resource,
} from "./schema";

function settingsRecord(
  row: typeof localAttentionSetting.$inferSelect | undefined,
): LocalAttentionSettings {
  return {
    version: row?.version ?? 0,
    staleSourceEnabled:
      row?.staleSourceEnabled ?? LOCAL_ATTENTION_DEFAULTS.staleSourceEnabled,
    metricDropEnabled:
      row?.metricDropEnabled ?? LOCAL_ATTENTION_DEFAULTS.metricDropEnabled,
    metricDropPoints:
      row?.metricDropPoints ?? LOCAL_ATTENTION_DEFAULTS.metricDropPoints,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    sourceLabel: "Local attention rules",
  };
}

function signalRecord(
  row: {
    signal: typeof localAttentionSignal.$inferSelect;
    projectName: string;
    integrationName: string | null;
    resourceName: string | null;
  },
  reviewEvent?: typeof localAttentionAudit.$inferSelect,
): LocalAttentionSignal {
  const signal = row.signal;
  const review =
    reviewEvent?.details.evidenceId === signal.evidenceId
      ? localAttentionReviewSchema.parse({
          eventId: reviewEvent.id,
          evidenceId: signal.evidenceId,
          quality: reviewEvent.details.quality,
          disposition: reviewEvent.details.disposition,
          effectiveDisposition:
            reviewEvent.details.disposition === "snoozed" &&
            typeof reviewEvent.details.snoozedUntil === "string" &&
            new Date(reviewEvent.details.snoozedUntil).getTime() <= Date.now()
              ? "visible"
              : reviewEvent.details.disposition,
          snoozedUntil: reviewEvent.details.snoozedUntil,
          note: reviewEvent.details.note,
          reviewedAt: reviewEvent.createdAt.toISOString(),
          sourceLabel: "Local review of synthetic evidence",
        })
      : null;
  const prefix =
    signal.evidenceKind === "source_envelope"
      ? "/api/v1/source-envelopes/"
      : "/api/v1/metrics/";
  return {
    id: signal.id,
    key: signal.key,
    ruleId: signal.ruleId,
    state: signal.state,
    projectId: signal.projectId,
    projectName: row.projectName,
    integrationId: signal.integrationId,
    integrationName: row.integrationName,
    resourceId: signal.resourceId,
    resourceName: row.resourceName,
    evidenceId: signal.evidenceId,
    evidenceHref: `${prefix}${signal.evidenceId}`,
    previousEvidenceHref: signal.previousEvidenceId
      ? `${prefix}${signal.previousEvidenceId}`
      : null,
    reason: signal.reason,
    observedAt: signal.observedAt.toISOString(),
    previousObservedAt: signal.previousObservedAt?.toISOString() ?? null,
    previousValue: signal.previousValue,
    latestValue: signal.latestValue,
    threshold: signal.threshold,
    changedAt: signal.changedAt.toISOString(),
    evaluatedAt: signal.evaluatedAt.toISOString(),
    sourceLabel: "Synthetic local attention",
    isSynthetic: true,
    realHealth: "unknown",
    review,
  };
}

function auditRecord(
  row: typeof localAttentionAudit.$inferSelect,
): LocalAttentionAuditEvent {
  return {
    id: row.id,
    signalId: row.signalId,
    actor: row.actor,
    operation: row.operation,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createLocalAttentionRepository(db: CommandryDatabase) {
  async function latestReviews(signalIds: string[]) {
    if (signalIds.length === 0)
      return new Map<string, typeof localAttentionAudit.$inferSelect>();
    const rows = await db
      .selectDistinctOn([localAttentionAudit.signalId])
      .from(localAttentionAudit)
      .where(
        and(
          eq(localAttentionAudit.operation, "local_attention.reviewed"),
          inArray(localAttentionAudit.signalId, signalIds),
        ),
      )
      .orderBy(
        localAttentionAudit.signalId,
        desc(localAttentionAudit.createdAt),
        desc(localAttentionAudit.id),
      );
    return new Map(rows.map((row) => [row.signalId!, row]));
  }

  async function getSignalById(id: string) {
    const [row] = await db
      .select({
        signal: localAttentionSignal,
        projectName: project.name,
        integrationName: integrationInstance.name,
        resourceName: resource.name,
      })
      .from(localAttentionSignal)
      .innerJoin(project, eq(localAttentionSignal.projectId, project.id))
      .leftJoin(
        integrationInstance,
        eq(localAttentionSignal.integrationId, integrationInstance.id),
      )
      .leftJoin(resource, eq(localAttentionSignal.resourceId, resource.id))
      .where(eq(localAttentionSignal.id, id))
      .limit(1);
    if (!row) return null;
    const reviews = await latestReviews([id]);
    return signalRecord(row, reviews.get(id));
  }

  async function getSettings() {
    const [row] = await db
      .select()
      .from(localAttentionSetting)
      .where(eq(localAttentionSetting.id, "local"))
      .limit(1);
    return settingsRecord(row);
  }
  return {
    getSettings,
    async reviewSignal(
      signalId: string,
      input: SubmitLocalAttentionReviewRequest,
    ) {
      await db.transaction(async (tx) => {
        const [signal] = await tx
          .select()
          .from(localAttentionSignal)
          .where(eq(localAttentionSignal.id, signalId))
          .for("update")
          .limit(1);
        if (!signal)
          throw new LocalAttentionError(
            "SIGNAL_NOT_FOUND",
            "Attention signal not found",
          );
        const [latest] = await tx
          .select({
            id: localAttentionAudit.id,
            details: localAttentionAudit.details,
          })
          .from(localAttentionAudit)
          .where(
            and(
              eq(localAttentionAudit.signalId, signalId),
              eq(localAttentionAudit.operation, "local_attention.reviewed"),
            ),
          )
          .orderBy(
            desc(localAttentionAudit.createdAt),
            desc(localAttentionAudit.id),
          )
          .limit(1);
        if (
          signal.evidenceId !== input.expectedEvidenceId ||
          (latest?.details.evidenceId === signal.evidenceId
            ? latest.id
            : null) !== input.expectedReviewEventId
        )
          throw new LocalAttentionError(
            "SIGNAL_REVIEW_STALE",
            "Signal evidence or review changed; reload before saving",
          );
        await tx.insert(localAttentionAudit).values({
          id: crypto.randomUUID(),
          signalId,
          actor: "local-reviewer:unattributed",
          operation: "local_attention.reviewed",
          details: {
            evidenceId: signal.evidenceId,
            ruleId: signal.ruleId,
            quality: input.quality,
            disposition: input.disposition,
            snoozedUntil: input.snoozedUntil,
            note: input.note,
          },
        });
      });
      const saved = await getSignalById(signalId);
      if (!saved)
        throw new LocalAttentionError(
          "SIGNAL_NOT_FOUND",
          "Attention signal not found",
        );
      return saved;
    },
    async updateSettings(input: UpdateLocalAttentionSettingsRequest) {
      await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(localAttentionSetting)
          .where(eq(localAttentionSetting.id, "local"))
          .for("update")
          .limit(1);
        if ((current?.version ?? 0) !== input.expectedVersion)
          throw new LocalAttentionError(
            "SETTINGS_STALE",
            "Attention rules changed; reload before saving",
          );
        const values = {
          staleSourceEnabled: input.staleSourceEnabled,
          metricDropEnabled: input.metricDropEnabled,
          metricDropPoints: input.metricDropPoints,
          updatedAt: new Date(),
        };
        if (current) {
          await tx
            .update(localAttentionSetting)
            .set({ ...values, version: current.version + 1 })
            .where(eq(localAttentionSetting.id, "local"));
        } else {
          await tx
            .insert(localAttentionSetting)
            .values({ id: "local", version: 1, ...values });
        }
        await tx.insert(localAttentionAudit).values({
          id: crypto.randomUUID(),
          actor: "local-reviewer:unattributed",
          operation: "local_attention.rules_changed",
          details: {
            previousVersion: current?.version ?? 0,
            version: (current?.version ?? 0) + 1,
            staleSourceEnabled: input.staleSourceEnabled,
            metricDropEnabled: input.metricDropEnabled,
            metricDropPoints: input.metricDropPoints,
          },
        });
      });
      return getSettings();
    },
    async scanSources(): Promise<SourceObservation[]> {
      const rows = await db.execute<{
        integrationId: string;
        integrationName: string;
        projectId: string;
        projectName: string;
        resourceId: string | null;
        resourceName: string | null;
        windowMinutes: number;
        envelopeId: string | null;
        observedAt: Date | string | null;
      }>(sql`
        select i.id as "integrationId", i.name as "integrationName",
          i.project_id as "projectId", p.name as "projectName",
          i.resource_id as "resourceId", r.name as "resourceName",
          i.freshness_window_minutes as "windowMinutes",
          latest.id as "envelopeId", latest.occurred_at as "observedAt"
        from integration_instance i
        join project p on p.id = i.project_id
        left join resource r on r.id = i.resource_id
        left join lateral (
          select envelope.id, envelope.occurred_at
          from source_envelope envelope
          join synthetic_event_import imported on imported.id = envelope.import_id
          where imported.integration_instance_id = i.id
            and imported.state = 'succeeded'
          order by envelope.occurred_at desc, envelope.id desc
          limit 1
        ) latest on true
        where i.enabled = true
      `);
      return rows.rows.map((row) => ({
        ...row,
        observedAt: row.observedAt
          ? new Date(row.observedAt).toISOString()
          : null,
      }));
    },
    async scanMetricPairs(): Promise<MetricPair[]> {
      const rows = await db.execute<{
        projectId: string;
        projectName: string;
        resourceId: string;
        resourceName: string;
        latestId: string;
        latestAt: Date | string;
        latestValue: number;
        previousId: string | null;
        previousAt: Date | string | null;
        previousValue: number | null;
      }>(sql`
        with ranked as (
          select sample.id, sample.project_id, sample.resource_id,
            sample.sampled_at, sample.value,
            row_number() over (
              partition by sample.project_id, sample.resource_id
              order by sample.sampled_at desc, sample.id desc
            ) as ordinal
          from metric_sample sample
          where sample.name = 'external_availability'
            and sample.unit = 'percent'
            and sample.source_kind = 'synthetic-operations'
            and sample.is_synthetic = true
        )
        select latest.project_id as "projectId", p.name as "projectName",
          latest.resource_id as "resourceId", r.name as "resourceName",
          latest.id as "latestId", latest.sampled_at as "latestAt",
          latest.value as "latestValue", previous.id as "previousId",
          previous.sampled_at as "previousAt", previous.value as "previousValue"
        from ranked latest
        join project p on p.id = latest.project_id
        join resource r on r.id = latest.resource_id
        left join ranked previous on previous.project_id = latest.project_id
          and previous.resource_id = latest.resource_id and previous.ordinal = 2
        where latest.ordinal = 1
      `);
      return rows.rows.map((row) => ({
        ...row,
        latestAt: new Date(row.latestAt).toISOString(),
        previousAt: row.previousAt
          ? new Date(row.previousAt).toISOString()
          : null,
      }));
    },
    async reconcile(desired: DesiredLocalAttentionSignal[], at: Date) {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('local_attention_reconcile'))`,
        );
        const desiredByKey = new Map(desired.map((item) => [item.key, item]));
        const active = await tx
          .select()
          .from(localAttentionSignal)
          .where(eq(localAttentionSignal.state, "active"));
        let activated = 0;
        let resolved = 0;
        for (const item of desiredByKey.values()) {
          const [current] = await tx
            .select()
            .from(localAttentionSignal)
            .where(eq(localAttentionSignal.key, item.key))
            .for("update")
            .limit(1);
          const values = {
            ruleId: item.ruleId,
            state: "active" as const,
            projectId: item.projectId,
            integrationId: item.integrationId,
            resourceId: item.resourceId,
            evidenceKind: item.evidenceKind,
            evidenceId: item.evidenceId,
            previousEvidenceId: item.previousEvidenceId,
            reason: item.reason,
            observedAt: new Date(item.observedAt),
            previousObservedAt: item.previousObservedAt
              ? new Date(item.previousObservedAt)
              : null,
            previousValue: item.previousValue,
            latestValue: item.latestValue,
            threshold: item.threshold,
            evaluatedAt: at,
          };
          if (!current) {
            const id = crypto.randomUUID();
            await tx
              .insert(localAttentionSignal)
              .values({ id, key: item.key, ...values, changedAt: at });
            await tx.insert(localAttentionAudit).values({
              id: crypto.randomUUID(),
              signalId: id,
              actor: "system:local-attention-worker",
              operation: "local_attention.activated",
              details: { key: item.key, ruleId: item.ruleId },
            });
            activated += 1;
          } else {
            const changed =
              current.state !== "active" ||
              current.evidenceId !== item.evidenceId ||
              current.previousEvidenceId !== item.previousEvidenceId ||
              current.threshold !== item.threshold;
            await tx
              .update(localAttentionSignal)
              .set({ ...values, changedAt: changed ? at : current.changedAt })
              .where(eq(localAttentionSignal.id, current.id));
            if (changed) {
              await tx.insert(localAttentionAudit).values({
                id: crypto.randomUUID(),
                signalId: current.id,
                actor: "system:local-attention-worker",
                operation:
                  current.state === "resolved"
                    ? "local_attention.reactivated"
                    : "local_attention.evidence_refreshed",
                details: { key: item.key, ruleId: item.ruleId },
              });
              if (current.state === "resolved") activated += 1;
            }
          }
        }
        for (const current of active) {
          if (desiredByKey.has(current.key)) continue;
          await tx
            .update(localAttentionSignal)
            .set({ state: "resolved", changedAt: at, evaluatedAt: at })
            .where(eq(localAttentionSignal.id, current.id));
          await tx.insert(localAttentionAudit).values({
            id: crypto.randomUUID(),
            signalId: current.id,
            actor: "system:local-attention-worker",
            operation: "local_attention.resolved",
            details: { key: current.key, ruleId: current.ruleId },
          });
          resolved += 1;
        }
        return { activated, resolved };
      });
    },
    async listSignals(query: {
      limit: number;
      cursor?: string | undefined;
      view: "active" | "all";
      projectId?: string | undefined;
      resourceId?: string | undefined;
    }) {
      const rows = await db
        .select({
          signal: localAttentionSignal,
          projectName: project.name,
          integrationName: integrationInstance.name,
          resourceName: resource.name,
        })
        .from(localAttentionSignal)
        .innerJoin(project, eq(localAttentionSignal.projectId, project.id))
        .leftJoin(
          integrationInstance,
          eq(localAttentionSignal.integrationId, integrationInstance.id),
        )
        .leftJoin(resource, eq(localAttentionSignal.resourceId, resource.id))
        .where(
          and(
            query.view === "active"
              ? eq(localAttentionSignal.state, "active")
              : undefined,
            query.view === "active"
              ? sql`not exists (
                  select 1 from local_attention_audit review
                  where review.id = (
                    select latest.id from local_attention_audit latest
                    where latest.signal_id = ${localAttentionSignal.id}
                      and latest.operation = 'local_attention.reviewed'
                    order by latest.created_at desc, latest.id desc
                    limit 1
                  )
                  and review.details->>'evidenceId' = ${localAttentionSignal.evidenceId}::text
                  and (
                    review.details->>'disposition' = 'dismissed'
                    or (
                      review.details->>'disposition' = 'snoozed'
                      and (review.details->>'snoozedUntil')::timestamptz > now()
                    )
                  )
                )`
              : undefined,
            query.projectId
              ? eq(localAttentionSignal.projectId, query.projectId)
              : undefined,
            query.resourceId
              ? eq(localAttentionSignal.resourceId, query.resourceId)
              : undefined,
            query.cursor
              ? sql`(${localAttentionSignal.changedAt}, ${localAttentionSignal.id}) < (select changed_at, id from local_attention_signal where id = ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(localAttentionSignal.changedAt),
          desc(localAttentionSignal.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const reviews = await latestReviews(page.map((row) => row.signal.id));
      return {
        items: page.map((row) => signalRecord(row, reviews.get(row.signal.id))),
        nextCursor: rows.length > query.limit ? page.at(-1)!.signal.id : null,
      };
    },
    async listAudit(query: { limit: number; cursor?: string | undefined }) {
      const rows = await db
        .select()
        .from(localAttentionAudit)
        .where(
          query.cursor
            ? sql`(${localAttentionAudit.createdAt}, ${localAttentionAudit.id}) < (select created_at, id from local_attention_audit where id = ${query.cursor}::uuid)`
            : undefined,
        )
        .orderBy(
          desc(localAttentionAudit.createdAt),
          desc(localAttentionAudit.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(auditRecord),
        nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
      };
    },
  };
}
