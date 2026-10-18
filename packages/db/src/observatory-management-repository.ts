import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { FoundationError, foundationDigest } from "@commandry/domain";
import {
  OBSERVATORY_REVIEW_POLICIES,
  type ObservatoryManagementPort,
} from "@commandry/application";
import { observatoryRelationSchema } from "@commandry/contracts";
import type { CommandryDatabase } from "./client";
import { auditEvent, projectResourceLink, resource } from "./schema";
import { foundationClient } from "./foundation-schema";
import { observatoryProviderFeed } from "./observatory-provider-schema";
import {
  observatoryAnnotation,
  observatoryClientScope,
  observatoryProviderMapping,
  observatoryRelation,
  observatorySource,
} from "./observatory-schema";
import { requireWorkflowOwnerSession } from "./foundation-workflow-access-repository";

export function createObservatoryManagementRepository(
  db: CommandryDatabase,
  clock = () => new Date(),
): ObservatoryManagementPort {
  return {
    async review(owner, change) {
      const now = clock();
      const value = change.value;
      const id =
        change.kind === "annotation"
          ? change.value.resourceId
          : change.kind === "client_scope"
            ? change.value.clientId
            : change.value.id;
      const operation = OBSERVATORY_REVIEW_POLICIES[change.kind].auditEvent;
      const auditId = randomUUID();
      const outcome = await db.transaction(async (tx) => {
        await requireWorkflowOwnerSession(tx, owner, now, true);
        // Same client row lock as machine reads/revocation: a scope change cannot
        // race a read already authorized under its previous scope.
        if (change.kind === "client_scope") {
          const [client] = await tx
            .select()
            .from(foundationClient)
            .where(eq(foundationClient.id, id))
            .for("update");
          if (!client) throw new FoundationError("NOT_FOUND");
        }
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"observatory-review:" + change.kind + ":" + id},0))`,
        );
        let failure: FoundationError | null = null;
        let version = 0;
        try {
          version = await tx.transaction(async (write) => {
            const provenance = {
              actorId: owner.principalId,
              recordedAt: now.toISOString(),
              evidenceRefs: value.review.evidenceRefs,
            };
            const table =
              change.kind === "annotation"
                ? observatoryAnnotation
                : change.kind === "relation"
                  ? observatoryRelation
                  : change.kind === "provider"
                    ? observatoryProviderMapping
                    : change.kind === "source"
                      ? observatorySource
                      : observatoryClientScope;
            const key =
              change.kind === "annotation"
                ? observatoryAnnotation.resourceId
                : change.kind === "client_scope"
                  ? observatoryClientScope.clientId
                  : change.kind === "relation"
                    ? observatoryRelation.id
                    : change.kind === "provider"
                      ? observatoryProviderMapping.id
                      : observatorySource.id;
            const [current] = await write
              .select({ version: table.version })
              .from(table)
              .where(eq(key, id))
              .for("update");
            if ((current?.version ?? 0) !== value.expectedVersion)
              throw new FoundationError(
                "VERSION_CONFLICT",
                "Review version changed; refresh and review the new values",
              );
            const next = value.expectedVersion + 1;
            if (change.kind === "annotation") {
              const v = change.value;
              const [r] = await write
                .select({ id: resource.id })
                .from(resource)
                .where(eq(resource.id, v.resourceId))
                .for("share");
              if (!r) throw new FoundationError("NOT_FOUND");
              const row = {
                resourceId: v.resourceId,
                version: next,
                metadata: {
                  resourceId: v.resourceId,
                  role: v.role,
                  pinned: v.pinned,
                  environment: v.environment,
                  provenance,
                },
                requirement: v.requirement,
              };
              await write
                .insert(observatoryAnnotation)
                .values(row)
                .onConflictDoUpdate({
                  target: observatoryAnnotation.resourceId,
                  set: row,
                });
            } else if (change.kind === "relation") {
              const v = change.value;
              const rows = await write
                .select()
                .from(resource)
                .where(
                  inArray(resource.id, [
                    v.relation.sourceId,
                    v.relation.targetId,
                  ]),
                )
                .orderBy(resource.id)
                .for("share");
              if (rows.length !== 2)
                throw new FoundationError("INVALID_REFERENCE");
              const source = rows.find((r) => r.id === v.relation.sourceId)!,
                target = rows.find((r) => r.id === v.relation.targetId)!;
              if (
                v.relation.sourceKind !== source.kind ||
                v.relation.targetKind !== target.kind
              )
                throw new FoundationError(
                  "INVALID_REFERENCE",
                  "Resource kinds changed",
                );
              const record = observatoryRelationSchema.parse({
                ...v.relation,
                sourceKind: source.kind,
                targetKind: target.kind,
                provenance,
              });
              const row = {
                id,
                sourceId: source.id,
                targetId: target.id,
                version: next,
                active: v.active,
                record,
              };
              await write
                .insert(observatoryRelation)
                .values(row)
                .onConflictDoUpdate({
                  target: observatoryRelation.id,
                  set: row,
                });
            } else if (change.kind === "provider") {
              const v = change.value;
              const rows = await write
                .select()
                .from(resource)
                .where(
                  inArray(resource.id, [
                    v.dependency.resourceId,
                    v.dependency.providerId,
                  ]),
                )
                .orderBy(resource.id)
                .for("share");
              if (
                rows.length !== 2 ||
                rows.find((r) => r.id === v.dependency.providerId)?.kind !==
                  "provider"
              )
                throw new FoundationError("INVALID_REFERENCE");
              const [feed] = await write
                .select()
                .from(observatoryProviderFeed)
                .where(eq(observatoryProviderFeed.id, v.feedId))
                .for("share");
              if (
                !feed?.snapshot?.components.some(
                  (c) => c.id === v.componentId,
                ) ||
                v.dependency.product !== v.componentId
              )
                throw new FoundationError(
                  "INVALID_REFERENCE",
                  "Select a recorded provider component by its stable ID",
                );
              const row = {
                id,
                resourceId: v.dependency.resourceId,
                providerResourceId: v.dependency.providerId,
                feedId: v.feedId,
                componentId: v.componentId,
                version: next,
                active: v.active,
                record: { ...v.dependency, provenance },
              };
              await write
                .insert(observatoryProviderMapping)
                .values(row)
                .onConflictDoUpdate({
                  target: observatoryProviderMapping.id,
                  set: row,
                });
            } else if (change.kind === "source") {
              const v = change.value;
              const [r] = await write
                .select()
                .from(resource)
                .where(eq(resource.id, v.resourceId))
                .for("share");
              if (
                !r ||
                (v.kind === "github-repository"
                  ? r.kind !== "repository"
                  : ["cloudflare-account", "namecheap-account"].includes(v.kind)
                    ? r.kind !== "provider"
                    : v.kind === "http-readiness"
                      ? !["service", "deployment"].includes(r.kind)
                      : !["service", "deployment", "host"].includes(r.kind))
              )
                throw new FoundationError("INVALID_REFERENCE");
              const [binding] = await write
                .select({ id: projectResourceLink.id })
                .from(projectResourceLink)
                .where(
                  and(
                    eq(projectResourceLink.projectId, v.projectId),
                    eq(projectResourceLink.resourceId, v.resourceId),
                    eq(projectResourceLink.lifecycle, "active"),
                  ),
                )
                .for("share")
                .limit(1);
              if (!binding)
                throw new FoundationError(
                  "INVALID_REFERENCE",
                  "Source requires an active project resource binding",
                );
              const row = {
                id,
                resourceId: v.resourceId,
                projectId: v.projectId,
                environment: v.environment,
                kind: v.kind,
                externalId: v.externalId,
                enabled: v.enabled,
                version: next,
                freshnessSeconds: v.freshnessSeconds,
                provenance,
                nextAttemptAt: now,
                leaseId: null,
                leaseUntil: null,
                snapshot: null,
                lastSuccessAt: null,
                lastError: null,
              };
              // A changed binding never reuses the old source's observation as
              // evidence for a new target or external identity.
              await write
                .insert(observatorySource)
                .values(row)
                .onConflictDoUpdate({ target: observatorySource.id, set: row });
            } else {
              const v = change.value;
              const [client] = await write
                .select()
                .from(foundationClient)
                .where(eq(foundationClient.id, v.clientId));
              if (!client) throw new FoundationError("NOT_FOUND");
              const links = v.resourceIds.length
                ? await write
                    .select({ id: projectResourceLink.resourceId })
                    .from(projectResourceLink)
                    .where(
                      and(
                        eq(projectResourceLink.projectId, client.projectId),
                        eq(projectResourceLink.lifecycle, "active"),
                        inArray(projectResourceLink.resourceId, v.resourceIds),
                      ),
                    )
                    .for("share")
                : [];
              if (new Set(links.map((l) => l.id)).size !== v.resourceIds.length)
                throw new FoundationError(
                  "INVALID_REFERENCE",
                  "Client scope must remain within active project resources",
                );
              const row = {
                clientId: v.clientId,
                version: next,
                resourceIds: [...v.resourceIds].sort(),
                updatedAt: now,
              };
              await write
                .insert(observatoryClientScope)
                .values(row)
                .onConflictDoUpdate({
                  target: observatoryClientScope.clientId,
                  set: row,
                });
            }
            await requireWorkflowOwnerSession(write, owner, clock(), false);
            await write.insert(auditEvent).values({
              id: auditId,
              actor: owner.principalId,
              operation,
              details: {
                targetId: id,
                version: next,
                decision: "allowed",
                contentDigest: foundationDigest(change),
                note: value.review.note,
              },
            });
            await requireWorkflowOwnerSession(write, owner, clock(), false);
            return next;
          });
        } catch (error) {
          if (!(error instanceof FoundationError)) throw error;
          failure = error;
          await tx.insert(auditEvent).values({
            id: auditId,
            actor: owner.principalId,
            operation,
            details: { targetId: id, decision: "denied", code: error.code },
          });
        }
        return { version, failure };
      });
      if (outcome.failure) throw outcome.failure;
      await requireWorkflowOwnerSession(db, owner, clock(), false);
      return { id, version: outcome.version, auditId };
    },
  };
}
