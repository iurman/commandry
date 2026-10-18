import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { FoundationError } from "@commandry/domain";
import {
  OBSERVATORY_REVIEW_POLICIES,
  type ObservatoryLogoPort,
} from "@commandry/application";
import type { CommandryDatabase } from "./client";
import { auditEvent, resource } from "./schema";
import {
  observatoryResourceLogo,
  observatorySource,
} from "./observatory-schema";
import { requireWorkflowOwnerSession } from "./foundation-workflow-access-repository";

type Transaction = Parameters<
  Parameters<CommandryDatabase["transaction"]>[0]
>[0];
const githubUrl =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i;

/** A repository identity is reviewed when the owner bound it as this resource's
 * GitHub source, or recorded it as the resource's canonical GitHub URL. */
async function repositoryIdentities(
  tx: Transaction,
  resourceId: string,
): Promise<string[]> {
  const [row] = await tx
    .select({ kind: resource.kind, externalUrl: resource.externalUrl })
    .from(resource)
    .where(eq(resource.id, resourceId))
    .for("share");
  if (!row) throw new FoundationError("NOT_FOUND");
  if (row.kind !== "repository")
    throw new FoundationError(
      "INVALID_REFERENCE",
      "Only repository resources accept a logo",
    );
  const sources = await tx
    .select({ externalId: observatorySource.externalId })
    .from(observatorySource)
    .where(
      and(
        eq(observatorySource.resourceId, resourceId),
        eq(observatorySource.kind, "github-repository"),
      ),
    )
    .for("share");
  const fromUrl = githubUrl.exec(row.externalUrl ?? "")?.[1];
  return [
    ...new Set(
      [...sources.map((source) => source.externalId), fromUrl]
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.toLowerCase()),
    ),
  ].sort();
}

export function createObservatoryLogoRepository(
  db: CommandryDatabase,
  clock = () => new Date(),
): ObservatoryLogoPort {
  return {
    async inspect(owner, resourceId, preview) {
      const result = await db.transaction(async (tx) => {
        await requireWorkflowOwnerSession(tx, owner, clock(), true);
        const repositories = await repositoryIdentities(tx, resourceId);
        if (preview) {
          await requireWorkflowOwnerSession(tx, owner, clock(), false);
          await tx.insert(auditEvent).values({
            id: randomUUID(),
            actor: owner.principalId,
            operation: OBSERVATORY_REVIEW_POLICIES.logo_preview.auditEvent,
            details: {
              targetId: resourceId,
              sourceKind: preview.sourceKind,
              decision: "allowed",
            },
          });
        }
        return { repositories };
      });
      await requireWorkflowOwnerSession(db, owner, clock(), false);
      return result;
    },
    async review(owner, change) {
      const now = clock();
      const id = change.resourceId;
      const operation = OBSERVATORY_REVIEW_POLICIES.logo.auditEvent;
      const auditId = randomUUID();
      const outcome = await db.transaction(async (tx) => {
        await requireWorkflowOwnerSession(tx, owner, now, true);
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${"observatory-review:logo:" + id},0))`,
        );
        let failure: FoundationError | null = null;
        let version = 0;
        try {
          version = await tx.transaction(async (write) => {
            const [current] = await write
              .select({
                version: observatoryResourceLogo.version,
                digest: observatoryResourceLogo.digest,
              })
              .from(observatoryResourceLogo)
              .where(eq(observatoryResourceLogo.resourceId, id))
              .for("update");
            if ((current?.version ?? 0) !== change.expectedVersion)
              throw new FoundationError(
                "VERSION_CONFLICT",
                "Review version changed; refresh and review the new values",
              );
            const repositories = await repositoryIdentities(write, id);
            if (
              change.source?.kind === "repository_file" &&
              !repositories.includes(change.source.repository.toLowerCase())
            )
              throw new FoundationError(
                "INVALID_REFERENCE",
                "Repository is no longer reviewed for this resource",
              );
            const next = change.expectedVersion + 1;
            const provenance = {
              actorId: owner.principalId,
              recordedAt: now.toISOString(),
              evidenceRefs: change.review.evidenceRefs,
            };
            if (change.active) {
              if (!change.image || !change.source)
                throw new FoundationError("INVALID_REFERENCE");
              const row = {
                resourceId: id,
                version: next,
                active: true,
                digest: change.image.digest,
                image: change.image.png,
                source: change.source,
                provenance,
                updatedAt: now,
              };
              await write
                .insert(observatoryResourceLogo)
                .values(row)
                .onConflictDoUpdate({
                  target: observatoryResourceLogo.resourceId,
                  set: row,
                });
            } else {
              // Retiring keeps the reviewed image and source as history.
              if (!current) throw new FoundationError("NOT_FOUND");
              await write
                .update(observatoryResourceLogo)
                .set({
                  version: next,
                  active: false,
                  provenance,
                  updatedAt: now,
                })
                .where(eq(observatoryResourceLogo.resourceId, id));
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
                active: change.active,
                imageDigest: change.active
                  ? change.image!.digest
                  : current!.digest,
                sourceKind: change.source?.kind ?? null,
                contentDigest: change.contentDigest,
                note: change.review.note,
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
