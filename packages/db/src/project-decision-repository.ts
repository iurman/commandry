import { and, desc, eq, gt, lt } from "drizzle-orm";
import type {
  CreateProjectDecisionRequest,
  ReviseProjectDecisionRequest,
} from "@commandry/contracts";
import {
  ProjectDecisionError,
  requireDecisionRevision,
} from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import { project, projectDecision, projectDecisionRevision } from "./schema";

function decisionRecord(row: typeof projectDecision.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    question: row.question,
    outcome: row.outcome,
    alternatives: row.alternatives,
    rationale: row.rationale,
    status: row.status,
    revision: row.revision,
    sourceLabel: "Manual local decision" as const,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function revisionRecord(row: typeof projectDecisionRevision.$inferSelect) {
  return {
    id: row.id,
    decisionId: row.decisionId,
    revision: row.revision,
    question: row.question,
    outcome: row.outcome,
    alternatives: row.alternatives,
    rationale: row.rationale,
    status: row.status,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createProjectDecisionRepository(db: CommandryDatabase) {
  return {
    async create(projectId: string, input: CreateProjectDecisionRequest) {
      return db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: project.id })
          .from(project)
          .where(eq(project.id, projectId))
          .limit(1);
        if (!owner)
          throw new ProjectDecisionError(
            "PROJECT_NOT_FOUND",
            "Project not found",
          );
        const id = crypto.randomUUID();
        const now = new Date();
        const [row] = await tx
          .insert(projectDecision)
          .values({ id, projectId, ...input, createdAt: now, updatedAt: now })
          .returning();
        if (!row) throw new Error("Decision insert returned no row");
        await tx.insert(projectDecisionRevision).values({
          id: crypto.randomUUID(),
          decisionId: id,
          revision: 1,
          ...input,
          createdAt: now,
        });
        return decisionRecord(row);
      });
    },
    async get(id: string) {
      const [row] = await db
        .select()
        .from(projectDecision)
        .where(eq(projectDecision.id, id))
        .limit(1);
      return row ? decisionRecord(row) : null;
    },
    async list(
      projectId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [owner] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.id, projectId))
        .limit(1);
      if (!owner)
        throw new ProjectDecisionError(
          "PROJECT_NOT_FOUND",
          "Project not found",
        );
      const rows = await db
        .select()
        .from(projectDecision)
        .where(
          and(
            eq(projectDecision.projectId, projectId),
            query.cursor ? gt(projectDecision.id, query.cursor) : undefined,
          ),
        )
        .orderBy(projectDecision.id)
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(decisionRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
    async revise(id: string, input: ReviseProjectDecisionRequest) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(projectDecision)
          .where(eq(projectDecision.id, id))
          .for("update")
          .limit(1);
        if (!current)
          throw new ProjectDecisionError(
            "DECISION_NOT_FOUND",
            "Decision not found",
          );
        requireDecisionRevision(current, input.expectedRevision, input.status);
        const { expectedRevision: _, ...fields } = input;
        const now = new Date();
        const revision = current.revision + 1;
        const [updated] = await tx
          .update(projectDecision)
          .set({ ...fields, revision, updatedAt: now })
          .where(eq(projectDecision.id, id))
          .returning();
        if (!updated) throw new Error("Locked decision disappeared");
        await tx.insert(projectDecisionRevision).values({
          id: crypto.randomUUID(),
          decisionId: id,
          revision,
          ...fields,
          createdAt: now,
        });
        return decisionRecord(updated);
      });
    },
    async listRevisions(
      decisionId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [decision] = await db
        .select({ id: projectDecision.id })
        .from(projectDecision)
        .where(eq(projectDecision.id, decisionId))
        .limit(1);
      if (!decision)
        throw new ProjectDecisionError(
          "DECISION_NOT_FOUND",
          "Decision not found",
        );
      const [anchor] = query.cursor
        ? await db
            .select({ revision: projectDecisionRevision.revision })
            .from(projectDecisionRevision)
            .where(
              and(
                eq(projectDecisionRevision.id, query.cursor),
                eq(projectDecisionRevision.decisionId, decisionId),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(projectDecisionRevision)
        .where(
          and(
            eq(projectDecisionRevision.decisionId, decisionId),
            anchor
              ? lt(projectDecisionRevision.revision, anchor.revision)
              : undefined,
          ),
        )
        .orderBy(desc(projectDecisionRevision.revision))
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      return {
        items: visible.map(revisionRecord),
        nextCursor:
          rows.length > query.limit ? (visible.at(-1)?.id ?? null) : null,
      };
    },
  };
}
