import { and, desc, eq, sql } from "drizzle-orm";
import { WorkAttachmentError } from "@commandry/domain";
import type { CommandryDatabase } from "./client";
import {
  auditEvent,
  captureFile,
  knowledgeItem,
  knowledgeProjectLink,
  workItem,
  workItemAttachment,
} from "./schema";

type AttachmentRow = typeof workItemAttachment.$inferSelect;
type WorkRow = typeof workItem.$inferSelect;
type DocumentRow = typeof knowledgeItem.$inferSelect;
type FileRow = typeof captureFile.$inferSelect;

function record(
  attachment: AttachmentRow,
  work: WorkRow,
  document: DocumentRow,
  file: FileRow,
) {
  return {
    id: attachment.id,
    projectId: attachment.projectId,
    workItemId: attachment.workItemId,
    workTitle: work.title,
    knowledgeItemId: attachment.knowledgeItemId,
    contextLinkId: attachment.contextLinkId,
    documentTitle: document.title,
    sourceCaptureId: document.sourceCaptureId,
    originalName: file.originalName,
    byteSize: file.byteSize,
    sha256: file.sha256,
    downloadHref: `/api/v1/captures/${document.sourceCaptureId}/original-file`,
    type: "attached_document" as const,
    inverseType: "attached_to_work" as const,
    state: attachment.state,
    actor: "local-user:unattributed" as const,
    sourceLabel: "Manual local work attachment" as const,
    createdAt: attachment.createdAt.toISOString(),
    archivedAt: attachment.archivedAt?.toISOString() ?? null,
  };
}

export function createWorkAttachmentRepository(db: CommandryDatabase) {
  async function joinedById(id: string) {
    const [row] = await db
      .select({
        attachment: workItemAttachment,
        work: workItem,
        document: knowledgeItem,
        file: captureFile,
      })
      .from(workItemAttachment)
      .innerJoin(workItem, eq(workItem.id, workItemAttachment.workItemId))
      .innerJoin(
        knowledgeItem,
        eq(knowledgeItem.id, workItemAttachment.knowledgeItemId),
      )
      .innerJoin(
        captureFile,
        eq(captureFile.captureId, knowledgeItem.sourceCaptureId),
      )
      .where(eq(workItemAttachment.id, id))
      .limit(1);
    return row ?? null;
  }

  async function list(
    endpointId: string,
    direction: "work" | "knowledge",
    query: { limit: number; cursor?: string | undefined },
  ) {
    const endpoint =
      direction === "work"
        ? workItemAttachment.workItemId
        : workItemAttachment.knowledgeItemId;
    const [anchor] = query.cursor
      ? await db
          .select({ createdAt: workItemAttachment.createdAt })
          .from(workItemAttachment)
          .where(
            and(
              eq(workItemAttachment.id, query.cursor),
              eq(endpoint, endpointId),
              eq(workItemAttachment.state, "active"),
            ),
          )
          .limit(1)
      : [];
    if (query.cursor && !anchor) return { items: [], nextCursor: null };
    const rows = await db
      .select({
        attachment: workItemAttachment,
        work: workItem,
        document: knowledgeItem,
        file: captureFile,
      })
      .from(workItemAttachment)
      .innerJoin(workItem, eq(workItem.id, workItemAttachment.workItemId))
      .innerJoin(
        knowledgeItem,
        eq(knowledgeItem.id, workItemAttachment.knowledgeItemId),
      )
      .innerJoin(
        captureFile,
        eq(captureFile.captureId, knowledgeItem.sourceCaptureId),
      )
      .where(
        and(
          eq(endpoint, endpointId),
          eq(workItemAttachment.state, "active"),
          anchor
            ? sql`(${workItemAttachment.createdAt}, ${workItemAttachment.id}) < (${anchor.createdAt}, ${query.cursor}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(workItemAttachment.createdAt), desc(workItemAttachment.id))
      .limit(query.limit + 1);
    const visible = rows.slice(0, query.limit);
    return {
      items: visible.map(({ attachment, work, document, file }) =>
        record(attachment, work, document, file),
      ),
      nextCursor:
        rows.length > query.limit
          ? (visible.at(-1)?.attachment.id ?? null)
          : null,
    };
  }

  return {
    async create(workItemId: string, knowledgeItemId: string) {
      return db.transaction(async (tx) => {
        const [work] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, workItemId))
          .limit(1);
        if (!work)
          throw new WorkAttachmentError("WORK_NOT_FOUND", "Task not found");
        const [document] = await tx
          .select()
          .from(knowledgeItem)
          .where(eq(knowledgeItem.id, knowledgeItemId))
          .for("share")
          .limit(1);
        if (!document)
          throw new WorkAttachmentError(
            "DOCUMENT_NOT_FOUND",
            "Knowledge item not found",
          );
        if (document.kind !== "document")
          throw new WorkAttachmentError(
            "DOCUMENT_REQUIRED",
            "Only original file documents can be attached to work",
          );
        const [context] =
          document.projectId !== work.projectId
            ? await tx
                .select()
                .from(knowledgeProjectLink)
                .where(
                  and(
                    eq(knowledgeProjectLink.knowledgeItemId, document.id),
                    eq(knowledgeProjectLink.projectId, work.projectId),
                    eq(knowledgeProjectLink.lifecycle, "active"),
                  ),
                )
                .limit(1)
            : [];
        if (document.projectId !== work.projectId && !context)
          throw new WorkAttachmentError(
            "CROSS_PROJECT",
            "Document must have active context in the task project",
          );
        const [file] = await tx
          .select()
          .from(captureFile)
          .where(eq(captureFile.captureId, document.sourceCaptureId))
          .limit(1);
        if (!file)
          throw new WorkAttachmentError(
            "DOCUMENT_REQUIRED",
            "Document has no preserved original file",
          );
        const [attachment] = await tx
          .insert(workItemAttachment)
          .values({
            id: crypto.randomUUID(),
            projectId: work.projectId,
            workItemId,
            knowledgeItemId,
            contextLinkId: context?.id ?? null,
          })
          .onConflictDoNothing()
          .returning();
        if (!attachment)
          throw new WorkAttachmentError(
            "ATTACHMENT_EXISTS",
            "Document is already attached to this task",
          );
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-user:unattributed",
          operation: "work_item_attachment.created",
          details: {
            attachmentId: attachment.id,
            projectId: work.projectId,
            workItemId,
            knowledgeItemId,
            contextLinkId: context?.id ?? null,
            sourceCaptureId: document.sourceCaptureId,
          },
        });
        return record(attachment, work, document, file);
      });
    },
    async listForWork(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [work] = await db
        .select({ id: workItem.id })
        .from(workItem)
        .where(eq(workItem.id, workItemId))
        .limit(1);
      if (!work)
        throw new WorkAttachmentError("WORK_NOT_FOUND", "Task not found");
      return list(workItemId, "work", query);
    },
    async listForKnowledge(
      knowledgeItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      const [document] = await db
        .select({ kind: knowledgeItem.kind })
        .from(knowledgeItem)
        .where(eq(knowledgeItem.id, knowledgeItemId))
        .limit(1);
      if (!document)
        throw new WorkAttachmentError(
          "DOCUMENT_NOT_FOUND",
          "Knowledge item not found",
        );
      if (document.kind !== "document")
        throw new WorkAttachmentError(
          "DOCUMENT_REQUIRED",
          "Only file documents have task attachments",
        );
      return list(knowledgeItemId, "knowledge", query);
    },
    async getById(id: string) {
      const joined = await joinedById(id);
      return joined
        ? record(joined.attachment, joined.work, joined.document, joined.file)
        : null;
    },
    async archive(id: string) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(workItemAttachment)
          .where(eq(workItemAttachment.id, id))
          .limit(1);
        if (!current)
          throw new WorkAttachmentError(
            "ATTACHMENT_NOT_FOUND",
            "Task attachment not found",
          );
        if (current.state === "archived")
          throw new WorkAttachmentError(
            "ATTACHMENT_ARCHIVED",
            "Task attachment is already archived",
          );
        const [attachment] = await tx
          .update(workItemAttachment)
          .set({ state: "archived", archivedAt: new Date() })
          .where(
            and(
              eq(workItemAttachment.id, id),
              eq(workItemAttachment.state, "active"),
            ),
          )
          .returning();
        if (!attachment)
          throw new WorkAttachmentError(
            "ATTACHMENT_ARCHIVED",
            "Task attachment is already archived",
          );
        const [work] = await tx
          .select()
          .from(workItem)
          .where(eq(workItem.id, attachment.workItemId))
          .limit(1);
        const [document] = await tx
          .select()
          .from(knowledgeItem)
          .where(eq(knowledgeItem.id, attachment.knowledgeItemId))
          .limit(1);
        const [file] = await tx
          .select()
          .from(captureFile)
          .where(eq(captureFile.captureId, document!.sourceCaptureId))
          .limit(1);
        await tx.insert(auditEvent).values({
          id: crypto.randomUUID(),
          actor: "local-user:unattributed",
          operation: "work_item_attachment.archived",
          details: {
            attachmentId: attachment.id,
            projectId: attachment.projectId,
            workItemId: attachment.workItemId,
            knowledgeItemId: attachment.knowledgeItemId,
          },
        });
        return record(attachment, work!, document!, file!);
      });
    },
  };
}
