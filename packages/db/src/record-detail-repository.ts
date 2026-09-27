import { eq } from "drizzle-orm";
import type { CommandryDatabase } from "./client";
import { knowledgeItem, projectResourceLink, workItem } from "./schema";

export function createRecordDetailRepository(db: CommandryDatabase) {
  return {
    async getWorkItemById(id: string) {
      const [row] = await db
        .select()
        .from(workItem)
        .where(eq(workItem.id, id))
        .limit(1);
      return row
        ? {
            id: row.id,
            projectId: row.projectId,
            sourceCaptureId: row.sourceCaptureId,
            title: row.title,
            description: row.description,
            workType: row.workType,
            status: row.status,
            priority: row.priority,
            dueOn: row.dueOn,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }
        : null;
    },
    async getKnowledgeItemById(id: string) {
      const [row] = await db
        .select()
        .from(knowledgeItem)
        .where(eq(knowledgeItem.id, id))
        .limit(1);
      return row
        ? {
            id: row.id,
            projectId: row.projectId,
            sourceCaptureId: row.sourceCaptureId,
            kind: row.kind,
            title: row.title,
            content: row.content,
            url: row.url,
            version: row.version,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }
        : null;
    },
    async getProjectResourceLinkById(id: string) {
      const [row] = await db
        .select()
        .from(projectResourceLink)
        .where(eq(projectResourceLink.id, id))
        .limit(1);
      return row
        ? {
            id: row.id,
            projectId: row.projectId,
            resourceId: row.resourceId,
            type: row.type,
            lifecycle: row.lifecycle,
            createdAt: row.createdAt.toISOString(),
          }
        : null;
    },
  };
}
