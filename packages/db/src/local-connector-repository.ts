import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type {
  LocalConnectorFeedItem,
  RunLocalIntegrationSampleRequest,
} from "@commandry/contracts";
import { LocalIntegrationError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  integrationInstance,
  integrationInstanceAudit,
  localConnectorFeed,
} from "./schema";

function feedRecord(
  row: typeof localConnectorFeed.$inferSelect,
): LocalConnectorFeedItem {
  return {
    id: row.id,
    integrationInstanceId: row.integrationInstanceId,
    scenarioId: row.scenarioId as LocalConnectorFeedItem["scenarioId"],
    occurrenceId: row.occurrenceId,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    state: row.state,
    importId: row.importId,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isSynthetic: true,
  };
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createLocalConnectorRepository(db: CommandryDatabase) {
  return {
    async rotateToken(integrationId: string) {
      const token = `cmdry_local_${randomBytes(32).toString("base64url")}`;
      const issuedAt = new Date();
      await db.transaction(async (tx) => {
        const [instance] = await tx
          .select({ id: integrationInstance.id })
          .from(integrationInstance)
          .where(eq(integrationInstance.id, integrationId))
          .for("update")
          .limit(1);
        if (!instance)
          throw new LocalIntegrationError(
            "INTEGRATION_NOT_FOUND",
            "Integration not found",
          );
        await tx
          .update(integrationInstance)
          .set({ receiverTokenDigest: tokenDigest(token), updatedAt: issuedAt })
          .where(eq(integrationInstance.id, integrationId));
        await tx.insert(integrationInstanceAudit).values({
          id: crypto.randomUUID(),
          integrationInstanceId: integrationId,
          actor: "local-user:unattributed",
          operation: "integration.local_receiver_token_rotated",
          details: { synthetic: true },
        });
      });
      return {
        token,
        issuedAt: issuedAt.toISOString(),
        notice: "Local synthetic receiver token; shown once" as const,
      };
    },
    async verifyToken(integrationId: string, token: string) {
      const [row] = await db
        .select({ digest: integrationInstance.receiverTokenDigest })
        .from(integrationInstance)
        .where(eq(integrationInstance.id, integrationId))
        .limit(1);
      if (!row?.digest || token.length > 200) return false;
      return timingSafeEqual(
        Buffer.from(row.digest, "hex"),
        Buffer.from(tokenDigest(token), "hex"),
      );
    },
    async enqueue(
      integrationId: string,
      input: RunLocalIntegrationSampleRequest,
    ) {
      return db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        const [inserted] = await tx
          .insert(localConnectorFeed)
          .values({
            id,
            integrationInstanceId: integrationId,
            scenarioId: input.scenarioId,
            occurrenceId: input.occurrenceId,
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
          })
          .onConflictDoNothing({ target: localConnectorFeed.occurrenceId })
          .returning();
        if (inserted) {
          await tx.insert(integrationInstanceAudit).values({
            id: crypto.randomUUID(),
            integrationInstanceId: integrationId,
            actor: "local-user:unattributed",
            operation: "integration.synthetic_poll_feed_queued",
            details: {
              feedId: id,
              occurrenceId: input.occurrenceId,
              synthetic: true,
            },
          });
          return feedRecord(inserted);
        }
        const [existing] = await tx
          .select()
          .from(localConnectorFeed)
          .where(eq(localConnectorFeed.occurrenceId, input.occurrenceId))
          .limit(1);
        if (
          existing &&
          existing.integrationInstanceId === integrationId &&
          existing.scenarioId === input.scenarioId &&
          (existing.occurredAt?.toISOString() ?? undefined) === input.occurredAt
        ) {
          return feedRecord(existing);
        }
        throw new LocalIntegrationError(
          "SCENARIO_MISMATCH",
          "Occurrence ID already belongs to another feed payload",
        );
      });
    },
    async list(
      integrationId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: localConnectorFeed.createdAt })
            .from(localConnectorFeed)
            .where(
              and(
                eq(localConnectorFeed.id, query.cursor),
                eq(localConnectorFeed.integrationInstanceId, integrationId),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(localConnectorFeed)
        .where(
          and(
            eq(localConnectorFeed.integrationInstanceId, integrationId),
            anchor
              ? or(
                  lt(localConnectorFeed.createdAt, anchor.createdAt),
                  and(
                    eq(localConnectorFeed.createdAt, anchor.createdAt),
                    lt(localConnectorFeed.id, query.cursor!),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(
          desc(localConnectorFeed.createdAt),
          desc(localConnectorFeed.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(feedRecord),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async claimNext() {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(localConnectorFeed)
          .where(
            or(
              eq(localConnectorFeed.state, "queued"),
              and(
                eq(localConnectorFeed.state, "processing"),
                lt(localConnectorFeed.updatedAt, new Date(Date.now() - 60_000)),
              ),
            ),
          )
          .orderBy(localConnectorFeed.createdAt, localConnectorFeed.id)
          .for("update", { skipLocked: true })
          .limit(1);
        if (!row) return null;
        await tx
          .update(localConnectorFeed)
          .set({
            state: "processing",
            attempts: row.attempts + 1,
            updatedAt: new Date(),
            error: null,
          })
          .where(eq(localConnectorFeed.id, row.id));
        return {
          ...feedRecord(row),
          state: "processing" as const,
          attempts: row.attempts + 1,
        };
      });
    },
    async complete(id: string, importId: string) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(localConnectorFeed)
          .set({
            state: "submitted",
            importId,
            error: null,
            updatedAt: new Date(),
          })
          .where(eq(localConnectorFeed.id, id))
          .returning({
            integrationInstanceId: localConnectorFeed.integrationInstanceId,
          });
        if (!row) return;
        await tx.insert(integrationInstanceAudit).values({
          id: crypto.randomUUID(),
          integrationInstanceId: row.integrationInstanceId,
          actor: "local-worker",
          operation: "integration.synthetic_poll_feed_submitted",
          details: { feedId: id, importId, synthetic: true },
        });
      });
    },
    async fail(id: string, error: string) {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .update(localConnectorFeed)
          .set({
            state: "failed",
            error: error.slice(0, 300),
            updatedAt: new Date(),
          })
          .where(eq(localConnectorFeed.id, id))
          .returning({
            integrationInstanceId: localConnectorFeed.integrationInstanceId,
          });
        if (!row) return;
        await tx.insert(integrationInstanceAudit).values({
          id: crypto.randomUUID(),
          integrationInstanceId: row.integrationInstanceId,
          actor: "local-worker",
          operation: "integration.synthetic_poll_feed_failed",
          details: { feedId: id, synthetic: true },
        });
      });
    },
  };
}
