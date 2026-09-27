import type { WorkItemAttachment } from "@commandry/contracts";

export interface WorkAttachmentPort {
  create(
    workItemId: string,
    knowledgeItemId: string,
  ): Promise<WorkItemAttachment>;
  listForWork(
    workItemId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: WorkItemAttachment[]; nextCursor: string | null }>;
  listForKnowledge(
    knowledgeItemId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: WorkItemAttachment[]; nextCursor: string | null }>;
  getById(id: string): Promise<WorkItemAttachment | null>;
  archive(id: string): Promise<WorkItemAttachment>;
}

export function createWorkAttachmentService(port: WorkAttachmentPort) {
  return {
    create: port.create,
    listForWork: port.listForWork,
    listForKnowledge: port.listForKnowledge,
    getById: port.getById,
    archive: port.archive,
  };
}
