import type {
  ChangeWorkItemStatusRequest,
  WorkItem,
  WorkItemStatusEvent,
} from "@commandry/contracts";

export interface WorkItemStatusPort {
  changeStatus(
    id: string,
    input: ChangeWorkItemStatusRequest,
  ): Promise<WorkItem>;
  listStatusEvents(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: WorkItemStatusEvent[]; nextCursor: string | null }>;
}

export function createWorkItemStatusService(port: WorkItemStatusPort) {
  return {
    changeStatus: port.changeStatus,
    listStatusEvents: port.listStatusEvents,
  };
}
