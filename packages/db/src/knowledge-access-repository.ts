import { and, eq, gt, ilike, or } from "drizzle-orm";
import type { KnowledgeAccessPort } from "@commandry/application";
import { createProjectBriefService } from "@commandry/application";
import { KnowledgeAccessError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  knowledgeClient,
  knowledgeClientAudit,
  knowledgeItem,
  project,
} from "./schema";
import { createBriefRepository } from "./brief-repository";
import { knowledgeRecord } from "./capture-repository";

function clientRecord(row: typeof knowledgeClient.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

export function createKnowledgeAccessRepository(
  db: CommandryDatabase,
): KnowledgeAccessPort {
  return {
    async create(input) {
      return db.transaction(async (tx) => {
        const [bound] = await tx
          .select({ id: project.id })
          .from(project)
          .where(eq(project.id, input.projectId))
          .for("share")
          .limit(1);
        if (!bound)
          throw new KnowledgeAccessError("NOT_FOUND", "Project unavailable");
        const now = new Date();
        const [row] = await tx
          .insert(knowledgeClient)
          .values({
            id: crypto.randomUUID(),
            name: input.name,
            projectId: input.projectId,
            tokenDigest: input.tokenDigest,
            createdBy: input.actor,
            createdAt: now,
            expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000),
          })
          .returning();
        if (!row) throw new Error("Client insert returned no row");
        await tx.insert(knowledgeClientAudit).values({
          id: crypto.randomUUID(),
          clientId: row.id,
          actor: input.actor,
          operation: "knowledge_client.created",
          decision: "allowed",
          code: "CREATED",
        });
        return clientRecord(row);
      });
    },
    async list(input) {
      const rows = await db
        .select()
        .from(knowledgeClient)
        .where(input.cursor ? gt(knowledgeClient.id, input.cursor) : undefined)
        .orderBy(knowledgeClient.id)
        .limit(input.limit + 1);
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(clientRecord),
        nextCursor: rows.length > input.limit ? page.at(-1)!.id : null,
      };
    },
    async revoke(id, actor) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(knowledgeClient)
          .where(eq(knowledgeClient.id, id))
          .for("update")
          .limit(1);
        if (!row)
          throw new KnowledgeAccessError("NOT_FOUND", "Client unavailable");
        if (row.revokedAt) return clientRecord(row);
        const [updated] = await tx
          .update(knowledgeClient)
          .set({ revokedAt: new Date() })
          .where(eq(knowledgeClient.id, id))
          .returning();
        await tx.insert(knowledgeClientAudit).values({
          id: crypto.randomUUID(),
          clientId: id,
          actor,
          operation: "knowledge_client.revoked",
          decision: "allowed",
          code: "REVOKED",
        });
        return clientRecord(updated!);
      });
    },
    async withClient(digest, operation, targetId, read) {
      const outcome = await db.transaction(
        async (tx) => {
          // Hold the grant through retrieval and audit so revocation cannot race a read.
          const [row] = await tx
            .select()
            .from(knowledgeClient)
            .where(eq(knowledgeClient.tokenDigest, digest))
            .for("share")
            .limit(1);
          if (!row)
            throw new KnowledgeAccessError(
              "TOKEN_INVALID",
              "Read credential invalid",
            );
          let failure: KnowledgeAccessError | undefined;
          let value: Awaited<ReturnType<typeof read>> | undefined;
          try {
            value = await read(clientRecord(row), {
              async getProject() {
                const [item] = await tx
                  .select()
                  .from(project)
                  .where(eq(project.id, row.projectId))
                  .limit(1);
                return item
                  ? {
                      ...item,
                      domain: null,
                      createdAt: item.createdAt.toISOString(),
                      updatedAt: item.updatedAt.toISOString(),
                    }
                  : null;
              },
              getBrief: () =>
                createProjectBriefService(
                  createBriefRepository(db, tx),
                ).getBrief(row.projectId),
              async search(input) {
                const literal = input.q.replace(/[\\%_]/g, "\\$&");
                const rows = await tx
                  .select()
                  .from(knowledgeItem)
                  .where(
                    and(
                      eq(knowledgeItem.projectId, row.projectId),
                      input.cursor
                        ? gt(knowledgeItem.id, input.cursor)
                        : undefined,
                      literal
                        ? or(
                            ilike(knowledgeItem.title, `%${literal}%`),
                            ilike(knowledgeItem.content, `%${literal}%`),
                          )
                        : undefined,
                    ),
                  )
                  .orderBy(knowledgeItem.id)
                  .limit(input.limit + 1);
                const page = rows.slice(0, input.limit);
                return {
                  items: page.map((item) => {
                    const record = knowledgeRecord(item);
                    const { content: _content, ...metadata } = record;
                    void _content;
                    return metadata;
                  }),
                  nextCursor:
                    rows.length > input.limit ? page.at(-1)!.id : null,
                };
              },
              async getKnowledge(id) {
                const [item] = await tx
                  .select()
                  .from(knowledgeItem)
                  .where(
                    and(
                      eq(knowledgeItem.projectId, row.projectId),
                      eq(knowledgeItem.id, id),
                    ),
                  )
                  .limit(1);
                return item ? knowledgeRecord(item) : null;
              },
            });
          } catch (error) {
            if (!(error instanceof KnowledgeAccessError)) throw error;
            failure = error;
          }
          await tx.insert(knowledgeClientAudit).values({
            id: crypto.randomUUID(),
            clientId: row.id,
            actor: `knowledge-client:${row.id}`,
            operation,
            targetId,
            decision: failure ? "denied" : "allowed",
            code: failure?.code ?? "READ_ALLOWED",
          });
          return failure ? { error: failure } : { value: value! };
        },
        { isolationLevel: "repeatable read" },
      );
      if ("error" in outcome) throw outcome.error;
      return outcome.value;
    },
  };
}
