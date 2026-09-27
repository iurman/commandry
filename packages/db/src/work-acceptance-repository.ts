import { and, desc, eq, sql } from "drizzle-orm";
import { WorkAcceptanceError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  auditEvent,
  knowledgeItem,
  workItem,
  workItemAcceptance,
  workItemAcceptanceRevision,
  workItemAttachment,
  workItemVerification,
} from "./schema";

type AcceptanceRow = typeof workItemAcceptance.$inferSelect;
type RevisionRow = typeof workItemAcceptanceRevision.$inferSelect;
type VerificationRow = typeof workItemVerification.$inferSelect;

function acceptanceRecord(workItemId: string, row?: AcceptanceRow) {
  return {
    workItemId,
    criteria: row?.criteria ?? "",
    version: row?.version ?? 0,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

function revisionRecord(row: RevisionRow) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    version: row.version,
    criteria: row.criteria,
    actor: "local-user:unattributed" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

function verificationRecord(row: VerificationRow) {
  return {
    id: row.id,
    workItemId: row.workItemId,
    acceptanceVersion: row.acceptanceVersion,
    attachmentId: row.attachmentId,
    documentTitle: row.documentTitle,
    sourceCaptureId: row.sourceCaptureId,
    downloadHref: `/api/v1/captures/${row.sourceCaptureId}/original-file`,
    result: row.result,
    note: row.note,
    actor: "local-user:unattributed" as const,
    sourceLabel: "Manual local acceptance review" as const,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createWorkAcceptanceRepository(db: CommandryDatabase) {
  async function requireWork(workItemId: string) {
    const [work] = await db
      .select({ id: workItem.id })
      .from(workItem)
      .where(eq(workItem.id, workItemId))
      .limit(1);
    if (!work)
      throw new WorkAcceptanceError("WORK_NOT_FOUND", "Task not found");
  }

  return {
    async get(workItemId: string) {
      await requireWork(workItemId);
      const [row] = await db
        .select()
        .from(workItemAcceptance)
        .where(eq(workItemAcceptance.workItemId, workItemId))
        .limit(1);
      return acceptanceRecord(workItemId, row);
    },
    async save(
      workItemId: string,
      input: { expectedVersion: number; criteria: string },
    ) {
      return db.transaction(async (tx) => {
        const [work] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .for("update")
          .limit(1);
        if (!work)
          throw new WorkAcceptanceError("WORK_NOT_FOUND", "Task not found");
        if (work.status !== "open")
          throw new WorkAcceptanceError(
            "WORK_MUST_BE_OPEN",
            "Reopen the task before changing its acceptance criteria",
          );
        const [current] = await tx
          .select()
          .from(workItemAcceptance)
          .where(eq(workItemAcceptance.workItemId, workItemId))
          .limit(1);
        if (
          (current?.version ?? 0) !== input.expectedVersion ||
          (current?.criteria ?? "") === input.criteria
        )
          throw new WorkAcceptanceError(
            "ACCEPTANCE_CONFLICT",
            "Acceptance criteria changed; refresh before saving",
          );
        const now = new Date();
        const version = (current?.version ?? 0) + 1;
        const [saved] = current
          ? await tx
              .update(workItemAcceptance)
              .set({
                criteria: input.criteria,
                version,
                updatedAt: now,
              })
              .where(eq(workItemAcceptance.workItemId, workItemId))
              .returning()
          : await tx
              .insert(workItemAcceptance)
              .values({
                workItemId,
                criteria: input.criteria,
                version,
                updatedAt: now,
              })
              .returning();
        if (!saved) throw new Error("Acceptance criteria disappeared");
        const revisionId = crypto.randomUUID();
        await tx.insert(workItemAcceptanceRevision).values({
          id: revisionId,
          workItemId,
          version,
          criteria: input.criteria,
          actor: "local-user:unattributed",
          createdAt: now,
        });
        await tx
          .update(workItem)
          .set({ updatedAt: now })
          .where(eq(workItem.id, workItemId));
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-user:unattributed",
          operation: "work_item_acceptance.revised",
          details: {
            workItemId,
            projectId: work.projectId,
            revisionId,
            version,
          },
        });
        return acceptanceRecord(workItemId, saved);
      });
    },
    async listRevisions(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      await requireWork(workItemId);
      const [anchor] = query.cursor
        ? await db
            .select({ version: workItemAcceptanceRevision.version })
            .from(workItemAcceptanceRevision)
            .where(
              and(
                eq(workItemAcceptanceRevision.id, query.cursor),
                eq(workItemAcceptanceRevision.workItemId, workItemId),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workItemAcceptanceRevision)
        .where(
          and(
            eq(workItemAcceptanceRevision.workItemId, workItemId),
            anchor
              ? sql`${workItemAcceptanceRevision.version} < ${anchor.version}`
              : undefined,
          ),
        )
        .orderBy(desc(workItemAcceptanceRevision.version))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(revisionRecord),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async getRevision(id: string) {
      const [row] = await db
        .select()
        .from(workItemAcceptanceRevision)
        .where(eq(workItemAcceptanceRevision.id, id))
        .limit(1);
      return row ? revisionRecord(row) : null;
    },
    async recordVerification(
      workItemId: string,
      input: {
        expectedAcceptanceVersion: number;
        attachmentId: string;
        result: "met" | "not_met";
        note: string;
      },
    ) {
      return db.transaction(async (tx) => {
        const [work] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .for("update")
          .limit(1);
        if (!work)
          throw new WorkAcceptanceError("WORK_NOT_FOUND", "Task not found");
        if (work.status !== "open")
          throw new WorkAcceptanceError(
            "WORK_MUST_BE_OPEN",
            "Reopen the task before recording a new review",
          );
        const [acceptance] = await tx
          .select()
          .from(workItemAcceptance)
          .where(eq(workItemAcceptance.workItemId, workItemId))
          .limit(1);
        if (!acceptance?.criteria.trim())
          throw new WorkAcceptanceError(
            "ACCEPTANCE_REQUIRED",
            "Write acceptance criteria before recording a review",
          );
        if (acceptance.version !== input.expectedAcceptanceVersion)
          throw new WorkAcceptanceError(
            "ACCEPTANCE_CONFLICT",
            "Acceptance criteria changed; refresh before reviewing",
          );
        const [source] = await tx
          .select({ attachment: workItemAttachment, document: knowledgeItem })
          .from(workItemAttachment)
          .innerJoin(
            knowledgeItem,
            eq(knowledgeItem.id, workItemAttachment.knowledgeItemId),
          )
          .where(eq(workItemAttachment.id, input.attachmentId))
          .limit(1);
        if (!source)
          throw new WorkAcceptanceError(
            "ATTACHMENT_NOT_FOUND",
            "Attached document not found",
          );
        if (
          source.attachment.workItemId !== workItemId ||
          source.attachment.projectId !== work.projectId ||
          source.attachment.state !== "active" ||
          source.document.kind !== "document"
        )
          throw new WorkAcceptanceError(
            "ATTACHMENT_SCOPE",
            "Choose an active document attached to this task",
          );
        const now = new Date();
        const [verification] = await tx
          .insert(workItemVerification)
          .values({
            id: crypto.randomUUID(),
            workItemId,
            acceptanceVersion: acceptance.version,
            attachmentId: source.attachment.id,
            documentTitle: source.document.title,
            sourceCaptureId: source.document.sourceCaptureId,
            result: input.result,
            note: input.note,
            actor: "local-user:unattributed",
            createdAt: now,
          })
          .returning();
        if (!verification) throw new Error("Review record disappeared");
        await tx
          .update(workItem)
          .set({ updatedAt: now })
          .where(eq(workItem.id, workItemId));
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-user:unattributed",
          operation: "work_item_verification.recorded",
          details: {
            verificationId: verification.id,
            workItemId,
            projectId: work.projectId,
            acceptanceVersion: acceptance.version,
            attachmentId: source.attachment.id,
            result: input.result,
          },
        });
        return verificationRecord(verification);
      });
    },
    async listVerifications(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      await requireWork(workItemId);
      const [anchor] = query.cursor
        ? await db
            .select({ createdAt: workItemVerification.createdAt })
            .from(workItemVerification)
            .where(
              and(
                eq(workItemVerification.id, query.cursor),
                eq(workItemVerification.workItemId, workItemId),
              ),
            )
            .limit(1)
        : [];
      if (query.cursor && !anchor) return { items: [], nextCursor: null };
      const rows = await db
        .select()
        .from(workItemVerification)
        .where(
          and(
            eq(workItemVerification.workItemId, workItemId),
            anchor
              ? sql`(${workItemVerification.createdAt}, ${workItemVerification.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          desc(workItemVerification.createdAt),
          desc(workItemVerification.id),
        )
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      return {
        items: page.map(verificationRecord),
        nextCursor:
          rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async getVerification(id: string) {
      const [row] = await db
        .select()
        .from(workItemVerification)
        .where(eq(workItemVerification.id, id))
        .limit(1);
      return row ? verificationRecord(row) : null;
    },
  };
}
