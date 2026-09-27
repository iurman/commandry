import type {
  KnowledgeProjectAuditEvent,
  KnowledgeProjectConnection,
  KnowledgeProjectLink,
} from "@commandry/contracts";
import { KnowledgeProjectContextError } from "@commandry/domain";

type Page<T> = { items: T[]; nextCursor: string | null };
type Query = { limit: number; cursor?: string | undefined };

export interface KnowledgeProjectContextPort {
  getPrimaryProjectId(knowledgeItemId: string): Promise<string | null>;
  listLinks(
    knowledgeItemId: string,
    query: Query,
  ): Promise<Page<KnowledgeProjectConnection>>;
  link(
    knowledgeItemId: string,
    projectId: string,
  ): Promise<KnowledgeProjectConnection>;
  archiveLink(id: string): Promise<KnowledgeProjectLink>;
  getLink(id: string): Promise<KnowledgeProjectLink | null>;
  listAudit(
    knowledgeItemId: string,
    query: Query,
  ): Promise<Page<KnowledgeProjectAuditEvent>>;
}

export function createKnowledgeProjectContextService(
  port: KnowledgeProjectContextPort,
) {
  async function requireKnowledge(knowledgeItemId: string) {
    if (!(await port.getPrimaryProjectId(knowledgeItemId)))
      throw new KnowledgeProjectContextError(
        "KNOWLEDGE_NOT_FOUND",
        "Knowledge record not found",
      );
  }
  return {
    async listLinks(knowledgeItemId: string, query: Query) {
      await requireKnowledge(knowledgeItemId);
      return port.listLinks(knowledgeItemId, query);
    },
    link: port.link,
    archiveLink: port.archiveLink,
    getLink: port.getLink,
    async listAudit(knowledgeItemId: string, query: Query) {
      await requireKnowledge(knowledgeItemId);
      return port.listAudit(knowledgeItemId, query);
    },
  };
}
