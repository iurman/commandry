import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  realIntegrationSchema,
  type CreateRealIntegrationRequest,
  type LinuxHostSample,
} from "@commandry/contracts";
import {
  classifyObservationFreshness,
  RealIntegrationError,
  type RealSourceProjection,
} from "@commandry/domain";
import {
  prepareLinuxHostObservation,
  type GitHubActivityPage,
  type RealPollClaim,
} from "@commandry/application";
import type { CommandryDatabase } from "./client";
import {
  integrationInstance,
  integrationInstanceAudit,
  realIntegrationState,
  projectResourceLink,
  resource,
  sourceEnvelope,
  normalizedEvent,
  metricSample,
} from "./schema";

type Transaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const scope = sql`${integrationInstance.kind} in ('github-repository', 'linux-host')`;
function record(
  instance: typeof integrationInstance.$inferSelect,
  state: typeof realIntegrationState.$inferSelect,
) {
  return realIntegrationSchema.parse({
    ...instance,
    identifier: state.identifier,
    isSynthetic: false,
    receiverConfigured: instance.receiverTokenDigest !== null,
    freshnessState: classifyObservationFreshness(
      instance.kind === "github-repository"
        ? state.lastSuccessAt
        : state.lastObservedAt,
      instance.freshnessWindowMinutes,
      new Date(),
    ),
    lastAttemptAt: state.lastAttemptAt?.toISOString() ?? null,
    lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
    lastObservedAt: state.lastObservedAt?.toISOString() ?? null,
    lastError: state.lastError,
    nextAttemptAt:
      instance.kind === "github-repository"
        ? state.nextAttemptAt.toISOString()
        : null,
    createdAt: instance.createdAt.toISOString(),
  });
}
async function validateBinding(
  tx: Transaction,
  projectId: string,
  resourceId: string,
  kind: string,
) {
  const [link] = await tx
    .select({ kind: resource.kind })
    .from(projectResourceLink)
    .innerJoin(resource, eq(resource.id, projectResourceLink.resourceId))
    .where(
      and(
        eq(projectResourceLink.projectId, projectId),
        eq(projectResourceLink.resourceId, resourceId),
        eq(projectResourceLink.lifecycle, "active"),
      ),
    )
    .for("share")
    .limit(1);
  if (
    !link ||
    link.kind !== (kind === "github-repository" ? "repository" : "host")
  )
    throw new RealIntegrationError(
      "INVALID_BINDING",
      "Source requires an active project link to a repository or host resource",
    );
}
async function audit(
  tx: Transaction,
  id: string,
  actor: string,
  operation: string,
  details: Record<string, string | boolean | null> = {},
) {
  await tx.insert(integrationInstanceAudit).values({
    id: randomUUID(),
    integrationInstanceId: id,
    actor,
    operation,
    details,
  });
}
export function createRealIntegrationRepository(db: CommandryDatabase) {
  function select() {
    return db
      .select({ instance: integrationInstance, state: realIntegrationState })
      .from(integrationInstance)
      .innerJoin(
        realIntegrationState,
        eq(realIntegrationState.integrationInstanceId, integrationInstance.id),
      );
  }
  async function get(id: string) {
    const [row] = await select()
      .where(and(eq(integrationInstance.id, id), scope))
      .limit(1);
    return row ? record(row.instance, row.state) : null;
  }
  async function locked(tx: Transaction, id: string) {
    const [row] = await tx
      .select({ instance: integrationInstance, state: realIntegrationState })
      .from(integrationInstance)
      .innerJoin(
        realIntegrationState,
        eq(realIntegrationState.integrationInstanceId, integrationInstance.id),
      )
      .where(and(eq(integrationInstance.id, id), scope))
      .for("update")
      .limit(1);
    if (!row)
      throw new RealIntegrationError("NOT_FOUND", "Real integration not found");
    return row;
  }
  async function ingest(
    tx: Transaction,
    instance: typeof integrationInstance.$inferSelect,
    projections: RealSourceProjection[],
  ) {
    if (!instance.enabled)
      throw new RealIntegrationError("DISABLED", "Source is disabled");
    if (!instance.resourceId)
      throw new RealIntegrationError(
        "INVALID_BINDING",
        "Source resource is missing",
      );
    await validateBinding(
      tx,
      instance.projectId,
      instance.resourceId,
      instance.kind,
    );
    for (const projection of projections) {
      const sourceEventId = `${instance.id}:${projection.sourceEventId}`;
      const raw = JSON.stringify(projection.rawPayload);
      const [existing] = await tx
        .select()
        .from(sourceEnvelope)
        .where(
          and(
            eq(sourceEnvelope.sourceKind, instance.kind),
            eq(sourceEnvelope.sourceEventId, sourceEventId),
          ),
        )
        .limit(1);
      if (existing) {
        if (
          instance.kind === "linux-host" &&
          existing.rawPayload.payload !== raw
        )
          throw new RealIntegrationError(
            "OCCURRENCE_CONFLICT",
            "Sample ID already belongs to different evidence",
          );
        continue;
      }
      const envelopeId = randomUUID();
      const eventId = randomUUID();
      const label =
        instance.kind === "github-repository"
          ? "GitHub repository activity"
          : "Linux host telemetry";
      await tx.insert(sourceEnvelope).values({
        id: envelopeId,
        importId: null,
        integrationInstanceId: instance.id,
        sourceKind: instance.kind,
        sourceLabel: label,
        sourceSchemaVersion:
          instance.kind === "github-repository"
            ? "github-events/v1"
            : "linux-host/v1",
        sourceEventId,
        rawPayload: { payload: raw },
        occurredAt: new Date(projection.occurredAt),
        isSynthetic: false,
      });
      await tx.insert(normalizedEvent).values({
        id: eventId,
        importId: null,
        sourceEnvelopeId: envelopeId,
        type: projection.type,
        projectId: instance.projectId,
        resourceId: instance.resourceId,
        severity: "info",
        summary: projection.summary,
        occurredAt: new Date(projection.occurredAt),
        sourceKind: instance.kind,
        sourceLabel: label,
        processingVersion: "real-projection/v1",
        isSynthetic: false,
      });
      for (const metric of projection.metrics)
        await tx.insert(metricSample).values({
          id: randomUUID(),
          eventId,
          sourceEnvelopeId: envelopeId,
          projectId: instance.projectId,
          resourceId: instance.resourceId,
          ...metric,
          sampledAt: new Date(projection.occurredAt),
          sourceKind: instance.kind,
          sourceLabel: label,
          isSynthetic: false,
        });
      await audit(
        tx,
        instance.id,
        `integration:${instance.id}`,
        "integration.real_observation_imported",
        { eventId, sourceEnvelopeId: envelopeId, synthetic: false },
      );
    }
  }
  return {
    get,
    async create(input: CreateRealIntegrationRequest, actor: string) {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await validateBinding(
          tx,
          input.projectId,
          input.resourceId,
          input.kind,
        );
        await tx.insert(integrationInstance).values({
          id,
          name: input.name,
          kind: input.kind,
          projectId: input.projectId,
          resourceId: input.resourceId,
          freshnessWindowMinutes: input.freshnessWindowMinutes,
        });
        await tx
          .insert(realIntegrationState)
          .values({ integrationInstanceId: id, identifier: input.identifier });
        await audit(tx, id, actor, "integration.real_source_created", {
          kind: input.kind,
          identifier: input.identifier,
          capability: "integration.read",
          risk: "read",
        });
      });
      return get(id);
    },
    async list(query: { limit: number; cursor?: string | undefined }) {
      const [anchor] = query.cursor
        ? await select()
            .where(and(eq(integrationInstance.id, query.cursor), scope))
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await select()
        .where(
          and(
            scope,
            anchor
              ? sql`(${integrationInstance.createdAt}, ${integrationInstance.id}) < (${anchor.instance.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(integrationInstance.createdAt),
          desc(integrationInstance.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map((row) => record(row.instance, row.state)),
        nextCursor: rows.length > query.limit ? page.at(-1)!.instance.id : null,
      };
    },
    async setEnabled(id: string, enabled: boolean, actor: string) {
      await db.transaction(async (tx) => {
        await locked(tx, id);
        await tx
          .update(integrationInstance)
          .set({ enabled, updatedAt: new Date() })
          .where(eq(integrationInstance.id, id));
        await tx
          .update(realIntegrationState)
          .set({ leaseId: null, leaseUntil: null })
          .where(eq(realIntegrationState.integrationInstanceId, id));
        await audit(tx, id, actor, "integration.real_source_enabled_changed", {
          enabled,
        });
      });
      return get(id);
    },
    async rotateToken(id: string, actor: string) {
      const token = `cmdry_host_${randomBytes(32).toString("base64url")}`;
      await db.transaction(async (tx) => {
        const { instance } = await locked(tx, id);
        if (instance.kind !== "linux-host")
          throw new RealIntegrationError(
            "INVALID_SOURCE",
            "Only host sources have receiver tokens",
          );
        await tx
          .update(integrationInstance)
          .set({ receiverTokenDigest: digest(token), updatedAt: new Date() })
          .where(eq(integrationInstance.id, id));
        await audit(tx, id, actor, "integration.real_receiver_token_rotated");
      });
      return { token, notice: "Host receiver token; shown once" as const };
    },
    async receive(id: string, token: string, sample: LinuxHostSample) {
      await db.transaction(async (tx) => {
        const { instance, state } = await locked(tx, id);
        if (
          instance.kind !== "linux-host" ||
          !instance.receiverTokenDigest ||
          token.length > 200 ||
          !timingSafeEqual(
            Buffer.from(instance.receiverTokenDigest, "hex"),
            Buffer.from(digest(token), "hex"),
          )
        )
          throw new RealIntegrationError(
            "UNAUTHORIZED",
            "Receiver token is invalid",
          );
        const projection = prepareLinuxHostObservation(
          state.identifier,
          sample,
        );
        await ingest(tx, instance, [projection]);
        const observed = new Date(projection.occurredAt);
        await tx
          .update(realIntegrationState)
          .set({
            lastAttemptAt: new Date(),
            lastSuccessAt: new Date(),
            lastObservedAt:
              state.lastObservedAt && state.lastObservedAt > observed
                ? state.lastObservedAt
                : observed,
            lastError: null,
          })
          .where(eq(realIntegrationState.integrationInstanceId, id));
      });
    },
    async claimDue(): Promise<RealPollClaim | null> {
      return db.transaction(async (tx) => {
        const now = new Date();
        const [row] = await tx
          .select({
            instance: integrationInstance,
            state: realIntegrationState,
          })
          .from(realIntegrationState)
          .innerJoin(
            integrationInstance,
            eq(
              integrationInstance.id,
              realIntegrationState.integrationInstanceId,
            ),
          )
          .where(
            and(
              eq(integrationInstance.kind, "github-repository"),
              eq(integrationInstance.enabled, true),
              sql`exists (
                select 1 from ${projectResourceLink} binding
                join ${resource} bound_resource on bound_resource.id = binding.resource_id
                where binding.project_id = ${integrationInstance.projectId}
                  and binding.resource_id = ${integrationInstance.resourceId}
                  and binding.lifecycle = 'active'
                  and bound_resource.kind = 'repository'
              )`,
              lte(realIntegrationState.nextAttemptAt, now),
              or(
                isNull(realIntegrationState.leaseUntil),
                lte(realIntegrationState.leaseUntil, now),
              ),
            ),
          )
          .orderBy(
            realIntegrationState.nextAttemptAt,
            realIntegrationState.integrationInstanceId,
          )
          .for("update", { skipLocked: true })
          .limit(1);
        if (!row) return null;
        const leaseId = randomUUID();
        await tx
          .update(realIntegrationState)
          .set({
            leaseId,
            leaseUntil: new Date(now.getTime() + 120_000),
            lastAttemptAt: now,
          })
          .where(
            eq(realIntegrationState.integrationInstanceId, row.instance.id),
          );
        return {
          id: row.instance.id,
          leaseId,
          identifier: row.state.identifier,
          page: row.state.page,
          etag: row.state.etag,
          pendingEtag: row.state.pendingEtag,
        };
      });
    },
    async completePoll(
      claim: RealPollClaim,
      projections: RealSourceProjection[],
      page: GitHubActivityPage,
    ) {
      await db.transaction(async (tx) => {
        const { instance, state } = await locked(tx, claim.id);
        if (state.leaseId !== claim.leaseId || !instance.enabled) return;
        await ingest(tx, instance, projections);
        const observedAt = projections
          .map((p) => new Date(p.occurredAt))
          .sort((a, b) => b.getTime() - a.getTime())[0];
        const pendingEtag = claim.page === 1 ? page.etag : state.pendingEtag;
        await tx
          .update(realIntegrationState)
          .set({
            page: page.hasNext ? claim.page + 1 : 1,
            etag: page.hasNext ? state.etag : pendingEtag,
            pendingEtag: page.hasNext ? pendingEtag : null,
            nextAttemptAt: new Date(Date.now() + page.pollSeconds * 1000),
            leaseId: null,
            leaseUntil: null,
            lastSuccessAt: new Date(),
            lastObservedAt:
              observedAt &&
              (!state.lastObservedAt || observedAt > state.lastObservedAt)
                ? observedAt
                : state.lastObservedAt,
            lastError: null,
          })
          .where(eq(realIntegrationState.integrationInstanceId, claim.id));
        await audit(
          tx,
          claim.id,
          "system:github-poller",
          "integration.real_poll_succeeded",
          { unchanged: page.notModified, page: String(claim.page) },
        );
      });
    },
    async failPoll(claim: RealPollClaim, code: string, retrySeconds: number) {
      await db.transaction(async (tx) => {
        const { state } = await locked(tx, claim.id);
        if (state.leaseId !== claim.leaseId) return;
        await tx
          .update(realIntegrationState)
          .set({
            leaseId: null,
            leaseUntil: null,
            nextAttemptAt: new Date(
              Date.now() + Math.max(60, retrySeconds) * 1000,
            ),
            lastError: code,
          })
          .where(eq(realIntegrationState.integrationInstanceId, claim.id));
        await audit(
          tx,
          claim.id,
          "system:github-poller",
          "integration.real_poll_failed",
          { code },
        );
      });
    },
    async getEnvelope(id: string) {
      const [row] = await db
        .select()
        .from(sourceEnvelope)
        .where(
          and(eq(sourceEnvelope.id, id), eq(sourceEnvelope.isSynthetic, false)),
        )
        .limit(1);
      return row
        ? {
            ...row,
            rawPayload: JSON.parse(row.rawPayload.payload!),
            occurredAt: row.occurredAt.toISOString(),
            receivedAt: row.receivedAt.toISOString(),
          }
        : null;
    },
    async observations(
      id: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const source = await get(id);
      if (!source)
        throw new RealIntegrationError(
          "NOT_FOUND",
          "Real integration not found",
        );
      const [anchor] = query.cursor
        ? await db
            .select({ occurredAt: normalizedEvent.occurredAt })
            .from(normalizedEvent)
            .innerJoin(
              sourceEnvelope,
              eq(sourceEnvelope.id, normalizedEvent.sourceEnvelopeId),
            )
            .where(
              and(
                eq(normalizedEvent.id, query.cursor),
                eq(sourceEnvelope.integrationInstanceId, id),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select({ event: normalizedEvent })
        .from(normalizedEvent)
        .innerJoin(
          sourceEnvelope,
          eq(sourceEnvelope.id, normalizedEvent.sourceEnvelopeId),
        )
        .where(
          and(
            eq(sourceEnvelope.integrationInstanceId, id),
            eq(normalizedEvent.isSynthetic, false),
            anchor
              ? sql`(${normalizedEvent.occurredAt}, ${normalizedEvent.id}) < (${anchor.occurredAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(normalizedEvent.occurredAt), desc(normalizedEvent.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const items = await Promise.all(
        page.map(async ({ event }) => ({
          ...event,
          occurredAt: event.occurredAt.toISOString(),
          evidenceHref: `/api/v1/source-envelopes/${event.sourceEnvelopeId}`,
          metrics: await db
            .select({
              name: metricSample.name,
              unit: metricSample.unit,
              value: metricSample.value,
            })
            .from(metricSample)
            .where(eq(metricSample.eventId, event.id)),
        })),
      );
      return {
        items,
        nextCursor: rows.length > query.limit ? page.at(-1)!.event.id : null,
      };
    },
  };
}
