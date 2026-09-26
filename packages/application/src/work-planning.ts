import type {
  ChangeWorkItemPlanningRequest,
  WorkItem,
  WorkItemPlanningEvent,
} from "@commandry/contracts";

export interface WorkPlanningPort {
  changePlanning(
    id: string,
    input: ChangeWorkItemPlanningRequest,
  ): Promise<WorkItem>;
  listPlanningEvents(
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ): Promise<{ items: WorkItemPlanningEvent[]; nextCursor: string | null }>;
  listUpcoming(query: {
    limit: number;
    cursor?: string | undefined;
  }): Promise<{ items: WorkItem[]; nextCursor: string | null }>;
}

export function createWorkPlanningService(port: WorkPlanningPort) {
  return {
    changePlanning: port.changePlanning,
    listPlanningEvents: port.listPlanningEvents,
    listUpcoming: port.listUpcoming,
  };
}
