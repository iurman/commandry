import {
  listWorkItemCommentsResponseSchema,
  workItemCommentSchema,
  type WorkItemComment,
} from "@commandry/contracts";
import { normalizeWorkComment } from "@commandry/domain";

export interface WorkDiscussionPort {
  create(workItemId: string, body: string): Promise<WorkItemComment>;
  list(
    workItemId: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: WorkItemComment[]; nextCursor: string | null }>;
}

export function createWorkDiscussionService(port: WorkDiscussionPort) {
  return {
    async create(workItemId: string, body: string) {
      return workItemCommentSchema.parse(
        await port.create(workItemId, normalizeWorkComment(body)),
      );
    },
    async list(
      workItemId: string,
      query: { limit: number; cursor?: string | undefined },
    ) {
      return listWorkItemCommentsResponseSchema.parse(
        await port.list(workItemId, query),
      );
    },
  };
}
