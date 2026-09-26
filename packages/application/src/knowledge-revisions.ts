import type {
  KnowledgeItem,
  KnowledgeItemRevision,
  ReviseKnowledgeItemRequest,
} from "@commandry/contracts";

export interface KnowledgeRevisionsPort {
  revise(id: string, input: ReviseKnowledgeItemRequest): Promise<KnowledgeItem>;
  listRevisions(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: KnowledgeItemRevision[]; nextCursor: string | null }>;
}

export function createKnowledgeRevisionsService(port: KnowledgeRevisionsPort) {
  return { revise: port.revise, listRevisions: port.listRevisions };
}
