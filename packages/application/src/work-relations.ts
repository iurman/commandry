import type {
  CreateWorkItemRelationRequest,
  WorkItemRelation,
} from "@commandry/contracts";
import { requireDistinctWorkRelation } from "@commandry/domain";

export interface WorkRelationsPort {
  create(input: CreateWorkItemRelationRequest): Promise<WorkItemRelation>;
  list(
    workItemId: string,
    query: {
      direction: "outgoing" | "incoming";
      limit: number;
      cursor?: string | undefined;
    },
  ): Promise<{ items: WorkItemRelation[]; nextCursor: string | null }>;
  archive(id: string): Promise<WorkItemRelation>;
  getById(id: string): Promise<WorkItemRelation | null>;
}

export function createWorkRelationsService(port: WorkRelationsPort) {
  return {
    async create(input: CreateWorkItemRelationRequest) {
      requireDistinctWorkRelation(
        input.sourceWorkItemId,
        input.targetWorkItemId,
      );
      return port.create(input);
    },
    list: port.list,
    archive: port.archive,
    getById: port.getById,
  };
}
