import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  foundationActorSchema,
  foundationProjectWorkQuerySchema,
} from "@commandry/contracts";
import type { ObservatoryOwnerIdentity } from "@commandry/application";
import type { ObservatoryOwnerWorkReadPort } from "../../application/src/observatory-work";
import {
  FoundationError,
  foundationDigest,
  foundationInstantMilliseconds,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { requireWorkflowOwnerSession } from "./foundation-workflow-access-repository";
import { listCanonicalProjectWork } from "./project-work-query";
import { auditEvent, project } from "./schema";

/** Canonical owner read; no machine credential or synthetic grant is created. */
export function createObservatoryOwnerWorkRepository(
  db: CommandryDatabase,
  options: { now?: () => Date } = {},
): ObservatoryOwnerWorkReadPort {
  const clock = options.now ?? (() => new Date());
  return {
    async withRead(owner, selectedProjectId, callback) {
      let identity: ObservatoryOwnerIdentity, identityDigest: string;
      try {
        identityDigest = foundationDigest(owner);
        if (
          Object.keys(owner).sort().join(",") !==
          "expiresAt,principalId,sessionId"
        )
          throw new Error();
        identity = {
          principalId: owner.principalId,
          sessionId: owner.sessionId,
          expiresAt: owner.expiresAt,
        };
      } catch {
        throw new FoundationError(
          "FORBIDDEN",
          "A live owner session is required",
        );
      }
      const projectId =
        foundationActorSchema.shape.projectId.parse(selectedProjectId);
      function recheckIdentity(): void {
        try {
          if (foundationDigest(owner) === identityDigest) return;
        } catch {
          /* Invalid server identity cannot cross delivery. */
        }
        throw new FoundationError(
          "FORBIDDEN",
          "Owner identity changed during Work read",
        );
      }
      const result = await db.transaction(
        async (tx) => {
          recheckIdentity();
          await requireWorkflowOwnerSession(tx, identity, clock(), true);
          const [subject] = await tx
            .select({ id: project.id })
            .from(project)
            .where(eq(project.id, projectId))
            .for("share");
          if (!subject)
            throw new FoundationError(
              "INVALID_REFERENCE",
              "Project unavailable",
            );
          const value = await callback({
            async listProjectWork(input) {
              if (input.projectId !== projectId)
                throw new FoundationError(
                  "FORBIDDEN",
                  "Work read is bound to its project",
                );
              const query = foundationProjectWorkQuerySchema.parse({
                projectId,
                limit: input.limit,
                cursor:
                  input.cursor === undefined
                    ? null
                    : { projectId, afterId: input.cursor },
              });
              const page = await listCanonicalProjectWork(
                tx,
                projectId,
                {
                  limit: query.limit,
                  ...(query.cursor === null
                    ? {}
                    : { cursor: query.cursor.afterId }),
                },
                { requireValidCursor: true },
              );
              return {
                items: page.items.map((item) => {
                  if (item.contextLink === undefined)
                    throw new FoundationError("INVALID_REFERENCE");
                  return { ...item, contextLink: item.contextLink };
                }),
                nextCursor: page.nextCursor,
              };
            },
          });
          recheckIdentity();
          await requireWorkflowOwnerSession(tx, identity, clock(), false);
          await tx.insert(auditEvent).values({
            id: randomUUID(),
            actor: identity.principalId,
            operation: "observatory.work.read",
            details: { projectId, capability: "owner", risk: "read_only" },
          });
          recheckIdentity();
          await requireWorkflowOwnerSession(tx, identity, clock(), false);
          return value;
        },
        { isolationLevel: "repeatable read" },
      );
      recheckIdentity();
      // The transaction has released the runtime connection before this query.
      await requireWorkflowOwnerSession(db, identity, clock(), false);
      recheckIdentity();
      const deliveredAt = clock();
      if (
        !(deliveredAt instanceof Date) ||
        !Number.isFinite(deliveredAt.getTime())
      )
        throw new FoundationError("FORBIDDEN", "Invalid owner read clock");
      if (
        foundationInstantMilliseconds(identity.expiresAt) <=
        deliveredAt.getTime()
      )
        throw new FoundationError("EXPIRED", "Owner session expired");
      return result;
    },
  };
}
