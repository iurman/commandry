import type {
  WorkProjectAuditEvent,
  WorkProjectConnection,
  WorkProjectLink,
} from "@commandry/contracts";
import { WorkProjectContextError } from "@commandry/domain";

type Page<T> = { items: T[]; nextCursor: string | null };
type Query = { limit: number; cursor?: string | undefined };

export interface WorkProjectContextPort {
  getPrimaryProjectId(workItemId: string): Promise<string | null>;
  listLinks(
    workItemId: string,
    query: Query,
  ): Promise<Page<WorkProjectConnection>>;
  link(workItemId: string, projectId: string): Promise<WorkProjectConnection>;
  archiveLink(id: string): Promise<WorkProjectLink>;
  getLink(id: string): Promise<WorkProjectLink | null>;
  listAudit(
    workItemId: string,
    query: Query,
  ): Promise<Page<WorkProjectAuditEvent>>;
}

export function createWorkProjectContextService(port: WorkProjectContextPort) {
  async function requireWork(workItemId: string) {
    if (!(await port.getPrimaryProjectId(workItemId)))
      throw new WorkProjectContextError(
        "WORK_NOT_FOUND",
        "Work record not found",
      );
  }
  return {
    async listLinks(workItemId: string, query: Query) {
      await requireWork(workItemId);
      return port.listLinks(workItemId, query);
    },
    link: port.link,
    archiveLink: port.archiveLink,
    getLink: port.getLink,
    async listAudit(workItemId: string, query: Query) {
      await requireWork(workItemId);
      return port.listAudit(workItemId, query);
    },
  };
}
